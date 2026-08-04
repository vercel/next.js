use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::Vc;
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystem;
use turbopack_core::{
    compile_time_defines,
    compile_time_info::CompileTimeInfo,
    condition::ContextCondition,
    context::AssetContext,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    ident::Layer,
    resolve::options::{ImportMap, ImportMapping},
};
use turbopack_ecmascript::{TreeShakingMode, references::esm::UrlRewriteBehavior};
use turbopack_node::execution_context::ExecutionContext;
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::{
    ModuleAssetContext, externals_tracing_module_context,
    module_options::{EcmascriptOptionsContext, ModuleOptionsContext, TypescriptTransformOptions},
    transition::TransitionOptions,
};

#[turbo_tasks::function]
pub fn node_build_environment() -> Vc<Environment> {
    Environment::new(ExecutionEnvironment::NodeJsBuildTime(
        NodeJsEnvironment::default().resolved_cell(),
    ))
}

turbo_tasks::dual_fn! {
fn node_env_value(env: Vc<Box<dyn ProcessEnv>>) -> Result<RcStr> {
    if let Some(node_env) = &*turbo_tasks::read!(env.read(rcstr!("NODE_ENV")))? {
        Ok(node_env.clone())
    } else {
        Ok(rcstr!("development"))
    }
}
}

#[turbo_tasks::function]
pub async fn node_evaluate_asset_context(
    execution_context: Vc<ExecutionContext>,
    import_map: Option<Vc<ImportMap>>,
    transitions: Option<Vc<TransitionOptions>>,
    layer: Layer,
    ignore_dynamic_requests: bool,
) -> Result<Vc<Box<dyn AssetContext>>> {
    let mut import_map = if let Some(import_map) = import_map {
        turbo_tasks::read!(import_map.owned())?
    } else {
        ImportMap::empty()
    };
    import_map.insert_wildcard_alias(
        rcstr!("@vercel/turbopack-node/"),
        ImportMapping::PrimaryAlternative(
            rcstr!("./*"),
            Some(turbo_tasks::read!(
                turbopack_node::embed_js::embed_fs().root().owned()
            )?),
        )
        .resolved_cell(),
    );
    let import_map = import_map.resolved_cell();
    let node_env = turbo_tasks::read!(node_env_value(execution_context.env()))?;

    // base context used for node_modules (and context for app code will be derived
    // from this)
    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(turbo_tasks::read!(
            turbo_tasks::read!(execution_context.project_path())?
                .root()
                .owned()
        )?),
        enable_node_externals: true,
        enable_node_native_modules: true,
        custom_conditions: vec![node_env.clone(), rcstr!("node")],
        ..Default::default()
    };
    // app code context, includes a rule to switch to the node_modules context
    let resolve_options_context = ResolveOptionsContext {
        enable_typescript: true,
        import_map: Some(import_map),
        rules: vec![(
            ContextCondition::InNodeModules,
            resolve_options_context.clone().resolved_cell(),
        )],
        ..resolve_options_context
    }
    .cell();

    Ok(Vc::upcast(ModuleAssetContext::new(
        transitions.unwrap_or_default(),
        turbo_tasks::read!(
            CompileTimeInfo::builder(turbo_tasks::read!(node_build_environment().to_resolved())?)
                .defines(
                    compile_time_defines!(
                        process.turbopack = true,
                        process.env.NODE_ENV = node_env.into_owned(),
                        process.env.TURBOPACK = "1"
                    )
                    .resolved_cell(),
                )
                .cell()
        )?,
        ModuleOptionsContext {
            tree_shaking_mode: Some(TreeShakingMode::ReexportsOnly),
            ecmascript: EcmascriptOptionsContext {
                esm_url_rewrite_behavior: Some(UrlRewriteBehavior::Full),
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
        layer,
    )))
}

#[turbo_tasks::function]
pub async fn config_tracing_module_context(
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<Box<dyn AssetContext>>> {
    let node_env = turbo_tasks::read!(node_env_value(execution_context.env()))?;

    Ok(Vc::upcast(externals_tracing_module_context(
        turbo_tasks::read!(
            CompileTimeInfo::builder(turbo_tasks::read!(node_build_environment().to_resolved())?)
                .defines(
                    compile_time_defines!(
                        process.turbopack = true,
                        process.env.NODE_ENV = node_env.into_owned(),
                        process.env.TURBOPACK = "1"
                    )
                    .resolved_cell(),
                )
                .cell()
        )?,
        true,
    )))
}
