use anyhow::Result;
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::{
        core::{
            compile_time_defines,
            compile_time_info::{
                CompileTimeDefines, CompileTimeInfo, FreeVarReference, FreeVarReferences,
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
    next_client::context::get_client_assets_path,
    next_config::NextConfig,
    next_import_map::get_next_edge_import_map,
    next_server::context::ServerContextType,
    next_shared::resolve::{
        ModuleFeatureReportResolvePlugin, NextSharedRuntimeResolvePlugin,
        UnsupportedModulesResolvePlugin,
    },
    util::foreign_code_context_condition,
};

fn defines(dist_root_path: Option<String>) -> CompileTimeDefines {
    // [TODO] macro may need to allow dynamically expand from some iterable values
    if let Some(dist_root_path) = dist_root_path {
        compile_time_defines!(
            process.turbopack = true,
            process.env.NODE_ENV = "development",
            process.env.__NEXT_CLIENT_ROUTER_FILTER_ENABLED = false,
            process.env.NEXT_RUNTIME = "edge",
            process.env.__NEXT_DIST_DIR = dist_root_path
        )
    } else {
        compile_time_defines!(
            process.turbopack = true,
            process.env.NODE_ENV = "development",
            process.env.__NEXT_CLIENT_ROUTER_FILTER_ENABLED = false,
            process.env.NEXT_RUNTIME = "edge",
        )
    }

    // TODO(WEB-937) there are more defines needed, see
    // packages/next/src/build/webpack-config.ts
}

#[turbo_tasks::function]
async fn next_edge_defines(dist_root_path: Vc<FileSystemPath>) -> Result<Vc<CompileTimeDefines>> {
    let dist_root_path = &*dist_root_path.to_string().await?;
    Ok(defines(Some(dist_root_path.clone())).cell())
}

#[turbo_tasks::function]
async fn next_edge_free_vars(
    project_path: Vc<FileSystemPath>,
    dist_root_path: Vc<FileSystemPath>,
) -> Result<Vc<FreeVarReferences>> {
    let dist_root_path = &*dist_root_path.to_string().await?;
    Ok(free_var_references!(
        ..defines(Some(dist_root_path.clone())).into_iter(),
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
    dist_root_path: Vc<FileSystemPath>,
) -> Vc<CompileTimeInfo> {
    CompileTimeInfo::builder(Environment::new(Value::new(
        ExecutionEnvironment::EdgeWorker(EdgeWorkerEnvironment { server_addr }.into()),
    )))
    .defines(next_edge_defines(dist_root_path))
    .free_var_references(next_edge_free_vars(project_path, dist_root_path))
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
        get_next_edge_import_map(project_path, ty, mode, next_config, execution_context);

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
        | ServerContextType::AppSSR { .. }
        | ServerContextType::Middleware { .. } => {}
    };

    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().resolve().await?),
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
    environment: Vc<Environment>,
) -> Vc<Box<dyn EcmascriptChunkingContext>> {
    Vc::upcast(
        DevChunkingContext::builder(
            project_path,
            node_root.join("server/edge".to_string()),
            node_root.join("server/edge/chunks".to_string()),
            get_client_assets_path(client_root),
            environment,
        )
        .reference_chunk_source_maps(should_debug("edge"))
        .build(),
    )
}
