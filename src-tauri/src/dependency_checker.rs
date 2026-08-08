use std::process::Command;

pub struct DependencyStatus {
    pub available: bool,
}

fn check_dependency(bin: &str) -> DependencyStatus {
    let available = Command::new(bin)
        .arg("--version")
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
