use std::process::Command;

pub struct DependencyStatus {
    pub available: bool,
}

fn check_dependency(bin: &str) -> DependencyStatus {
    let mut command = Command::new(bin);
    command.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let available = command
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    DependencyStatus { available }
}

pub struct Dependencies {
    pub ytdlp: DependencyStatus,
    pub ffmpeg: DependencyStatus,
}

pub fn check_dependencies(ytdlp_bin: &str, ffmpeg_bin: &str) -> Dependencies {
    Dependencies {
        ytdlp: check_dependency(ytdlp_bin),
        ffmpeg: check_dependency(ffmpeg_bin),
    }
}
