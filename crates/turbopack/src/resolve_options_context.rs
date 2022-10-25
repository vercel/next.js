use anyhow::Result;
use turbopack_core::{
    environment::EnvironmentVc,
    resolve::options::{ImportMapVc, ResolvedMapVc},
};

#[turbo_tasks::value(shared)]
#[derive(Default, Clone)]
pub struct ResolveOptionsContext {
    pub emulate_environment: Option<EnvironmentVc>,
    pub enable_typescript: bool,
    pub enable_react: bool,
    pub enable_node_native_modules: bool,
    pub enable_node_modules: bool,
    /// Mark well-known Node.js modules as external imports and load them using
    /// native `require`. e.g. url, querystring, os
    pub enable_node_externals: bool,
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
    /// An import map to fall back to when a request could not be resolved.
    ///
    /// If set, this import map will be applied to
    /// `ResolveOption::fallback_import_map`. It is always applied last, so
    /// any mapping defined within will take precedence over any other.
    pub fallback_import_map: Option<ImportMapVc>,
    /// An additional resolved map to use after modules have been resolved.
    pub resolved_map: Option<ResolvedMapVc>,
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

    /// Returns a new [ResolveOptionsContextVc] with its fallback import map
    /// extended to include the given import map.
    #[turbo_tasks::function]
    pub async fn with_extended_fallback_import_map(
        self,
        fallback_import_map: ImportMapVc,
    ) -> Result<Self> {
        let mut resolve_options_context = self.await?.clone_value();
        resolve_options_context.fallback_import_map = Some(
            resolve_options_context
                .fallback_import_map
                .map(|current_fallback_import_map| {
                    current_fallback_import_map.extend(fallback_import_map)
                })
                .unwrap_or(fallback_import_map),
        );
        Ok(resolve_options_context.into())
    }
}

impl Default for ResolveOptionsContextVc {
    fn default() -> Self {
        Self::default()
    }
}
