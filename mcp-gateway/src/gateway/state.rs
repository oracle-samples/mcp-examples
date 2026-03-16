use std::sync::Arc;

use crate::upstream::registry::UpstreamRegistry;

#[derive(Clone)]
pub struct GatewayState {
    pub registry: Arc<UpstreamRegistry>,
}

impl GatewayState {
    pub fn new(registry: Arc<UpstreamRegistry>) -> Self {
        Self { registry }
    }
}
