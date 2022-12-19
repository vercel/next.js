use std::collections::HashMap;

use anyhow::{bail, Result};
use turbo_tasks::Value;
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::{
    ecmascript::EcmascriptModuleAssetVc, transition::TransitionsByNameVc, ModuleAssetContextVc,
};
use turbopack_core::{
    chunk::ChunkGroupVc,
    context::AssetContextVc,
    resolve::{options::ImportMap, origin::PlainResolveOriginVc},
};
use turbopack_dev_server::html::DevHtmlAssetVc;
use turbopack_node::execution_context::ExecutionContextVc;

use crate::{
    next_client::context::{
        get_client_chunking_context, get_client_environment, get_client_module_options_context,
        get_client_resolve_options_context, get_client_runtime_entries, ContextType,
    },
    next_config::NextConfigVc,
    next_import_map::insert_next_shared_aliases,
    runtime::resolve_runtime_request,
};

#[turbo_tasks::function]
pub async fn get_fallback_page(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    dev_server_root: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
    next_config: NextConfigVc,
) -> Result<DevHtmlAssetVc> {
    let ty = Value::new(ContextType::Fallback);
    let environment = get_client_environment(browserslist_query);
    let resolve_options_context = get_client_resolve_options_context(project_path, ty);
    let module_options_context =
        get_client_module_options_context(project_path, execution_context, environment, ty);
    let chunking_context = get_client_chunking_context(project_path, dev_server_root, ty);
    let entries = get_client_runtime_entries(project_path, env, ty, next_config);

    let mut import_map = ImportMap::empty();
    insert_next_shared_aliases(&mut import_map, project_path);

    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        environment,
        module_options_context,
        resolve_options_context.with_extended_import_map(import_map.cell()),
    )
    .into();

    let runtime_entries = entries.resolve_entries(context);

    let fallback_chunk = resolve_runtime_request(
        PlainResolveOriginVc::new(context, project_path).into(),
        "entry/fallback",
    );

    let module = if let Some(module) =
        EcmascriptModuleAssetVc::resolve_from(fallback_chunk.as_asset()).await?
    {
        module
    } else {
        bail!("fallback runtime entry is not an ecmascript module");
    };

    let chunk = module.as_evaluated_chunk(chunking_context, Some(runtime_entries));

    Ok(DevHtmlAssetVc::new(
        dev_server_root.join("fallback.html"),
        vec![ChunkGroupVc::from_chunk(chunk)],
    ))
}
