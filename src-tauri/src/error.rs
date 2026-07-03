use serde::Serialize;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation: Option<String>,
    pub retryable: bool,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            operation: None,
            retryable: false,
        }
    }

    pub fn operation(mut self, operation: impl Into<String>) -> Self {
        self.operation = Some(operation.into());
        self
    }

    pub fn retryable(mut self, retryable: bool) -> Self {
        self.retryable = retryable;
        self
    }

    pub fn io(operation: &'static str, error: impl Display) -> Self {
        eprintln!("{operation}: {error}");
        Self::new("io_error", "The desktop app could not access its data")
            .operation(operation)
            .retryable(true)
    }
}

impl Display for AppError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for AppError {}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        eprintln!("JSON serialization error: {error}");
        Self::new("invalid_data", "Stored data is not valid JSON").operation("json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_safe_command_error() {
        let error = AppError::new("path_not_approved", "Path is not approved")
            .operation("list_media_tree")
            .retryable(false);
        let json = serde_json::to_value(error).unwrap();
        assert_eq!(json["code"], "path_not_approved");
        assert_eq!(json["operation"], "list_media_tree");
        assert_eq!(json["retryable"], false);
    }
}
