use crate::format_parser::FormatOption;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub(super) struct DownloadProgress {
    pub id: String,
    pub percent: f64,
    pub speed: Option<String>,
    pub eta: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FormatsResult {
    pub formats: Vec<FormatOption>,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub uploader: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct DebugCommand {
    pub id: String,
    pub command: String,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct DebugLine {
    pub id: String,
    pub stream: &'static str,
    pub text: String,
}

/// Resultado final de um download, emitido no evento "download-finished".
#[derive(Debug, Serialize, Clone)]
pub(super) struct DownloadFinished {
    pub id: String,
    pub status: &'static str, // "done" | "failed" | "cancelled"
    /// Pasta de destino (o que "Abrir pasta" abre).
    pub path: Option<String>,
    /// Arquivo final baixado (na playlist, o último) — base da conversão de codec.
    #[serde(rename = "filePath")]
    pub file_path: Option<String>,
    pub error: Option<String>,
}
