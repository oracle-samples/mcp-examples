use std::sync::Arc;

use anyhow::{anyhow, Context};
use reqwest::{header, Client};
use serde_json::{json, Value};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use crate::protocol::types::{
    Prompt, PromptsListResult, Resource, ResourcesListResult, Tool, ToolsListResult,
};

static PROTOCOL_VERSION: &str = "2025-06-18";

pub struct UpstreamClient {
    pub name: String,
    url: String,
    http: Client,
    // Capability cache
    pub tools: Arc<RwLock<Vec<Tool>>>,
    pub resources: Arc<RwLock<Vec<Resource>>>,
    pub prompts: Arc<RwLock<Vec<Prompt>>>,
}

impl UpstreamClient {
    pub fn new(name: String, url: String) -> Self {
        let http = Client::builder()
            .build()
            .expect("failed to build reqwest client");
        Self {
            name,
            url,
            http,
            tools: Arc::new(RwLock::new(Vec::new())),
            resources: Arc::new(RwLock::new(Vec::new())),
            prompts: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Full MCP handshake and capability fetch. Called once at startup.
    pub async fn initialize_and_cache(&self) -> anyhow::Result<()> {
        info!(upstream = %self.name, "initializing");

        self.handshake().await.context("initialize handshake")?;
        self.send_initialized_notification().await.context("notifications/initialized")?;
        let tools = self.fetch_tools().await.context("tools/list")?;
        let resources = self.fetch_resources().await.context("resources/list")?;
        let prompts = self.fetch_prompts().await.context("prompts/list")?;

        info!(
            upstream = %self.name,
            tools = tools.len(),
            resources = resources.len(),
            prompts = prompts.len(),
            "initialized"
        );

        *self.tools.write().await = tools;
        *self.resources.write().await = resources;
        *self.prompts.write().await = prompts;

        Ok(())
    }

    async fn handshake(&self) -> anyhow::Result<()> {
        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {
                    "name": "mcp-gateway",
                    "version": "0.1.0"
                }
            }
        });

        let resp = self
            .http
            .post(&self.url)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT, "application/json")
            .header("MCP-Protocol-Version", PROTOCOL_VERSION)
            .json(&request)
            .send()
            .await
            .context("POST initialize")?;
        let rpc_resp = self.parse_response(resp).await.context("parse initialize response")?;
        if let Some(error) = rpc_resp.get("error") {
            return Err(anyhow!("initialize error: {}", error));
        }
        if rpc_resp.get("result").is_none() {
            return Err(anyhow!("initialize response missing result"));
        }

        Ok(())
    }

    async fn send_initialized_notification(&self) -> anyhow::Result<()> {
        let notification = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });

        let resp = self.post_json(notification).await?;

        if resp.status() == reqwest::StatusCode::ACCEPTED || resp.status().is_success() {
            debug!(upstream = %self.name, "notifications/initialized acknowledged");
        } else {
            warn!(
                upstream = %self.name,
                status = %resp.status(),
                "unexpected status for notifications/initialized"
            );
        }

        Ok(())
    }

    async fn fetch_tools(&self) -> anyhow::Result<Vec<Tool>> {
        let req = self.build_request(2, "tools/list", None);
        let resp = self.post_json(req).await?;
        let rpc_resp = self.parse_response(resp).await?;
        Self::parse_tools_list_response(&rpc_resp)
    }

    async fn fetch_resources(&self) -> anyhow::Result<Vec<Resource>> {
        let req = self.build_request(3, "resources/list", None);
        let resp = self.post_json(req).await?;
        let rpc_resp = self.parse_response(resp).await?;
        Self::parse_resources_list_response(&rpc_resp)
    }

    async fn fetch_prompts(&self) -> anyhow::Result<Vec<Prompt>> {
        let req = self.build_request(4, "prompts/list", None);
        let resp = self.post_json(req).await?;
        let rpc_resp = self.parse_response(resp).await?;
        Self::parse_prompts_list_response(&rpc_resp)
    }

    /// Forward a JSON-RPC request to the upstream and return the response Value.
    pub async fn forward(&self, method: &str, params: Option<Value>, id: Option<Value>) -> anyhow::Result<Value> {
        let req_id = id.unwrap_or(json!(null));
        let mut body = json!({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method
        });
        if let Some(p) = params {
            body["params"] = p;
        }

        let resp = self.post_json(body).await?;
        self.parse_response(resp).await
    }

    fn build_request(&self, id: u64, method: &str, params: Option<Value>) -> Value {
        let mut req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method
        });
        if let Some(p) = params {
            req["params"] = p;
        }
        req
    }

    pub async fn post_json(&self, body: Value) -> anyhow::Result<reqwest::Response> {
        self
            .http
            .post(&self.url)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT, "application/json")
            .header("MCP-Protocol-Version", PROTOCOL_VERSION)
            .json(&body)
            .send()
            .await
            .context("HTTP POST to upstream")
    }

    async fn parse_response(&self, resp: reqwest::Response) -> anyhow::Result<Value> {
        let val: Value = resp.json().await.context("parse JSON response")?;
        Ok(val)
    }

    fn parse_tools_list_response(rpc_resp: &Value) -> anyhow::Result<Vec<Tool>> {
        if let Some(result) = rpc_resp.get("result") {
            let list: ToolsListResult = serde_json::from_value(result.clone())
                .context("deserialize tools/list result")?;
            return Ok(list.tools);
        }
        if let Some(err) = rpc_resp.get("error") {
            return Err(anyhow!("tools/list error: {}", err));
        }
        Ok(vec![])
    }

    fn parse_resources_list_response(rpc_resp: &Value) -> anyhow::Result<Vec<Resource>> {
        if let Some(result) = rpc_resp.get("result") {
            let list: ResourcesListResult = serde_json::from_value(result.clone())
                .context("deserialize resources/list result")?;
            return Ok(list.resources);
        }
        if let Some(err) = rpc_resp.get("error") {
            return Err(anyhow!("resources/list error: {}", err));
        }
        Ok(vec![])
    }

    fn parse_prompts_list_response(rpc_resp: &Value) -> anyhow::Result<Vec<Prompt>> {
        if let Some(result) = rpc_resp.get("result") {
            let list: PromptsListResult = serde_json::from_value(result.clone())
                .context("deserialize prompts/list result")?;
            return Ok(list.prompts);
        }
        if let Some(err) = rpc_resp.get("error") {
            return Err(anyhow!("prompts/list error: {}", err));
        }
        Ok(vec![])
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::UpstreamClient;

    #[tokio::test]
    async fn resources_list_error_is_not_silently_treated_as_empty() {
        let error = UpstreamClient::parse_resources_list_response(&json!({
            "jsonrpc": "2.0",
            "id": 3,
            "error": {
                "code": -32601,
                "message": "resources/list not supported"
            }
        }))
        .unwrap_err()
        .to_string();

        assert!(error.contains("resources/list"));
        assert!(error.contains("not supported"));
    }
}
