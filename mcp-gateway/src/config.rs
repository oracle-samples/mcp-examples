use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct GatewayConfig {
    pub gateway: GatewaySettings,
    #[serde(default)]
    pub upstreams: Vec<UpstreamConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GatewaySettings {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_log_level")]
    pub log_level: String,
}

fn default_host() -> String {
    "0.0.0.0".into()
}

fn default_port() -> u16 {
    3000
}

fn default_log_level() -> String {
    "info".into()
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpstreamConfig {
    pub name: String,
    pub url: String,
}

impl GatewayConfig {
    pub fn from_file(path: &str) -> anyhow::Result<Self> {
        let contents = std::fs::read_to_string(path)
            .map_err(|e| anyhow::anyhow!("failed to read config file '{}': {}", path, e))?;
        let config: GatewayConfig = toml::from_str(&contents)
            .map_err(|e| anyhow::anyhow!("failed to parse config file '{}': {}", path, e))?;
        Ok(config)
    }
}
