use anyhow::Result;
use turbo_tasks::Value;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::{
        core::{
            compile_time_defines,
            compile_time_info::{
                CompileTimeDefines, CompileTimeDefinesVc, CompileTimeInfo, CompileTimeInfoVc,
                FreeVarReference, FreeVarReferencesVc,
            },
            environment::{
                EdgeWorkerEnvironment, EnvironmentVc, ExecutionEnvironment, ServerAddrVc,
            },
            free_var_references,
        },
        node::execution_context::ExecutionContextVc,
        turbopack::resolve_options_context::{ResolveOptionsContext, ResolveOptionsContextVc},
    },
};

use crate::{
    next_config::NextConfigVc, next_import_map::get_next_edge_import_map,
    next_server::context::ServerContextType,
    next_shared::resolve::UnsupportedModulesResolvePluginVc, util::foreign_code_context_condition,
};

fn defines() -> CompileTimeDefines {
    compile_time_defines!(
        process.turbopack = true,
        process.env.NODE_ENV = "development",
        process.env.__NEXT_CLIENT_ROUTER_FILTER_ENABLED = false,
        process.env.NEXT_RUNTIME = "edge"
    )
    // TODO(WEB-937) there are more defines needed, see
    // packages/next/src/build/webpack-config.ts
}

#[turbo_tasks::function]
fn next_edge_defines() -> CompileTimeDefinesVc {
    defines().cell()
}

#[turbo_tasks::function]
fn next_edge_free_vars(project_path: FileSystemPathVc) -> FreeVarReferencesVc {
    free_var_references!(
        ..defines().into_iter(),
        Buffer = FreeVarReference::EcmaScriptModule {
            request: "next/dist/compiled/buffer".to_string(),
            context: Some(project_path),
            export: Some("Buffer".to_string()),
        },
        process = FreeVarReference::EcmaScriptModule {
            request: "next/dist/build/polyfills/process".to_string(),
            context: Some(project_path),
            export: Some("default".to_string()),
        },
    )
    .cell()
}

#[turbo_tasks::function]
pub fn get_edge_compile_time_info(
    project_path: FileSystemPathVc,
    server_addr: ServerAddrVc,
) -> CompileTimeInfoVc {
    CompileTimeInfo::builder(EnvironmentVc::new(Value::new(
        ExecutionEnvironment::EdgeWorker(EdgeWorkerEnvironment { server_addr }.into()),
    )))
    .defines(next_edge_defines())
    .free_var_references(next_edge_free_vars(project_path))
    .cell()
}

#[turbo_tasks::function]
pub async fn get_edge_resolve_options_context(
    project_path: FileSystemPathVc,
    ty: Value<ServerContextType>,
    next_config: NextConfigVc,
    execution_context: ExecutionContextVc,
) -> Result<ResolveOptionsContextVc> {
    let next_edge_import_map =
        get_next_edge_import_map(project_path, ty, next_config, execution_context);

    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().resolve().await?),
        // https://github.com/vercel/next.js/blob/bf52c254973d99fed9d71507a2e818af80b8ade7/packages/next/src/build/webpack-config.ts#L96-L102
        custom_conditions: vec![
            "edge-light".to_string(),
            "worker".to_string(),
            "development".to_string(),
        ],
        import_map: Some(next_edge_import_map),
        module: true,
        browser: true,
        plugins: vec![UnsupportedModulesResolvePluginVc::new(project_path).into()],
        ..Default::default()
    };

    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        rules: vec![(
            foreign_code_context_condition(next_config).await?,
            resolve_options_context.clone().cell(),
        )],
        ..resolve_options_context
    }
    .cell())
}
