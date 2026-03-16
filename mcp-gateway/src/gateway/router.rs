use axum::{
    routing::{get, post},
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::gateway::{
    handlers::{handle_health, handle_post},
    state::GatewayState,
};

pub fn build_router(state: GatewayState) -> Router {
    Router::new()
        .route("/mcp", post(handle_post))
        .route("/health", get(handle_health))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state)
}
