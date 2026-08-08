use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

pub struct ProcessOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Clone)]
pub struct ProcessHandle {
    child: Arc<Mutex<Child>>,
}

impl ProcessHandle {
    pub fn kill(&self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }
}

/// Spawns `bin` with `args`, streaming stdout line-by-line to `on_stdout_line`.
/// Returns a handle for cancellation plus a join handle that resolves once the
/// process exits (or is killed by `timeout`).
pub fn spawn_process<F, G>(
    bin: &str,
    args: &[String],
    timeout: Option<Duration>,
    mut on_stdout_line: F,
    mut on_stderr_line: G,
) -> Result<(ProcessHandle, JoinHandle<Result<ProcessOutput, String>>), String>
where
    F: FnMut(&str) + Send + 'static,
    G: FnMut(&str) + Send + 'static,
{
    let mut command = Command::new(bin);
    command.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let child = Arc::new(Mutex::new(child));
    let handle = ProcessHandle {
        child: Arc::clone(&child),
    };

    let timed_out = Arc::new(Mutex::new(false));
    let timeout_thread = timeout.map(|dur| {
        let child = Arc::clone(&child);
        let timed_out = Arc::clone(&timed_out);
        thread::spawn(move || {
            thread::sleep(dur);
            if let Ok(mut guard) = child.lock() {
                if matches!(guard.try_wait(), Ok(None)) {
                    *timed_out.lock().unwrap() = true;
                    let _ = guard.kill();
                }
            }
        })
    });

    let join = thread::spawn(move || -> Result<ProcessOutput, String> {
        let stderr_thread = thread::spawn(move || {
            let mut buf = String::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                buf.push_str(&line);
                buf.push('\n');
                on_stderr_line(&line);
            }
            buf
        });

        let mut stdout_buf = String::new();
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            stdout_buf.push_str(&line);
            stdout_buf.push('\n');
            on_stdout_line(&line);
        }

        let stderr_buf = stderr_thread.join().unwrap_or_default();
        let status = child.lock().unwrap().wait().map_err(|e| e.to_string())?;

        if let Some(t) = timeout_thread {
            let _ = t.join();
        }

        if *timed_out.lock().unwrap() {
            return Err(format!(
                "Tempo limite excedido ({}s)",
                timeout.unwrap().as_secs()
            ));
        }

        Ok(ProcessOutput {
            code: status.code().unwrap_or(-1),
            stdout: stdout_buf,
            stderr: stderr_buf,
        })
    });

    Ok((handle, join))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captures_stdout_and_exit_code() {
        let (_, join) = spawn_process(
            "sh",
            &["-c".to_string(), "echo hello; echo world".to_string()],
            None,
            |_| {},
            |_| {},
        )
        .unwrap();
        let output = join.join().unwrap().unwrap();
        assert_eq!(output.code, 0);
        assert!(output.stdout.contains("hello"));
        assert!(output.stdout.contains("world"));
    }

    #[test]
    fn reports_nonzero_exit_code_and_stderr() {
        let (_, join) = spawn_process(
            "sh",
            &["-c".to_string(), "echo oops 1>&2; exit 3".to_string()],
            None,
            |_| {},
            |_| {},
        )
        .unwrap();
        let output = join.join().unwrap().unwrap();
        assert_eq!(output.code, 3);
        assert!(output.stderr.contains("oops"));
    }

    #[test]
    fn kills_process_on_timeout() {
        let (_, join) = spawn_process(
            "sh",
            &["-c".to_string(), "sleep 5".to_string()],
            Some(Duration::from_millis(100)),
            |_| {},
            |_| {},
        )
        .unwrap();
        let result = join.join().unwrap();
        assert!(result.is_err());
    }

    #[test]
    fn cancel_kills_running_process() {
        let (handle, join) = spawn_process(
            "sh",
            &["-c".to_string(), "sleep 5".to_string()],
            None,
            |_| {},
            |_| {},
        )
        .unwrap();
        handle.kill();
        let output = join.join().unwrap().unwrap();
        assert_ne!(output.code, 0);
    }

    #[test]
    fn streams_stderr_lines_live() {
        let lines = Arc::new(Mutex::new(Vec::new()));
        let lines_clone = Arc::clone(&lines);
        let (_, join) = spawn_process(
            "sh",
            &["-c".to_string(), "echo oops 1>&2; echo again 1>&2".to_string()],
            None,
            |_| {},
            move |line: &str| lines_clone.lock().unwrap().push(line.to_string()),
        )
        .unwrap();
        join.join().unwrap().unwrap();
        assert_eq!(*lines.lock().unwrap(), vec!["oops", "again"]);
    }
}
