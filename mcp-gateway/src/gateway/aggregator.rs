use serde_json::{json, Value};

use crate::{
    error::GatewayError,
    protocol::types::{JsonRpcRequest, JsonRpcResponse, ToolCallParams, ResourceReadParams, PromptGetParams},
    upstream::registry::UpstreamRegistry,
};

/// Dispatch an inbound JSON-RPC request to the appropriate handler.
pub async fn dispatch(
    registry: &UpstreamRegistry,
    req: &JsonRpcRequest,
) -> Result<JsonRpcResponse, GatewayError> {
    match req.method.as_str() {
        "tools/list" => tools_list(registry, req.id.clone()).await,
        "tools/call" => tools_call(registry, req.id.clone(), req.params.clone()).await,
        "resources/list" => resources_list(registry, req.id.clone()).await,
        "resources/read" => resources_read(registry, req.id.clone(), req.params.clone()).await,
        "prompts/list" => prompts_list(registry, req.id.clone()).await,
        "prompts/get" => prompts_get(registry, req.id.clone(), req.params.clone()).await,
        "ping" => Ok(JsonRpcResponse::ok(req.id.clone(), json!({}))),
        _ => Ok(JsonRpcResponse::err(
            req.id.clone(),
            -32601,
            format!("method not found: {}", req.method),
        )),
    }
}

async fn tools_list(
    registry: &UpstreamRegistry,
    id: Option<Value>,
) -> Result<JsonRpcResponse, GatewayError> {
    let tools = registry.all_tools().await;
    Ok(JsonRpcResponse::ok(id, json!({ "tools": tools })))
}

async fn tools_call(
    registry: &UpstreamRegistry,
    id: Option<Value>,
    params: Option<Value>,
) -> Result<JsonRpcResponse, GatewayError> {
    let params_val = params.ok_or_else(|| GatewayError::BadRequest("tools/call requires params".into()))?;
    let call_params: ToolCallParams = serde_json::from_value(params_val.clone())
        .map_err(|e| GatewayError::BadRequest(format!("invalid tools/call params: {}", e)))?;

    let (client, original_name) = registry
        .client_for_tool(&call_params.name)
        .ok_or_else(|| {
            GatewayError::BadRequest(format!("unknown tool prefix in '{}'", call_params.name))
        })?;

    // Rewrite params with original (un-prefixed) tool name
    let upstream_params = json!({
        "name": original_name,
        "arguments": call_params.arguments
    });

    let resp = client
        .forward("tools/call", Some(upstream_params), id.clone())
        .await
        .map_err(GatewayError::Upstream)?;

    forward_response(id, resp)
}

async fn resources_list(
    registry: &UpstreamRegistry,
    id: Option<Value>,
) -> Result<JsonRpcResponse, GatewayError> {
    let resources = registry.all_resources().await;
    Ok(JsonRpcResponse::ok(id, json!({ "resources": resources })))
}

async fn resources_read(
    registry: &UpstreamRegistry,
    id: Option<Value>,
    params: Option<Value>,
) -> Result<JsonRpcResponse, GatewayError> {
    let params_val = params.ok_or_else(|| GatewayError::BadRequest("resources/read requires params".into()))?;
    let read_params: ResourceReadParams = serde_json::from_value(params_val.clone())
        .map_err(|e| GatewayError::BadRequest(format!("invalid resources/read params: {}", e)))?;

    let client = registry
        .client_for_resource(&read_params.uri)
        .await
        .ok_or_else(|| {
            GatewayError::BadRequest(format!("unknown resource URI '{}'", read_params.uri))
        })?;

    let resp = client
        .forward("resources/read", Some(params_val), id.clone())
        .await
        .map_err(GatewayError::Upstream)?;

    forward_response(id, resp)
}

async fn prompts_list(
    registry: &UpstreamRegistry,
    id: Option<Value>,
) -> Result<JsonRpcResponse, GatewayError> {
    let prompts = registry.all_prompts().await;
    Ok(JsonRpcResponse::ok(id, json!({ "prompts": prompts })))
}

async fn prompts_get(
    registry: &UpstreamRegistry,
    id: Option<Value>,
    params: Option<Value>,
) -> Result<JsonRpcResponse, GatewayError> {
    let params_val = params.ok_or_else(|| GatewayError::BadRequest("prompts/get requires params".into()))?;
    let get_params: PromptGetParams = serde_json::from_value(params_val.clone())
        .map_err(|e| GatewayError::BadRequest(format!("invalid prompts/get params: {}", e)))?;

    let (client, original_name) = registry
        .client_for_prompt(&get_params.name)
        .ok_or_else(|| {
            GatewayError::BadRequest(format!("unknown prompt prefix in '{}'", get_params.name))
        })?;

    // Rewrite params with original (un-prefixed) prompt name
    let upstream_params = json!({
        "name": original_name,
        "arguments": get_params.arguments
    });

    let resp = client
        .forward("prompts/get", Some(upstream_params), id.clone())
        .await
        .map_err(GatewayError::Upstream)?;

    forward_response(id, resp)
}

fn forward_response(id: Option<Value>, upstream: Value) -> Result<JsonRpcResponse, GatewayError> {
    if let Some(result) = upstream.get("result") {
        return Ok(JsonRpcResponse::ok(id, result.clone()));
    }
    if let Some(error) = upstream.get("error") {
        let code = error.get("code").and_then(Value::as_i64).unwrap_or(-32603);
        let message = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("upstream error")
            .to_string();
        return Ok(JsonRpcResponse::err(id, code, message));
    }
    Ok(JsonRpcResponse::err(id, -32603, "upstream returned invalid response"))
}
