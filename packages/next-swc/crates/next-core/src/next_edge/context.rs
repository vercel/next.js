use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::{RcStr, Value, Vc};
use turbopack_binding::{
    turbo::{tasks_env::EnvMap, tasks_fs::FileSystemPath},
    turbopack::{
        browser::BrowserChunkingContext,
        core::{
            chunk::ChunkingContext,
            compile_time_info::{
                CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, FreeVarReference,
                FreeVarReferences,
            },
            environment::{EdgeWorkerEnvironment, Environment, ExecutionEnvironment},
            free_var_references,
        },
        node::execution_context::ExecutionContext,
        turbopack::resolve_options_context::ResolveOptionsContext,
    },
};

use crate::{
    mode::NextMode,
    next_config::NextConfig,
    next_font::local::NextFontLocalResolvePlugin,
    next_import_map::get_next_edge_import_map,
    next_server::context::ServerContextType,
    next_shared::resolve::{
        get_invalid_client_only_resolve_plugin, get_invalid_styled_jsx_resolve_plugin,
        ModuleFeatureReportResolvePlugin, NextSharedRuntimeResolvePlugin,
    },
    util::{foreign_code_context_condition, NextRuntime},
};

fn defines(define_env: &IndexMap<RcStr, RcStr>) -> CompileTimeDefines {
    let mut defines = IndexMap::new();

    for (k, v) in define_env {
        defines
            .entry(k.split('.').map(|s| s.into()).collect::<Vec<RcStr>>())
            .or_insert_with(|| {
                let val = serde_json::from_str(v);
                match val {
                    Ok(serde_json::Value::Bool(v)) => CompileTimeDefineValue::Bool(v),
                    Ok(serde_json::Value::String(v)) => CompileTimeDefineValue::String(v.into()),
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

/// Define variables for the edge runtime can be accessibly globally.
/// See [here](https://github.com/vercel/next.js/blob/160bb99b06e9c049f88e25806fd995f07f4cc7e1/packages/next/src/build/webpack-config.ts#L1715-L1718) how webpack configures it.
#[turbo_tasks::function]
async fn next_edge_free_vars(
    project_path: Vc<FileSystemPath>,
    define_env: Vc<EnvMap>,
) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(
        ..defines(&*define_env.await?).into_iter(),
        Buffer = FreeVarReference::EcmaScriptModule {
            request: "buffer".into(),
            lookup_path: Some(project_path),
            export: Some("Buffer".into()),
        },
    )
    .cell())
}

#[turbo_tasks::function]
pub fn get_edge_compile_time_info(
    project_path: Vc<FileSystemPath>,
    define_env: Vc<EnvMap>,
) -> Vc<CompileTimeInfo> {
    CompileTimeInfo::builder(Environment::new(Value::new(
        ExecutionEnvironment::EdgeWorker(EdgeWorkerEnvironment {}.into()),
    )))
    .defines(next_edge_defines(define_env))
    .free_var_references(next_edge_free_vars(project_path, define_env))
    .cell()
}

#[turbo_tasks::function]
pub async fn get_edge_resolve_options_context(
    project_path: Vc<FileSystemPath>,
    ty: Value<ServerContextType>,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_edge_import_map =
        get_next_edge_import_map(project_path, ty, next_config, execution_context);

    let ty: ServerContextType = ty.into_value();

    let mut before_resolve_plugins = vec![Vc::upcast(ModuleFeatureReportResolvePlugin::new(
        project_path,
    ))];
    if matches!(
        ty,
        ServerContextType::Pages { .. }
            | ServerContextType::AppSSR { .. }
            | ServerContextType::AppRSC { .. }
    ) {
        before_resolve_plugins.push(Vc::upcast(NextFontLocalResolvePlugin::new(project_path)));
    };

    if matches!(
        ty,
        ServerContextType::AppRSC { .. }
            | ServerContextType::AppRoute { .. }
            | ServerContextType::PagesData { .. }
            | ServerContextType::Middleware { .. }
            | ServerContextType::Instrumentation { .. }
    ) {
        before_resolve_plugins.push(Vc::upcast(get_invalid_client_only_resolve_plugin(
            project_path,
        )));
        before_resolve_plugins.push(Vc::upcast(get_invalid_styled_jsx_resolve_plugin(
            project_path,
        )));
    }

    let after_resolve_plugins = vec![Vc::upcast(NextSharedRuntimeResolvePlugin::new(
        project_path,
    ))];

    // https://github.com/vercel/next.js/blob/bf52c254973d99fed9d71507a2e818af80b8ade7/packages/next/src/build/webpack-config.ts#L96-L102
    let mut custom_conditions = vec![mode.await?.condition().into()];
    custom_conditions.extend(
        NextRuntime::Edge
            .conditions()
            .iter()
            .map(ToString::to_string)
            .map(RcStr::from),
    );

    if ty.supports_react_server() {
        custom_conditions.push("react-server".into());
    };

    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().resolve().await?),
        enable_edge_node_externals: true,
        custom_conditions,
        import_map: Some(next_edge_import_map),
        module: true,
        browser: true,
        after_resolve_plugins,
        before_resolve_plugins,
        ..Default::default()
    };

    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        enable_mjs_extension: true,
        enable_edge_node_externals: true,
        custom_extensions: next_config.resolve_extension().await?.clone_value(),
        rules: vec![(
            foreign_code_context_condition(next_config, project_path).await?,
            resolve_options_context.clone().cell(),
        )],
        ..resolve_options_context
    }
    .cell())
}

#[turbo_tasks::function]
pub async fn get_edge_chunking_context_with_client_assets(
    mode: Vc<NextMode>,
    project_path: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    client_root: Vc<FileSystemPath>,
    asset_prefix: Vc<Option<RcStr>>,
    environment: Vc<Environment>,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    let output_root = node_root.join("server/edge".into());
    let next_mode = mode.await?;
    Ok(Vc::upcast(
        BrowserChunkingContext::builder(
            project_path,
            output_root,
            client_root,
            output_root.join("chunks/ssr".into()),
            client_root.join("static/media".into()),
            environment,
            next_mode.runtime_type(),
        )
        .asset_base_path(asset_prefix)
        .minify_type(next_mode.minify_type())
        .build(),
    ))
}

#[turbo_tasks::function]
pub async fn get_edge_chunking_context(
    mode: Vc<NextMode>,
    project_path: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    environment: Vc<Environment>,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    let output_root = node_root.join("server/edge".into());
    let next_mode = mode.await?;
    Ok(Vc::upcast(
        BrowserChunkingContext::builder(
            project_path,
            output_root,
            output_root,
            output_root.join("chunks".into()),
            output_root.join("assets".into()),
            environment,
            next_mode.runtime_type(),
        )
        // Since one can't read files in edge directly, any asset need to be fetched
        // instead. This special blob url is handled by the custom fetch
        // implementation in the edge sandbox. It will respond with the
        // asset from the output directory.
        .asset_base_path(Vc::cell(Some("blob:server/edge/".into())))
        .minify_type(next_mode.minify_type())
        .build(),
    ))
}
