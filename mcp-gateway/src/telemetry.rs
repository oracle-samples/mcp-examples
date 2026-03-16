use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init(log_level: &str) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new(format!("mcp_gateway={log_level},tower_http=debug"))
    });

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer())
        .init();
}
