use anyhow::Result;
use turbopack_core::environment::EnvironmentVc;

#[turbo_tasks::value(shared)]
#[derive(Default, Clone)]
pub struct ResolveOptionsContext {
    pub emulate_environment: Option<EnvironmentVc>,
    pub enable_typescript: bool,
    pub enable_react: bool,
    pub enable_node_native_modules: bool,
    pub enable_node_modules: bool,
    pub custom_conditions: Vec<String>,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_impl]
impl ResolveOptionsContextVc {
    #[turbo_tasks::function]
    pub fn default() -> Self {
        Self::cell(Default::default())
    }

    #[turbo_tasks::function]
    pub async fn with_typescript_enabled(self) -> Result<Self> {
        let mut clone = self.await?.clone_value();
        clone.enable_typescript = true;
        Ok(Self::cell(clone))
    }
}

impl Default for ResolveOptionsContextVc {
    fn default() -> Self {
        Self::default()
    }
}
