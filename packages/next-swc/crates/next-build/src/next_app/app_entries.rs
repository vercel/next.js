use std::collections::HashMap;

use anyhow::Result;
use next_core::{
    app_structure::{find_app_dir_if_enabled, get_entrypoints, Entrypoint},
    mode::NextMode,
    next_app::{
        get_app_page_entry, get_app_route_entry, metadata::route::get_app_metadata_route_entry,
        AppEntry,
    },
    next_client::{
        get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries, ClientContextType,
    },
    next_client_reference::NextEcmascriptClientReferenceTransition,
    next_config::NextConfig,
    next_dynamic::NextDynamicTransition,
    next_server::{
        get_server_module_options_context, get_server_resolve_options_context,
        get_server_runtime_entries, ServerContextType,
    },
};
use turbo_tasks::{TryJoinIterExt, Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::{
        core::{
            chunk::EvaluatableAssets, compile_time_info::CompileTimeInfo, file_source::FileSource,
        },
        node::execution_context::ExecutionContext,
        turbopack::{transition::ContextTransition, ModuleAssetContext},
    },
};

const ECMASCRIPT_CLIENT_TRANSITION_NAME: &str = "next-ecmascript-client-reference";

#[turbo_tasks::value]
pub struct AppEntries {
    /// All app entries.
    pub entries: Vec<Vc<AppEntry>>,
    /// The RSC runtime entries that should be evaluated before any app entry
    /// module when server rendering.
    pub rsc_runtime_entries: Vc<EvaluatableAssets>,
    /// The client runtime entries that should be evaluated before any app entry
    /// module when client rendering.
    pub client_runtime_entries: Vc<EvaluatableAssets>,
}

/// Computes all app entries found under the given project root.
#[turbo_tasks::function]
pub async fn get_app_entries(
    project_root: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    client_compile_time_info: Vc<CompileTimeInfo>,
    server_compile_time_info: Vc<CompileTimeInfo>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<AppEntries>> {
    let app_dir = find_app_dir_if_enabled(project_root);

    let Some(&app_dir) = app_dir.await?.as_ref() else {
        return Ok(AppEntries::cell(AppEntries {
            entries: vec![],
            rsc_runtime_entries: EvaluatableAssets::empty(),
            client_runtime_entries: EvaluatableAssets::empty(),
        }));
    };

    let entrypoints = get_entrypoints(app_dir, next_config.page_extensions());

    let mode = NextMode::Build;

    let client_ty = Value::new(ClientContextType::App { app_dir });

    let rsc_ty: Value<ServerContextType> = Value::new(ServerContextType::AppRSC {
        app_dir,
        client_transition: None,
        ecmascript_client_reference_transition_name: None,
    });

    // TODO(alexkirsz) Should we pass env here or EnvMap::empty, as is done in
    // app_source?
    let runtime_entries = get_server_runtime_entries(rsc_ty, mode);

    let ssr_ty: Value<ServerContextType> = Value::new(ServerContextType::AppSSR { app_dir });

    let mut transitions = HashMap::new();

    let client_module_options_context = get_client_module_options_context(
        project_root,
        execution_context,
        client_compile_time_info.environment(),
        client_ty,
        mode,
        next_config,
    );

    let client_resolve_options_context = get_client_resolve_options_context(
        project_root,
        client_ty,
        mode,
        next_config,
        execution_context,
    );

    let client_transition = ContextTransition::new(
        client_compile_time_info,
        client_module_options_context,
        client_resolve_options_context,
        Vc::cell("app-client".to_string()),
    );

    let ssr_resolve_options_context = get_server_resolve_options_context(
        project_root,
        ssr_ty,
        mode,
        next_config,
        execution_context,
    );

    let ssr_module_options_context = get_server_module_options_context(
        project_root,
        execution_context,
        ssr_ty,
        mode,
        next_config,
    );

    let ssr_transition = ContextTransition::new(
        server_compile_time_info,
        ssr_module_options_context,
        ssr_resolve_options_context,
        Vc::cell("app-ssr".to_string()),
    );

    transitions.insert("next-ssr".to_string(), Vc::upcast(ssr_transition));

    transitions.insert(
        ECMASCRIPT_CLIENT_TRANSITION_NAME.to_string(),
        Vc::upcast(NextEcmascriptClientReferenceTransition::new(
            client_transition,
            ssr_transition,
        )),
    );

    let client_ty = Value::new(ClientContextType::App { app_dir });
    transitions.insert(
        "next-dynamic".to_string(),
        Vc::upcast(NextDynamicTransition::new(client_transition)),
    );

    let rsc_ty = Value::new(ServerContextType::AppRSC {
        app_dir,
        client_transition: Some(Vc::upcast(client_transition)),
        ecmascript_client_reference_transition_name: Some(Vc::cell(
            ECMASCRIPT_CLIENT_TRANSITION_NAME.to_string(),
        )),
    });

    let rsc_module_options_context = get_server_module_options_context(
        project_root,
        execution_context,
        rsc_ty,
        mode,
        next_config,
    );
    let rsc_resolve_options_context = get_server_resolve_options_context(
        project_root,
        rsc_ty,
        mode,
        next_config,
        execution_context,
    );

    let rsc_context = ModuleAssetContext::new(
        Vc::cell(transitions),
        server_compile_time_info,
        rsc_module_options_context,
        rsc_resolve_options_context,
        Vc::cell("app-rsc".to_string()),
    );

    let entries = entrypoints
        .await?
        .iter()
        .map(|(_, entrypoint)| async move {
            Ok(match entrypoint {
                Entrypoint::AppPage { page, loader_tree } => get_app_page_entry(
                    rsc_context,
                    // TODO(WEB-1824): add edge support
                    rsc_context,
                    *loader_tree,
                    page.clone(),
                    project_root,
                    next_config,
                ),
                Entrypoint::AppRoute { page, path } => get_app_route_entry(
                    rsc_context,
                    // TODO(WEB-1824): add edge support
                    rsc_context,
                    Vc::upcast(FileSource::new(*path)),
                    page.clone(),
                    project_root,
                ),
                Entrypoint::AppMetadata { page, metadata } => get_app_metadata_route_entry(
                    rsc_context,
                    // TODO(WEB-1824): add edge support
                    rsc_context,
                    project_root,
                    page.clone(),
                    mode,
                    *metadata,
                ),
            })
        })
        .try_join()
        .await?;

    let client_context = ModuleAssetContext::new(
        Vc::cell(Default::default()),
        client_compile_time_info,
        client_module_options_context,
        client_resolve_options_context,
        Vc::cell("app-client".to_string()),
    );

    let client_runtime_entries = get_client_runtime_entries(
        project_root,
        client_ty,
        mode,
        next_config,
        execution_context,
    );

    Ok(AppEntries::cell(AppEntries {
        entries,
        rsc_runtime_entries: runtime_entries.resolve_entries(Vc::upcast(rsc_context)),
        client_runtime_entries: client_runtime_entries.resolve_entries(Vc::upcast(client_context)),
    }))
}
