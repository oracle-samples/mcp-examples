use std::{collections::{HashMap, HashSet}, sync::Arc};

use anyhow::anyhow;
use dashmap::DashMap;
use tracing::error;

use crate::{
    config::UpstreamConfig,
    protocol::types::{Prompt, Resource, Tool},
    upstream::client::UpstreamClient,
};

pub struct UpstreamRegistry {
    clients: DashMap<String, Arc<UpstreamClient>>,
}

impl UpstreamRegistry {
    pub fn new() -> Self {
        Self {
            clients: DashMap::new(),
        }
    }

    /// Connect to all upstreams concurrently and cache their capabilities.
    /// Any failure is fatal.
    pub async fn connect_all(configs: &[UpstreamConfig]) -> anyhow::Result<Arc<Self>> {
        let registry = Arc::new(Self::new());

        let mut handles = Vec::new();
        for cfg in configs {
            let client = Arc::new(UpstreamClient::new(cfg.name.clone(), cfg.url.clone()));
            registry.clients.insert(cfg.name.clone(), client.clone());

            let handle = tokio::spawn(async move {
                client.initialize_and_cache().await
            });
            handles.push((cfg.name.clone(), handle));
        }

        for (name, handle) in handles {
            match handle.await {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    error!(upstream = %name, error = %e, "upstream initialization failed");
                    return Err(anyhow!("upstream '{}' failed to initialize: {}", name, e));
                }
                Err(e) => {
                    error!(upstream = %name, error = %e, "upstream task panicked");
                    return Err(anyhow!("upstream '{}' task panicked: {}", name, e));
                }
            }
        }

        registry.validate_unique_resources().await?;

        Ok(registry)
    }

    /// Returns all tools from all upstreams, prefixed as `{upstream}__{name}`.
    pub async fn all_tools(&self) -> Vec<Tool> {
        let mut result = Vec::new();
        for entry in self.clients.iter() {
            let prefix = entry.key().clone();
            let tools = entry.value().tools.read().await;
            for tool in tools.iter() {
                let mut t = tool.clone();
                t.name = format!("{}__{}", prefix, tool.name);
                result.push(t);
            }
        }
        result
    }

    /// Returns all resources from all upstreams (URIs are assumed globally unique).
    pub async fn all_resources(&self) -> Vec<Resource> {
        let mut result = Vec::new();
        for entry in self.clients.iter() {
            let resources = entry.value().resources.read().await;
            result.extend(resources.iter().cloned());
        }
        result
    }

    /// Returns all prompts from all upstreams, prefixed as `{upstream}__{name}`.
    pub async fn all_prompts(&self) -> Vec<Prompt> {
        let mut result = Vec::new();
        for entry in self.clients.iter() {
            let prefix = entry.key().clone();
            let prompts = entry.value().prompts.read().await;
            for prompt in prompts.iter() {
                let mut p = prompt.clone();
                p.name = format!("{}__{}", prefix, prompt.name);
                result.push(p);
            }
        }
        result
    }

    /// Find the client responsible for a namespaced tool name (`{prefix}__{tool}`).
    pub fn client_for_tool(&self, namespaced: &str) -> Option<(Arc<UpstreamClient>, String)> {
        let (prefix, tool_name) = namespaced.split_once("__")?;
        let client = self.clients.get(prefix)?.clone();
        Some((client, tool_name.to_string()))
    }

    /// Find the client that owns a given resource URI.
    pub async fn client_for_resource(&self, uri: &str) -> Option<Arc<UpstreamClient>> {
        for entry in self.clients.iter() {
            let resources = entry.value().resources.read().await;
            let uris: HashSet<&str> = resources.iter().map(|r| r.uri.as_str()).collect();
            if uris.contains(uri) {
                return Some(entry.value().clone());
            }
        }
        None
    }

    /// Find the client responsible for a namespaced prompt name (`{prefix}__{prompt}`).
    pub fn client_for_prompt(&self, namespaced: &str) -> Option<(Arc<UpstreamClient>, String)> {
        let (prefix, prompt_name) = namespaced.split_once("__")?;
        let client = self.clients.get(prefix)?.clone();
        Some((client, prompt_name.to_string()))
    }

    async fn validate_unique_resources(&self) -> anyhow::Result<()> {
        let mut owners = HashMap::new();

        for entry in self.clients.iter() {
            let upstream = entry.key().clone();
            let resources = entry.value().resources.read().await;
            for resource in resources.iter() {
                if let Some(existing) = owners.insert(resource.uri.clone(), upstream.clone()) {
                    return Err(anyhow!(
                        "resource URI '{}' is advertised by both '{}' and '{}'",
                        resource.uri,
                        existing,
                        upstream
                    ));
                }
            }
        }

        Ok(())
    }
}

impl Default for UpstreamRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::UpstreamRegistry;
    use crate::{
        protocol::types::Resource,
        upstream::client::UpstreamClient,
    };

    #[tokio::test]
    async fn duplicate_resource_uris_are_rejected() {
        let registry = UpstreamRegistry::new();
        let left = Arc::new(UpstreamClient::new("left".into(), "http://left".into()));
        let right = Arc::new(UpstreamClient::new("right".into(), "http://right".into()));

        *left.resources.write().await = vec![Resource {
            uri: "file:///shared.txt".into(),
            name: "shared".into(),
            description: None,
            mime_type: None,
        }];
        *right.resources.write().await = vec![Resource {
            uri: "file:///shared.txt".into(),
            name: "shared".into(),
            description: None,
            mime_type: None,
        }];

        registry.clients.insert("left".into(), left);
        registry.clients.insert("right".into(), right);

        let error = registry.validate_unique_resources().await.unwrap_err().to_string();
        assert!(error.contains("file:///shared.txt"));
        assert!(error.contains("left"));
        assert!(error.contains("right"));
    }
}
