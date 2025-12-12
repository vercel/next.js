use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueDefault, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    condition::ContextCondition,
    environment::Environment,
    resolve::{
        options::{ImportMap, ResolvedMap},
        plugin::{AfterResolvePlugin, BeforeResolvePlugin},
    },
};

#[turbo_tasks::value(shared)]
#[derive(Default, Clone)]
pub struct ResolveOptionsContext {
    pub emulate_environment: Option<ResolvedVc<Environment>>,
    pub enable_types: bool,
    pub enable_typescript: bool,
    pub enable_react: bool,
    pub enable_node_native_modules: bool,
    // Enable resolving of .mjs files without the .mjs extension
    pub enable_mjs_extension: bool,
    /// Enable resolving of the node_modules folder when within the provided
    /// directory
    pub enable_node_modules: Option<FileSystemPath>,
    /// A specific path to a tsconfig.json file to use for resolving modules. If `None`, one will
    /// be looked up through the filesystem
    pub tsconfig_path: Option<FileSystemPath>,
    /// Mark well-known Node.js modules as external imports and load them using
    /// native `require`. e.g. url, querystring, os
    pub enable_node_externals: bool,
    /// Mark well-known Edge modules as external imports and load them using
    /// native `require`. e.g. buffer, events, assert
    pub enable_edge_node_externals: bool,
    /// Enables the "browser" field and export condition in package.json
    pub browser: bool,
    /// Enables the "module" field and export condition in package.json
    pub module: bool,
    pub custom_conditions: Vec<RcStr>,
    pub custom_extensions: Option<Vec<RcStr>>,
    /// An additional import map to use when resolving modules.
    ///
    /// If set, this import map will be applied to `ResolveOption::import_map`.
    /// It is always applied last, so any mapping defined within will take
    /// precedence over any other (e.g. tsconfig.json `compilerOptions.paths`).
    pub import_map: Option<ResolvedVc<ImportMap>>,
    /// An import map to fall back to when a request could not be resolved.
    ///
    /// If set, this import map will be applied to
    /// `ResolveOption::fallback_import_map`. It is always applied last, so
    /// any mapping defined within will take precedence over any other.
    pub fallback_import_map: Option<ResolvedVc<ImportMap>>,
    /// An additional resolved map to use after modules have been resolved.
    pub resolved_map: Option<ResolvedVc<ResolvedMap>>,
    /// A list of rules to use a different resolve option context for certain
    /// context paths. The first matching is used.
    pub rules: Vec<(ContextCondition, ResolvedVc<ResolveOptionsContext>)>,
    /// Plugins which get applied before and after resolving.
    pub after_resolve_plugins: Vec<ResolvedVc<Box<dyn AfterResolvePlugin>>>,
    pub before_resolve_plugins: Vec<ResolvedVc<Box<dyn BeforeResolvePlugin>>>,
    /// Warn instead of error for resolve errors
    pub loose_errors: bool,
    /// Collect affecting sources for each resolve result.  Useful for tracing.
    pub collect_affecting_sources: bool,

    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_impl]
impl ResolveOptionsContext {
    #[turbo_tasks::function]
    pub async fn with_types_enabled(self: Vc<Self>) -> Result<Vc<Self>> {
        let mut clone = self.owned().await?;
        clone.enable_types = true;
        clone.enable_typescript = true;
        Ok(Self::cell(clone))
    }

    /// Returns a new [Vc<ResolveOptionsContext>] with its import map extended
    /// to include the given import map.
    #[turbo_tasks::function]
    pub async fn with_extended_import_map(
        self: Vc<Self>,
        import_map: Vc<ImportMap>,
    ) -> Result<Vc<Self>> {
        let mut resolve_options_context = self.owned().await?;
        resolve_options_context.import_map = Some(
            resolve_options_context
                .import_map
                .map(|current_import_map| current_import_map.extend(import_map))
                .unwrap_or(import_map)
                .to_resolved()
                .await?,
        );
        Ok(resolve_options_context.cell())
    }

    /// Returns a new [Vc<ResolveOptionsContext>] with its fallback import map
    /// extended to include the given import map.
    #[turbo_tasks::function]
    pub async fn with_extended_fallback_import_map(
        self: Vc<Self>,
        fallback_import_map: Vc<ImportMap>,
    ) -> Result<Vc<Self>> {
        let mut resolve_options_context = self.owned().await?;
        resolve_options_context.fallback_import_map = Some(
            resolve_options_context
                .fallback_import_map
                .map(|current_fallback_import_map| {
                    current_fallback_import_map.extend(fallback_import_map)
                })
                .unwrap_or(fallback_import_map)
                .to_resolved()
                .await?,
        );
        Ok(resolve_options_context.cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueDefault for ResolveOptionsContext {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::cell(Default::default())
    }
}
