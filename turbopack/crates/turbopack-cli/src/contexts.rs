use std::fmt;

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileSystem, FileSystemPath};
use turbopack::{
    ModuleAssetContext,
    ecmascript::TreeShakingMode,
    module_options::{
        EcmascriptOptionsContext, JsxTransformOptions, ModuleOptionsContext,
        TypescriptTransformOptions,
    },
};
use turbopack_browser::react_refresh::assert_can_resolve_react_refresh;
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

fn foreign_code_context_condition() -> ContextCondition {
    ContextCondition::InDirectory("node_modules".to_string())
}

#[turbo_tasks::function]
pub async fn get_client_import_map(project_path: FileSystemPath) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    import_map.insert_singleton_alias(rcstr!("@swc/helpers"), project_path.clone());
    import_map.insert_singleton_alias(rcstr!("styled-jsx"), project_path.clone());
    import_map.insert_singleton_alias(rcstr!("react"), project_path.clone());
    import_map.insert_singleton_alias(rcstr!("react-dom"), project_path.clone());

    import_map.insert_wildcard_alias(
        rcstr!("@vercel/turbopack-ecmascript-runtime/"),
        ImportMapping::PrimaryAlternative(
            rcstr!("./*"),
            Some(
                turbopack_ecmascript_runtime::embed_fs()
                    .root()
                    .owned()
                    .await?,
            ),
        )
        .resolved_cell(),
    );

    Ok(import_map.cell())
}

#[turbo_tasks::function]
pub async fn get_client_resolve_options_context(
    project_path: FileSystemPath,
    node_env: Vc<NodeEnv>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_client_import_map = get_client_import_map(project_path.clone())
        .to_resolved()
        .await?;
    let module_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().owned().await?),
        custom_conditions: vec![node_env.await?.to_string().into(), rcstr!("browser")],
        import_map: Some(next_client_import_map),
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
    project_path: FileSystemPath,
    execution_context: ResolvedVc<ExecutionContext>,
    env: ResolvedVc<Environment>,
    node_env: Vc<NodeEnv>,
    source_maps_type: SourceMapsType,
) -> Result<Vc<ModuleOptionsContext>> {
    let is_dev = matches!(*node_env.await?, NodeEnv::Development);
    let module_options_context = ModuleOptionsContext {
        environment: Some(env),
        execution_context: Some(execution_context),
        tree_shaking_mode: Some(TreeShakingMode::ReexportsOnly),
        keep_last_successful_parse: is_dev,
        ..Default::default()
    };

    let resolve_options_context =
        get_client_resolve_options_context(project_path.clone(), node_env);

    let enable_react_refresh = is_dev
        && assert_can_resolve_react_refresh(project_path.clone(), resolve_options_context)
            .await?
            .is_found();

    let enable_jsx = Some(
        JsxTransformOptions {
            react_refresh: enable_react_refresh,
            ..Default::default()
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
) -> Vc<Box<dyn AssetContext>> {
    let resolve_options_context =
        get_client_resolve_options_context(project_path.clone(), node_env);
    let module_options_context = get_client_module_options_context(
        project_path,
        execution_context,
        compile_time_info.environment(),
        node_env,
        source_maps_type,
    );

    let asset_context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        Default::default(),
        compile_time_info,
        module_options_context,
        resolve_options_context,
        Layer::new_with_user_friendly_name(rcstr!("client"), rcstr!("Pages Router Client")),
    ));

    asset_context
}

fn client_defines(node_env: &NodeEnv) -> CompileTimeDefines {
    compile_time_defines!(
        process.turbopack = true,
        process.env.TURBOPACK = true,
        process.env.NODE_ENV = node_env.to_string()
    )
}

#[turbo_tasks::function]
pub async fn get_client_compile_time_info(
    browserslist_query: RcStr,
    node_env: Vc<NodeEnv>,
) -> Result<Vc<CompileTimeInfo>> {
    let node_env = node_env.await?;
    CompileTimeInfo::builder(
        Environment::new(ExecutionEnvironment::Browser(
            BrowserEnvironment {
                dom: true,
                web_worker: false,
                service_worker: false,
                browserslist_query,
            }
            .resolved_cell(),
        ))
        .to_resolved()
        .await?,
    )
    .defines(client_defines(&node_env).resolved_cell())
    .free_var_references(
        free_var_references!(..client_defines(&node_env).into_iter()).resolved_cell(),
    )
    .cell()
    .await
}
