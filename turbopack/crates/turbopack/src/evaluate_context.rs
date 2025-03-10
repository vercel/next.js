use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{Value, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystem;
use turbopack_core::{
    compile_time_defines,
    compile_time_info::CompileTimeInfo,
    condition::ContextCondition,
    context::AssetContext,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    resolve::options::{ImportMap, ImportMapping},
};
use turbopack_ecmascript::TreeShakingMode;
use turbopack_node::execution_context::ExecutionContext;
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::{
    module_options::{EcmascriptOptionsContext, ModuleOptionsContext, TypescriptTransformOptions},
    transition::TransitionOptions,
    ModuleAssetContext,
};

#[turbo_tasks::function]
pub fn node_build_environment() -> Vc<Environment> {
    Environment::new(Value::new(ExecutionEnvironment::NodeJsBuildTime(
        NodeJsEnvironment::default().resolved_cell(),
    )))
}

#[turbo_tasks::function]
pub async fn node_evaluate_asset_context(
    execution_context: Vc<ExecutionContext>,
    import_map: Option<Vc<ImportMap>>,
    transitions: Option<Vc<TransitionOptions>>,
    layer: RcStr,
    ignore_dynamic_requests: bool,
) -> Result<Vc<Box<dyn AssetContext>>> {
    let mut import_map = if let Some(import_map) = import_map {
        import_map.owned().await?
    } else {
        ImportMap::empty()
    };
    import_map.insert_wildcard_alias(
        "@vercel/turbopack-node/",
        ImportMapping::PrimaryAlternative(
            "./*".into(),
            Some(
                turbopack_node::embed_js::embed_fs()
                    .root()
                    .to_resolved()
                    .await?,
            ),
        )
        .resolved_cell(),
    );
    let import_map = import_map.resolved_cell();
    let node_env: RcStr =
        if let Some(node_env) = &*execution_context.env().read("NODE_ENV".into()).await? {
            node_env.as_str().into()
        } else {
            "development".into()
        };

    // base context used for node_modules (and context for app code will be derived
    // from this)
    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(
            execution_context
                .project_path()
                .root()
                .to_resolved()
                .await?,
        ),
        enable_node_externals: true,
        enable_node_native_modules: true,
        custom_conditions: vec![node_env.clone(), "node".into()],
        ..Default::default()
    };
    // app code context, includes a rule to switch to the node_modules context
    let resolve_options_context = ResolveOptionsContext {
        enable_typescript: true,
        import_map: Some(import_map),
        rules: vec![(
            ContextCondition::InDirectory("node_modules".to_string()),
            resolve_options_context.clone().resolved_cell(),
        )],
        ..resolve_options_context
    }
    .cell();

    Ok(Vc::upcast(ModuleAssetContext::new(
        transitions.unwrap_or_default(),
        CompileTimeInfo::builder(node_build_environment().to_resolved().await?)
            .defines(
                compile_time_defines!(
                    process.turbopack = true,
                    process.env.NODE_ENV = node_env.into_owned(),
                    process.env.TURBOPACK = true
                )
                .resolved_cell(),
            )
            .cell()
            .await?,
        ModuleOptionsContext {
            tree_shaking_mode: Some(TreeShakingMode::ReexportsOnly),
            ecmascript: EcmascriptOptionsContext {
                enable_typescript_transform: Some(
                    TypescriptTransformOptions::default().resolved_cell(),
                ),
                ignore_dynamic_requests,
                ..Default::default()
            },
            ..Default::default()
        }
        .cell(),
        resolve_options_context,
        Vc::cell(layer),
    )))
}
