use thiserror::Error;

use crate::protocol::types::JsonRpcResponse;
use serde_json::Value;

#[derive(Debug, Error)]
pub enum GatewayError {
    #[error("upstream error: {0}")]
    Upstream(#[from] anyhow::Error),

    #[error("bad request: {0}")]
    BadRequest(String),
}

impl GatewayError {
    pub fn into_jsonrpc(self, id: Option<Value>) -> JsonRpcResponse {
        match self {
            GatewayError::BadRequest(message) => JsonRpcResponse::err(id, -32602, message),
            GatewayError::Upstream(error) => JsonRpcResponse::err(id, -32603, error.to_string()),
        }
    }
}
