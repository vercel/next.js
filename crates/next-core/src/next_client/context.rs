use core::{default::Default, result::Result::Ok};
use std::collections::HashMap;

use anyhow::Result;
use turbo_tasks::Value;
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::{
    module_options::module_options_context::{ModuleOptionsContext, ModuleOptionsContextVc},
    resolve_options_context::{ResolveOptionsContext, ResolveOptionsContextVc},
    transition::TransitionsByNameVc,
    ModuleAssetContextVc,
};
use turbopack_core::{
    chunk::{dev::DevChunkingContextVc, ChunkingContextVc},
    context::AssetContextVc,
    environment::{BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment},
};
use turbopack_dev_server::html_runtime_asset::HtmlRuntimeAssetVc;
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceablesVc;
use turbopack_env::ProcessEnvAssetVc;

use crate::{
    env::filter_for_client,
    next_client::runtime_entry::{RuntimeEntriesVc, RuntimeEntry},
    react_refresh::{assert_can_resolve_react_refresh, react_refresh_request},
};

#[turbo_tasks::function]
pub fn get_client_environment() -> EnvironmentVc {
    EnvironmentVc::new(
        Value::new(ExecutionEnvironment::Browser(
            BrowserEnvironment {
                dom: true,
                web_worker: false,
                service_worker: false,
                browser_version: 0,
            }
            .into(),
        )),
        Value::new(EnvironmentIntention::Client),
    )
}

#[turbo_tasks::function]
pub fn get_client_resolve_options_context() -> ResolveOptionsContextVc {
    ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        enable_node_modules: true,
        custom_conditions: vec!["development".to_string()],
        ..Default::default()
    }
    .cell()
}

#[turbo_tasks::function]
pub async fn get_client_module_options_context(
    project_root: FileSystemPathVc,
) -> Result<ModuleOptionsContextVc> {
    let resolve_options_context = get_client_resolve_options_context();
    let enable_react_refresh =
        *assert_can_resolve_react_refresh(project_root, resolve_options_context).await?;

    Ok(ModuleOptionsContext {
        // We don't need to resolve React Refresh for each module. Instead,
        // we try resolve it once at the root and pass down a context to all
        // the modules.
        enable_react_refresh,
        enable_styled_jsx: true,
        enable_typescript_transform: true,
        ..Default::default()
    }
    .cell())
}

#[turbo_tasks::function]
pub fn get_client_asset_context(project_root: FileSystemPathVc) -> AssetContextVc {
    let environment = get_client_environment();
    let resolve_options_context = get_client_resolve_options_context();
    let module_options_context = get_client_module_options_context(project_root);

    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        project_root,
        environment,
        module_options_context,
        resolve_options_context,
    )
    .into();

    context
}

#[turbo_tasks::function]
pub fn get_client_chunking_context(
    project_root: FileSystemPathVc,
    server_root: FileSystemPathVc,
) -> ChunkingContextVc {
    DevChunkingContextVc::new(
        project_root,
        server_root.join("/_next/static/chunks"),
        get_client_assets_path(server_root),
        true,
    )
    .into()
}

#[turbo_tasks::function]
pub fn get_client_assets_path(server_root: FileSystemPathVc) -> FileSystemPathVc {
    server_root.join("/_next/static/assets")
}

#[turbo_tasks::function]
pub async fn get_client_runtime_entries(
    project_root: FileSystemPathVc,
    env: ProcessEnvVc,
) -> Result<RuntimeEntriesVc> {
    let resolve_options_context = get_client_resolve_options_context();
    let enable_react_refresh =
        *assert_can_resolve_react_refresh(project_root, resolve_options_context).await?;

    let mut runtime_entries = vec![
        RuntimeEntry::Ecmascript(
            ProcessEnvAssetVc::new(project_root, filter_for_client(env)).into(),
        )
        .cell(),
        RuntimeEntry::Ecmascript(HtmlRuntimeAssetVc::new().into()).cell(),
    ];
    if enable_react_refresh {
        runtime_entries.push(RuntimeEntry::Request(react_refresh_request(), project_root).cell())
    };

    Ok(RuntimeEntriesVc::cell(runtime_entries))
}

#[turbo_tasks::function]
pub fn get_resolved_client_runtime_entries(
    project_root: FileSystemPathVc,
    env: ProcessEnvVc,
) -> EcmascriptChunkPlaceablesVc {
    let context = get_client_asset_context(project_root);
    let entries = get_client_runtime_entries(project_root, env);

    entries.resolve_entries(context)
}
