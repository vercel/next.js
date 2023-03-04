use anyhow::Result;
use turbo_tasks::Value;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::resolve_options_context::{ResolveOptionsContext, ResolveOptionsContextVc};
use turbopack_core::{
    compile_time_defines,
    compile_time_info::{CompileTimeDefinesVc, CompileTimeInfo, CompileTimeInfoVc},
    environment::{
        EdgeWorkerEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment,
        ServerAddrVc,
    },
};
use turbopack_node::execution_context::ExecutionContextVc;

use crate::{
    next_config::NextConfigVc, next_import_map::get_next_edge_import_map,
    next_server::context::ServerContextType, util::foreign_code_context_condition,
};

pub fn next_edge_defines() -> CompileTimeDefinesVc {
    compile_time_defines!(
        process.turbopack = true,
        process.env.NODE_ENV = "development",
        process.env.__NEXT_CLIENT_ROUTER_FILTER_ENABLED = false
    )
    .cell()
}

#[turbo_tasks::function]
pub fn get_edge_compile_time_info(
    server_addr: ServerAddrVc,
    intention: Value<EnvironmentIntention>,
) -> CompileTimeInfoVc {
    CompileTimeInfo {
        environment: EnvironmentVc::new(
            Value::new(ExecutionEnvironment::EdgeWorker(
                EdgeWorkerEnvironment { server_addr }.into(),
            )),
            intention,
        ),
        defines: next_edge_defines(),
    }
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
        custom_conditions: vec!["worker".to_string(), "development".to_string()],
        import_map: Some(next_edge_import_map),
        module: true,
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
