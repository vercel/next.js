use std::collections::HashMap;

use anyhow::{bail, Result};
use turbo_tasks::Value;
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

use crate::{
    embed_js::attached_next_js_package_path,
    next_client::context::{
        get_client_chunking_context, get_client_environment, get_client_module_options_context,
        get_client_resolve_options_context, ContextType,
    },
    next_import_map::insert_next_shared_aliases,
    runtime::resolve_runtime_request,
};

#[turbo_tasks::function]
pub async fn get_fallback_page(
    project_root: FileSystemPathVc,
    dev_server_root: FileSystemPathVc,
    browserslist_query: &str,
) -> Result<DevHtmlAssetVc> {
    let ty = Value::new(ContextType::Other);
    let environment = get_client_environment(browserslist_query);
    let resolve_options_context = get_client_resolve_options_context(project_root, ty);
    let module_options_context = get_client_module_options_context(project_root, environment, ty);
    let chunking_context = get_client_chunking_context(project_root, dev_server_root, ty);

    let mut import_map = ImportMap::empty();
    insert_next_shared_aliases(&mut import_map, attached_next_js_package_path(project_root));

    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        environment,
        module_options_context,
        resolve_options_context.with_extended_import_map(import_map.cell()),
    )
    .into();

    let fallback_chunk = resolve_runtime_request(
        PlainResolveOriginVc::new(context, project_root).into(),
        "entry/fallback",
    );

    let module = if let Some(module) =
        EcmascriptModuleAssetVc::resolve_from(fallback_chunk.as_asset()).await?
    {
        module
    } else {
        bail!("fallback runtime entry is not an ecmascript module");
    };

    let chunk = module.as_evaluated_chunk(chunking_context, None);

    Ok(DevHtmlAssetVc::new(
        dev_server_root.join("fallback.html"),
        vec![ChunkGroupVc::from_chunk(chunk)],
    ))
}
