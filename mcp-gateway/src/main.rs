use std::net::SocketAddr;

use clap::Parser;
use tracing::info;

mod config;
mod error;
mod gateway;
mod protocol;
mod telemetry;
mod upstream;

use config::GatewayConfig;
use gateway::{router::build_router, state::GatewayState};
use upstream::registry::UpstreamRegistry;

#[derive(Parser, Debug)]
#[command(name = "mcp-gateway", about = "MCP aggregator gateway")]
struct Cli {
    /// Path to config file
    #[arg(short, long, env = "MCP_GATEWAY_CONFIG", default_value = "config.toml")]
    config: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let cfg = GatewayConfig::from_file(&cli.config)?;

    telemetry::init(&cfg.gateway.log_level);

    info!(
        host = %cfg.gateway.host,
        port = cfg.gateway.port,
        upstreams = cfg.upstreams.len(),
        "mcp-gateway starting"
    );

    // Connect to all upstreams and build capability cache
    let registry = UpstreamRegistry::connect_all(&cfg.upstreams).await?;

    let state = GatewayState::new(registry);
    let router = build_router(state);

    let addr: SocketAddr = format!("{}:{}", cfg.gateway.host, cfg.gateway.port)
        .parse()
        .map_err(|e| anyhow::anyhow!("invalid address: {}", e))?;

    info!(%addr, "listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("mcp-gateway stopped");
    Ok(())
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("failed to install Ctrl+C handler");
    info!("shutdown signal received");
}
