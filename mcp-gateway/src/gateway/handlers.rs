use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use tracing::debug;

use crate::{
    error::GatewayError,
    gateway::{aggregator, state::GatewayState},
    protocol::types::{
        InitializeResult, JsonRpcRequest, JsonRpcResponse, PromptsCapability, ResourcesCapability,
        ServerCapabilities, ServerInfo, ToolsCapability,
    },
};

/// `POST /mcp`
pub async fn handle_post(
    State(state): State<GatewayState>,
    Json(req): Json<JsonRpcRequest>,
) -> Response {
    debug!(method = %req.method, id = ?req.id, "POST /mcp");

    if req.method == "initialize" {
        let result = InitializeResult {
            protocol_version: "2025-06-18".into(),
            capabilities: ServerCapabilities {
                tools: Some(ToolsCapability {
                    list_changed: Some(false),
                }),
                resources: Some(ResourcesCapability {
                    list_changed: Some(false),
                    subscribe: Some(false),
                }),
                prompts: Some(PromptsCapability {
                    list_changed: Some(false),
                }),
            },
            server_info: ServerInfo {
                name: "mcp-gateway".into(),
                version: env!("CARGO_PKG_VERSION").into(),
            },
        };

        let rpc_resp = match serde_json::to_value(&result) {
            Ok(value) => JsonRpcResponse::ok(req.id.clone(), value),
            Err(error) => GatewayError::Upstream(error.into()).into_jsonrpc(req.id.clone()),
        };
        return (StatusCode::OK, Json(rpc_resp)).into_response();
    }

    if req.method == "notifications/initialized" && req.id.is_none() {
        debug!("notifications/initialized → 202");
        return StatusCode::ACCEPTED.into_response();
    }

    let rpc_resp = match aggregator::dispatch(&state.registry, &req).await {
        Ok(response) => response,
        Err(error) => error.into_jsonrpc(req.id.clone()),
    };
    (StatusCode::OK, Json(rpc_resp)).into_response()
}

/// `GET /health`
pub async fn handle_health() -> impl IntoResponse {
    Json(json!({ "status": "ok" }))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::{body::to_bytes, http::StatusCode, Json};
    use serde_json::{json, Value};

    use super::handle_post;
    use crate::{
        gateway::state::GatewayState,
        protocol::types::JsonRpcRequest,
        upstream::registry::UpstreamRegistry,
    };

    #[tokio::test]
    async fn bad_request_is_returned_as_jsonrpc_error() {
        let state = GatewayState::new(Arc::new(UpstreamRegistry::new()));
        let request = JsonRpcRequest {
            jsonrpc: "2.0".into(),
            id: Some(json!(7)),
            method: "tools/call".into(),
            params: Some(json!({ "name": "missing__tool", "arguments": {} })),
        };

        let response = handle_post(axum::extract::State(state), Json(request)).await;

        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(payload["jsonrpc"], "2.0");
        assert_eq!(payload["id"], 7);
        assert_eq!(payload["error"]["code"], -32602);
        assert!(payload["error"]["message"]
            .as_str()
            .unwrap()
            .contains("unknown tool prefix"));
    }
}
