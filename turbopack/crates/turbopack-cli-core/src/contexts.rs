//! Client asset context, module/resolve options, and compile-time info for the standalone
//! CLI. Browser target only: there is no server/SSR context and no dev-server wiring here yet.

use std::fmt;

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::{
    ModuleAssetContext,
    module_options::{
        EcmascriptOptionsContext, JsxTransformOptions, ModuleOptionsContext,
        TypescriptTransformOptions,
    },
};
use turbopack_core::{
    chunk::SourceMapsType,
    compile_time_defines,
    compile_time_info::{CompileTimeDefines, CompileTimeInfo},
    condition::ContextCondition,
    context::AssetContext,
    environment::{BrowserEnvironment, Environment, ExecutionEnvironment},
    free_var_references,
    ident::Layer,
    resolve::options::{ImportMap, ImportMapping},
};
use turbopack_node::{
    execution_context::ExecutionContext, transforms::postcss::PostCssTransformOptions,
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

#[turbo_tasks::value(shared)]
pub enum NodeEnv {
    Development,
    Production,
}

impl fmt::Display for NodeEnv {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NodeEnv::Development => f.write_str("development"),
            NodeEnv::Production => f.write_str("production"),
        }
    }
}

/// Default browser target. Deliberately modern: an empty query would resolve to browserslist's
/// defaults and pull in downleveling (and `@swc/helpers`) that a modern app does not want.
pub const DEFAULT_BROWSERSLIST_QUERY: &str =
    "last 1 Chrome versions, last 1 Firefox versions, last 1 Safari versions, last 1 Edge versions";

fn foreign_code_context_condition() -> ContextCondition {
    ContextCondition::InNodeModules
}

#[turbo_tasks::function]
async fn get_client_import_map(
    project_path: FileSystemPath,
    alias: Vec<(RcStr, RcStr)>,
) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    import_map.insert_singleton_alias(rcstr!("@swc/helpers"), project_path.clone());
    import_map.insert_singleton_alias(rcstr!("styled-jsx"), project_path.clone());
    import_map.insert_singleton_alias(rcstr!("react"), project_path.clone());
    import_map.insert_singleton_alias(rcstr!("react-dom"), project_path.clone());
    // Force `react-refresh` to resolve to the user's own peer dependency (matching their
    // React), not to any copy the tool might carry.
    import_map.insert_singleton_alias(rcstr!("react-refresh"), project_path.clone());

    // User-configured resolve aliases (`turbopack.config.ts` `alias`). For each `key → target`
    // we add an exact alias (`import "@"`) plus a `<key>/*` wildcard (`import "@/x"`), mirroring
    // `insert_singleton_alias`'s shape, so both bare and subpath imports resolve. The target is
    // resolved relative to the project root, so `"./src"` / `"src"` both work.
    for (key, target) in &alias {
        let key = key.trim_end_matches("/*").trim_end_matches('*');
        let target = target.trim_end_matches("/*").trim_end_matches('*');
        import_map.insert_exact_alias(
            RcStr::from(key),
            ImportMapping::PrimaryAlternative(RcStr::from(target), Some(project_path.clone()))
                .resolved_cell(),
        );
        import_map.insert_wildcard_alias(
            RcStr::from(format!("{key}/")),
            ImportMapping::PrimaryAlternative(
                RcStr::from(format!("{target}/*")),
                Some(project_path.clone()),
            )
            .resolved_cell(),
        );
    }

    Ok(import_map.cell())
}

#[turbo_tasks::function]
async fn get_client_resolve_options_context(
    project_path: FileSystemPath,
    node_env: Vc<NodeEnv>,
    alias: Vec<(RcStr, RcStr)>,
) -> Result<Vc<ResolveOptionsContext>> {
    let client_import_map = get_client_import_map(project_path.clone(), alias)
        .to_resolved()
        .await?;
    let module_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().owned().await?),
        custom_conditions: vec![node_env.await?.to_string().into(), rcstr!("browser")],
        import_map: Some(client_import_map),
        browser: true,
        module: true,
        ..Default::default()
    };
    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        rules: vec![(
            foreign_code_context_condition(),
            module_options_context.clone().resolved_cell(),
        )],
        ..module_options_context
    }
    .cell())
}

#[turbo_tasks::function]
async fn get_client_module_options_context(
    execution_context: ResolvedVc<ExecutionContext>,
    env: ResolvedVc<Environment>,
    source_maps_type: SourceMapsType,
) -> Result<Vc<ModuleOptionsContext>> {
    let module_options_context = ModuleOptionsContext {
        environment: Some(env),
        execution_context: Some(execution_context),
        follow_reexports: true,
        keep_last_successful_parse: false,
        ..Default::default()
    };

    // Automatic JSX runtime (no `import React`)
    let enable_jsx = Some(
        JsxTransformOptions {
            development: false,
            react_refresh: false,
            runtime: Some(rcstr!("automatic")),
            import_source: None,
        }
        .resolved_cell(),
    );

    let module_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_jsx,
            enable_typescript_transform: Some(
                TypescriptTransformOptions::default().resolved_cell(),
            ),
            source_maps: source_maps_type,
            ..module_options_context.ecmascript.clone()
        },
        enable_postcss_transform: Some(PostCssTransformOptions::default().resolved_cell()),
        enable_webpack_loaders: None,
        rules: vec![(
            foreign_code_context_condition(),
            module_options_context.clone().resolved_cell(),
        )],
        ..module_options_context
    }
    .cell();

    Ok(module_options_context)
}

#[turbo_tasks::function]
pub fn get_client_asset_context(
    project_path: FileSystemPath,
    execution_context: Vc<ExecutionContext>,
    compile_time_info: Vc<CompileTimeInfo>,
    node_env: Vc<NodeEnv>,
    source_maps_type: SourceMapsType,
    alias: Vec<(RcStr, RcStr)>,
) -> Vc<Box<dyn AssetContext>> {
    let resolve_options_context =
        get_client_resolve_options_context(project_path.clone(), node_env, alias);
    let module_options_context = get_client_module_options_context(
        execution_context,
        compile_time_info.environment(),
        source_maps_type,
    );

    let asset_context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        Default::default(),
        compile_time_info,
        module_options_context,
        resolve_options_context,
        Layer::new_with_user_friendly_name(rcstr!("client"), rcstr!("Web Client")),
    ));

    asset_context
}

/// Compile-time constant substitutions for the browser bundle. Hardcoded to the production
/// values for now; a later change threads the user's own `define` entries through here.
fn client_defines() -> CompileTimeDefines {
    compile_time_defines!(
        process.turbopack = true,
        process.env.TURBOPACK = "1",
        process.env.NODE_ENV = "production"
    )
}

#[turbo_tasks::function]
pub async fn get_client_compile_time_info() -> Result<Vc<CompileTimeInfo>> {
    let defines = client_defines();
    CompileTimeInfo::builder(
        Environment::new(ExecutionEnvironment::Browser(
            BrowserEnvironment {
                dom: true,
                web_worker: false,
                service_worker: false,
                // TODO: support this in config.
                // Must not be empty: browserslist reads an empty query as its *defaults*
                // (old browsers), which makes SWC downlevel aggressively and emit
                // `@swc/helpers` imports the project has no reason to depend on.
                browserslist_query: RcStr::from(DEFAULT_BROWSERSLIST_QUERY),
            }
            .resolved_cell(),
        ))
        .to_resolved()
        .await?,
    )
    .defines(defines.clone().resolved_cell())
    .free_var_references(free_var_references!(..defines.into_iter()).resolved_cell())
    .cell()
    .await
}
