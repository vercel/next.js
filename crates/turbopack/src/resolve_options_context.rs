use anyhow::Result;
use turbopack_core::{environment::EnvironmentVc, resolve::options::ImportMapVc};

#[turbo_tasks::value(shared)]
#[derive(Default, Clone)]
pub struct ResolveOptionsContext {
    pub emulate_environment: Option<EnvironmentVc>,
    pub enable_typescript: bool,
    pub enable_react: bool,
    pub enable_node_native_modules: bool,
    pub enable_node_modules: bool,
    /// Enables the "browser" field and export condition in package.json
    pub browser: bool,
    /// Enables the "module" field and export condition in package.json
    pub module: bool,
    pub custom_conditions: Vec<String>,
    /// An additional import map to use when resolving modules.
    ///
    /// If set, this import map will be applied to `ResolveOption::import_map`.
    /// It is always applied last, so any mapping defined within will take
    /// precedence over any other (e.g. tsconfig.json `compilerOptions.paths`).
    pub import_map: Option<ImportMapVc>,
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

    /// Returns a new [ResolveOptionsContextVc] with its import map extended to
    /// include the given import map.
    #[turbo_tasks::function]
    pub async fn with_extended_import_map(self, import_map: ImportMapVc) -> Result<Self> {
        let mut resolve_options_context = self.await?.clone_value();
        resolve_options_context.import_map = Some(
            resolve_options_context
                .import_map
                .map(|current_import_map| current_import_map.extend(import_map))
                .unwrap_or(import_map),
        );
        Ok(resolve_options_context.into())
    }
}

impl Default for ResolveOptionsContextVc {
    fn default() -> Self {
        Self::default()
    }
}
