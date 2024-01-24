use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::{Value, Vc};
use turbopack_binding::{
    turbo::{tasks_env::EnvMap, tasks_fs::FileSystemPath},
    turbopack::{
        core::{
            compile_time_info::{
                CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, FreeVarReference,
                FreeVarReferences,
            },
            environment::{EdgeWorkerEnvironment, Environment, ExecutionEnvironment, ServerAddr},
            free_var_references,
        },
        dev::DevChunkingContext,
        ecmascript::chunk::EcmascriptChunkingContext,
        node::{debug::should_debug, execution_context::ExecutionContext},
        turbopack::resolve_options_context::ResolveOptionsContext,
    },
};

use crate::{
    mode::NextMode,
    next_config::NextConfig,
    next_import_map::get_next_edge_import_map,
    next_server::context::ServerContextType,
    next_shared::resolve::{
        ModuleFeatureReportResolvePlugin, NextSharedRuntimeResolvePlugin,
        UnsupportedModulesResolvePlugin,
    },
    util::foreign_code_context_condition,
};

fn defines(define_env: &IndexMap<String, String>) -> CompileTimeDefines {
    let mut defines = IndexMap::new();

    for (k, v) in define_env {
        defines
            .entry(k.split('.').map(|s| s.to_string()).collect::<Vec<String>>())
            .or_insert_with(|| {
                let val = serde_json::from_str(v);
                match val {
                    Ok(serde_json::Value::Bool(v)) => CompileTimeDefineValue::Bool(v),
                    Ok(serde_json::Value::String(v)) => CompileTimeDefineValue::String(v),
                    _ => CompileTimeDefineValue::JSON(v.clone()),
                }
            });
    }

    CompileTimeDefines(defines)
}

#[turbo_tasks::function]
async fn next_edge_defines(define_env: Vc<EnvMap>) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(&*define_env.await?).cell())
}

#[turbo_tasks::function]
async fn next_edge_free_vars(
    project_path: Vc<FileSystemPath>,
    define_env: Vc<EnvMap>,
) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(
        ..defines(&*define_env.await?).into_iter(),
        Buffer = FreeVarReference::EcmaScriptModule {
            request: "next/dist/compiled/buffer".to_string(),
            lookup_path: Some(project_path),
            export: Some("Buffer".to_string()),
        },
        process = FreeVarReference::EcmaScriptModule {
            request: "next/dist/build/polyfills/process".to_string(),
            lookup_path: Some(project_path),
            export: Some("default".to_string()),
        },
    )
    .cell())
}

#[turbo_tasks::function]
pub fn get_edge_compile_time_info(
    project_path: Vc<FileSystemPath>,
    server_addr: Vc<ServerAddr>,
    define_env: Vc<EnvMap>,
) -> Vc<CompileTimeInfo> {
    CompileTimeInfo::builder(Environment::new(Value::new(
        ExecutionEnvironment::EdgeWorker(EdgeWorkerEnvironment { server_addr }.into()),
    )))
    .defines(next_edge_defines(define_env))
    .free_var_references(next_edge_free_vars(project_path, define_env))
    .cell()
}

#[turbo_tasks::function]
pub async fn get_edge_resolve_options_context(
    project_path: Vc<FileSystemPath>,
    ty: Value<ServerContextType>,
    mode: NextMode,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_edge_import_map =
        get_next_edge_import_map(project_path, ty, next_config, execution_context);

    let ty = ty.into_value();

    // https://github.com/vercel/next.js/blob/bf52c254973d99fed9d71507a2e818af80b8ade7/packages/next/src/build/webpack-config.ts#L96-L102
    let mut custom_conditions = vec![
        mode.node_env().to_string(),
        "edge-light".to_string(),
        "worker".to_string(),
    ];

    match ty {
        ServerContextType::AppRSC { .. } => custom_conditions.push("react-server".to_string()),
        ServerContextType::AppRoute { .. }
        | ServerContextType::Pages { .. }
        | ServerContextType::PagesData { .. }
        | ServerContextType::PagesApi { .. }
        | ServerContextType::AppSSR { .. }
        | ServerContextType::Middleware { .. }
        | ServerContextType::Instrumentation { .. } => {}
    };

    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().resolve().await?),
        enable_edge_node_externals: true,
        custom_conditions,
        import_map: Some(next_edge_import_map),
        module: true,
        browser: true,
        plugins: vec![
            Vc::upcast(ModuleFeatureReportResolvePlugin::new(project_path)),
            Vc::upcast(UnsupportedModulesResolvePlugin::new(project_path)),
            Vc::upcast(NextSharedRuntimeResolvePlugin::new(project_path)),
        ],
        ..Default::default()
    };

    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        enable_mjs_extension: true,
        enable_edge_node_externals: true,
        rules: vec![(
            foreign_code_context_condition(next_config, project_path).await?,
            resolve_options_context.clone().cell(),
        )],
        ..resolve_options_context
    }
    .cell())
}

#[turbo_tasks::function]
pub fn get_edge_chunking_context(
    project_path: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    client_root: Vc<FileSystemPath>,
    asset_prefix: Vc<Option<String>>,
    environment: Vc<Environment>,
) -> Vc<Box<dyn EcmascriptChunkingContext>> {
    let output_root = node_root.join("server/edge".to_string());
    Vc::upcast(
        DevChunkingContext::builder(
            project_path,
            output_root,
            client_root,
            output_root.join("chunks".to_string()),
            client_root.join("static/media".to_string()),
            environment,
        )
        .asset_base_path(asset_prefix)
        .reference_chunk_source_maps(should_debug("edge"))
        .build(),
    )
}
