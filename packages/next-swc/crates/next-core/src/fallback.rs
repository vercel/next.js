use std::collections::HashMap;

use anyhow::{bail, Result};
use turbo_tasks::{Value, Vc};
use turbopack_binding::{
    turbo::{tasks_env::ProcessEnv, tasks_fs::FileSystemPath},
    turbopack::{
        core::{
            compile_time_info::CompileTimeInfo,
            context::AssetContext,
            resolve::{options::ImportMap, origin::PlainResolveOrigin},
        },
        dev_server::html::DevHtmlAsset,
        node::execution_context::ExecutionContext,
        turbopack::{ecmascript::EcmascriptModuleAsset, ModuleAssetContext},
    },
};

use crate::{
    mode::NextMode,
    next_client::context::{
        get_client_chunking_context, get_client_module_options_context,
        get_client_resolve_options_context, get_client_runtime_entries, ClientContextType,
    },
    next_config::NextConfig,
    next_import_map::insert_next_shared_aliases,
    runtime::resolve_runtime_request,
};

#[turbo_tasks::function]
pub async fn get_fallback_page(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    dev_server_root: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    client_compile_time_info: Vc<CompileTimeInfo>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<DevHtmlAsset>> {
    let ty = Value::new(ClientContextType::Fallback);
    let mode = NextMode::DevServer;
    let resolve_options_context =
        get_client_resolve_options_context(project_path, ty, mode, next_config, execution_context);
    let module_options_context = get_client_module_options_context(
        project_path,
        execution_context,
        client_compile_time_info.environment(),
        ty,
        mode,
        next_config,
    );
    let chunking_context = get_client_chunking_context(
        project_path,
        dev_server_root,
        client_compile_time_info.environment(),
        mode,
    );
    let entries =
        get_client_runtime_entries(project_path, env, ty, mode, next_config, execution_context);

    let mut import_map = ImportMap::empty();
    insert_next_shared_aliases(
        &mut import_map,
        project_path,
        execution_context,
        next_config,
    )
    .await?;

    let context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        Vc::cell(HashMap::new()),
        client_compile_time_info,
        module_options_context,
        resolve_options_context.with_extended_import_map(import_map.cell()),
    ));

    let runtime_entries = entries.resolve_entries(context);

    let fallback_chunk = resolve_runtime_request(
        Vc::upcast(PlainResolveOrigin::new(context, project_path)),
        "entry/fallback".to_string(),
    );

    let module = if let Some(module) =
        Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(fallback_chunk).await?
    {
        module
    } else {
        bail!("fallback runtime entry is not an ecmascript module");
    };

    Ok(DevHtmlAsset::new(
        dev_server_root.join("fallback.html".to_string()),
        vec![(
            Vc::upcast(module),
            Vc::upcast(chunking_context),
            Some(runtime_entries.with_entry(Vc::upcast(module))),
        )],
    ))
}
