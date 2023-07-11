use std::collections::HashMap;

use anyhow::{Context, Result};
use indexmap::IndexMap;
use indoc::formatdoc;
use next_core::{
    app_structure::{find_app_dir_if_enabled, get_entrypoints, get_global_metadata, Entrypoint},
    mode::NextMode,
    next_client::{
        get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries, ClientContextType,
    },
    next_client_reference::{
        ClientReference, ClientReferenceType, NextEcmascriptClientReferenceTransitionVc,
    },
    next_config::NextConfigVc,
    next_dynamic::NextDynamicTransitionVc,
    next_server::{
        get_server_module_options_context, get_server_resolve_options_context,
        get_server_runtime_entries, ServerContextType,
    },
};
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value, ValueToString};
use turbopack_binding::{
    turbo::{
        tasks_env::{CustomProcessEnvVc, ProcessEnvVc},
        tasks_fs::{File, FileSystemPath, FileSystemPathVc},
    },
    turbopack::{
        build::BuildChunkingContextVc,
        core::{
            asset::{Asset, AssetVc, AssetsVc},
            chunk::{
                availability_info::AvailabilityInfo, ChunkingContext, EvaluatableAssetsVc,
                ModuleId as TurbopackModuleId,
            },
            compile_time_info::CompileTimeInfoVc,
            file_source::FileSourceVc,
            virtual_source::VirtualSourceVc,
        },
        ecmascript::{
            chunk::{
                EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkPlaceablesVc,
                EcmascriptChunkVc, EcmascriptChunkingContextVc,
            },
            utils::StringifyJs,
        },
        node::execution_context::ExecutionContextVc,
        turbopack::{
            transition::{ContextTransitionVc, TransitionsByNameVc},
            ModuleAssetContextVc,
        },
    },
};

use super::{
    app_client_reference::ClientReferenceChunks, app_page_entry::get_app_page_entry,
    app_route_entry::get_app_route_entry, app_route_favicon_entry::get_app_route_favicon_entry,
};
use crate::manifests::{
    AppBuildManifest, AppPathsManifest, BuildManifest, ClientReferenceManifest, ManifestNode,
    ManifestNodeEntry, ModuleId,
};

/// The entry module asset for a Next.js app route or page.
#[turbo_tasks::value(shared)]
pub struct AppEntry {
    /// The pathname of the route or page.
    pub pathname: String,
    /// The original Next.js name of the route or page. This is used instead of
    /// the pathname to refer to this entry.
    pub original_name: String,
    /// The RSC module asset for the route or page.
    pub rsc_entry: EcmascriptChunkPlaceableVc,
}

#[turbo_tasks::value]
pub struct AppEntries {
    /// All app entries.
    pub entries: Vec<AppEntryVc>,
    /// The RSC runtime entries that should be evaluated before any app entry
    /// module when server rendering.
    pub rsc_runtime_entries: EvaluatableAssetsVc,
    /// The client runtime entries that should be evaluated before any app entry
    /// module when client rendering.
    pub client_runtime_entries: EvaluatableAssetsVc,
}

/// Computes all app entries found under the given project root.
#[turbo_tasks::function]
pub async fn get_app_entries(
    project_root: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    env: ProcessEnvVc,
    client_compile_time_info: CompileTimeInfoVc,
    server_compile_time_info: CompileTimeInfoVc,
    next_config: NextConfigVc,
) -> Result<AppEntriesVc> {
    let app_dir = find_app_dir_if_enabled(project_root, next_config);

    let Some(&app_dir) = app_dir.await?.as_ref() else {
        return Ok(AppEntriesVc::cell(AppEntries {
            entries: vec![],
            rsc_runtime_entries: EvaluatableAssetsVc::empty(),
            client_runtime_entries: EvaluatableAssetsVc::empty(),
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
    let runtime_entries = get_server_runtime_entries(project_root, env, rsc_ty, mode, next_config);

    let env = CustomProcessEnvVc::new(env, next_config.env()).as_process_env();

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

    let client_transition = ContextTransitionVc::new(
        client_compile_time_info,
        client_module_options_context,
        client_resolve_options_context,
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

    let ssr_transition = ContextTransitionVc::new(
        server_compile_time_info,
        ssr_module_options_context,
        ssr_resolve_options_context,
    );

    const ECMASCRIPT_CLIENT_TRANSITION_NAME: &str = "next-ecmascript-client-reference";

    transitions.insert(
        ECMASCRIPT_CLIENT_TRANSITION_NAME.to_string(),
        NextEcmascriptClientReferenceTransitionVc::new(client_transition, ssr_transition).into(),
    );

    let client_ty = Value::new(ClientContextType::App { app_dir });
    transitions.insert(
        "next-dynamic".to_string(),
        NextDynamicTransitionVc::new(client_transition).into(),
    );

    let rsc_ty = Value::new(ServerContextType::AppRSC {
        app_dir,
        client_transition: Some(client_transition.into()),
        ecmascript_client_reference_transition_name: Some(StringVc::cell(
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

    let rsc_context = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(transitions),
        server_compile_time_info,
        rsc_module_options_context,
        rsc_resolve_options_context,
    );

    let mut entries = entrypoints
        .await?
        .iter()
        .map(|(pathname, entrypoint)| async move {
            Ok(match entrypoint {
                Entrypoint::AppPage { loader_tree } => {
                    get_app_page_entry(rsc_context, *loader_tree, app_dir, pathname, project_root)
                        .await?
                }
                Entrypoint::AppRoute { path } => {
                    get_app_route_entry(
                        rsc_context,
                        FileSourceVc::new(*path).into(),
                        pathname,
                        project_root,
                    )
                    .await?
                }
            })
        })
        .try_join()
        .await?;

    let global_metadata = get_global_metadata(app_dir, next_config.page_extensions());
    let global_metadata = global_metadata.await?;

    if let Some(favicon) = global_metadata.favicon {
        entries.push(get_app_route_favicon_entry(rsc_context, favicon, project_root).await?);
    }

    let client_context = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(Default::default()),
        client_compile_time_info,
        client_module_options_context,
        client_resolve_options_context,
    );

    let client_runtime_entries = get_client_runtime_entries(
        project_root,
        env,
        client_ty,
        mode,
        next_config,
        execution_context,
    );

    Ok(AppEntriesVc::cell(AppEntries {
        entries,
        rsc_runtime_entries: runtime_entries.resolve_entries(rsc_context.into()),
        client_runtime_entries: client_runtime_entries.resolve_entries(client_context.into()),
    }))
}

/// Computes and returns all chunks for app entries. The chunks will be appended
/// to `all_chunks`, and the chunking information will be added to the provided
/// manifests.
pub async fn compute_app_entries_chunks(
    app_entries: &AppEntries,
    app_client_references_by_entry: &IndexMap<AssetVc, Vec<ClientReference>>,
    app_client_references_chunks: &IndexMap<ClientReferenceType, ClientReferenceChunks>,
    rsc_chunking_context: BuildChunkingContextVc,
    client_chunking_context: EcmascriptChunkingContextVc,
    ssr_chunking_context: EcmascriptChunkingContextVc,
    node_root: FileSystemPathVc,
    client_root: &FileSystemPath,
    app_build_manifest_dir_path: &FileSystemPath,
    app_paths_manifest_dir_path: &FileSystemPath,
    app_build_manifest: &mut AppBuildManifest,
    build_manifest: &mut BuildManifest,
    app_paths_manifest: &mut AppPathsManifest,
    all_chunks: &mut Vec<AssetVc>,
) -> Result<()> {
    let node_root_ref = node_root.await?;

    let app_client_shared_chunks =
        get_app_client_shared_chunks(app_entries.client_runtime_entries, client_chunking_context);

    let mut app_shared_client_chunks_paths = vec![];
    for chunk in app_client_shared_chunks.await?.iter().copied() {
        all_chunks.push(chunk);

        let chunk_path = chunk.ident().path().await?;
        if chunk_path.extension() == Some("js") {
            if let Some(chunk_path) = client_root.get_path_to(&chunk_path) {
                app_shared_client_chunks_paths.push(chunk_path.to_string());
                build_manifest.root_main_files.push(chunk_path.to_string());
            }
        }
    }

    for app_entry in app_entries.entries.iter().copied() {
        let app_entry = app_entry.await?;

        let app_entry_client_references = app_client_references_by_entry
            .get(&app_entry.rsc_entry.as_asset())
            .expect("app entry should have a corresponding client references list");

        let rsc_chunk = rsc_chunking_context.entry_chunk(
            node_root.join(&format!(
                "server/app/{original_name}.js",
                original_name = app_entry.original_name
            )),
            app_entry.rsc_entry,
            app_entries.rsc_runtime_entries,
        );
        all_chunks.push(rsc_chunk);

        let mut app_entry_client_chunks = vec![];
        let mut app_entry_ssr_chunks = vec![];

        for client_reference in app_entry_client_references {
            let client_reference_chunks = app_client_references_chunks
                .get(client_reference.ty())
                .expect("client reference should have corresponding chunks");
            app_entry_client_chunks
                .extend(client_reference_chunks.client_chunks.await?.iter().copied());
            app_entry_ssr_chunks.extend(client_reference_chunks.ssr_chunks.await?.iter().copied());
        }

        let app_entry_client_chunks_paths = app_entry_client_chunks
            .iter()
            .map(|chunk| chunk.ident().path())
            .try_join()
            .await?;
        let mut app_entry_client_chunks_paths: Vec<_> = app_entry_client_chunks_paths
            .iter()
            .map(|path| {
                app_build_manifest_dir_path
                    .get_path_to(path)
                    .expect("asset path should be inside client root")
                    .to_string()
            })
            .collect();
        app_entry_client_chunks_paths.extend(app_shared_client_chunks_paths.iter().cloned());

        app_build_manifest.pages.insert(
            app_entry.original_name.clone(),
            app_entry_client_chunks_paths,
        );

        app_paths_manifest.node_server_app_paths.pages.insert(
            app_entry.original_name.clone(),
            app_paths_manifest_dir_path
                .get_path_to(&*rsc_chunk.ident().path().await?)
                .expect("RSC chunk path should be within app paths manifest directory")
                .to_string(),
        );

        let mut entry_manifest: ClientReferenceManifest = Default::default();

        for app_client_reference in app_entry_client_references {
            let app_client_reference_ty = app_client_reference.ty();

            let app_client_reference_chunks = app_client_references_chunks
                .get(app_client_reference.ty())
                .context("client reference chunks not found")?;

            let client_reference_chunks = app_client_references_chunks
                .get(app_client_reference_ty)
                .context("client reference chunks not found")?;
            let client_chunks = &client_reference_chunks.client_chunks.await?;

            let client_chunks_paths = client_chunks
                .iter()
                .map(|chunk| chunk.ident().path())
                .try_join()
                .await?;

            if let Some(server_component) = app_client_reference.server_component() {
                let server_component_name = server_component
                    .server_path()
                    .with_extension("")
                    .to_string()
                    .await?;

                let entry_css_files = entry_manifest
                    .entry_css_files
                    .entry(server_component_name.clone_value())
                    .or_insert_with(Default::default);

                match app_client_reference_ty {
                    ClientReferenceType::CssClientReference(_) => {
                        entry_css_files.extend(
                            client_chunks_paths
                                .iter()
                                .filter_map(|chunk_path| client_root.get_path_to(chunk_path))
                                .map(ToString::to_string),
                        );
                    }

                    ClientReferenceType::EcmascriptClientReference(_) => {
                        entry_css_files.extend(
                            client_chunks_paths
                                .iter()
                                .filter_map(|chunk_path| {
                                    if chunk_path.extension() == Some("css") {
                                        client_root.get_path_to(chunk_path)
                                    } else {
                                        None
                                    }
                                })
                                .map(ToString::to_string),
                        );
                    }
                }
            }

            match app_client_reference_ty {
                ClientReferenceType::CssClientReference(_) => {}

                ClientReferenceType::EcmascriptClientReference(ecmascript_client_reference) => {
                    let client_chunks = &app_client_reference_chunks.client_chunks.await?;
                    let ssr_chunks = &app_client_reference_chunks.ssr_chunks.await?;

                    let ecmascript_client_reference = ecmascript_client_reference.await?;

                    let client_module_id = ecmascript_client_reference
                        .client_module
                        .as_chunk_item(client_chunking_context)
                        .id()
                        .await?;
                    let ssr_module_id = ecmascript_client_reference
                        .ssr_module
                        .as_chunk_item(ssr_chunking_context)
                        .id()
                        .await?;

                    let server_path = ecmascript_client_reference
                        .server_ident
                        .path()
                        .to_string()
                        .await?;

                    let client_chunks_paths = client_chunks
                        .iter()
                        .map(|chunk| chunk.ident().path())
                        .try_join()
                        .await?;
                    let client_chunks_paths: Vec<String> = client_chunks_paths
                        .iter()
                        .filter_map(|chunk_path| client_root.get_path_to(chunk_path))
                        .map(ToString::to_string)
                        .collect::<Vec<_>>();

                    let ssr_chunks_paths = ssr_chunks
                        .iter()
                        .map(|chunk| chunk.ident().path())
                        .try_join()
                        .await?;
                    let ssr_chunks_paths = ssr_chunks_paths
                        .iter()
                        .filter_map(|chunk_path| node_root_ref.get_path_to(chunk_path))
                        .map(ToString::to_string)
                        .collect::<Vec<_>>();

                    let mut ssr_manifest_node = ManifestNode::default();

                    entry_manifest.client_modules.module_exports.insert(
                        get_client_reference_module_key(&server_path, "*"),
                        ManifestNodeEntry {
                            name: "*".to_string(),
                            id: (&*client_module_id).into(),
                            chunks: client_chunks_paths.clone(),
                            // TODO(WEB-434)
                            r#async: false,
                        },
                    );

                    ssr_manifest_node.module_exports.insert(
                        "*".to_string(),
                        ManifestNodeEntry {
                            name: "*".to_string(),
                            id: (&*ssr_module_id).into(),
                            chunks: ssr_chunks_paths.clone(),
                            // TODO(WEB-434)
                            r#async: false,
                        },
                    );

                    entry_manifest
                        .ssr_module_mapping
                        .insert((&*client_module_id).into(), ssr_manifest_node);
                }
            }
        }

        let client_reference_manifest_json = serde_json::to_string(&entry_manifest).unwrap();
        let client_reference_manifest_source = VirtualSourceVc::new(
            node_root.join(&format!(
                "server/app/{original_name}_client-reference-manifest.js",
                original_name = app_entry.original_name
            )),
            File::from(formatdoc! {
                r#"
                    globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {{}};
                    globalThis.__RSC_MANIFEST[{original_name}] = {manifest}
                "#,
                original_name = StringifyJs(&app_entry.original_name),
                manifest = StringifyJs(&client_reference_manifest_json)
            })
            .into(),
        );
        all_chunks.push(client_reference_manifest_source.into());
    }

    Ok(())
}

#[turbo_tasks::function]
pub async fn get_app_shared_client_chunk(
    app_client_runtime_entries: EvaluatableAssetsVc,
    client_chunking_context: EcmascriptChunkingContextVc,
) -> Result<EcmascriptChunkVc> {
    let client_runtime_entries: Vec<_> = app_client_runtime_entries
        .await?
        .iter()
        .map(|entry| async move { Ok(EcmascriptChunkPlaceableVc::resolve_from(*entry).await?) })
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .collect();

    Ok(EcmascriptChunkVc::new_normalized(
        client_chunking_context,
        // TODO(alexkirsz) Should this accept Evaluatable instead?
        EcmascriptChunkPlaceablesVc::cell(client_runtime_entries),
        None,
        Value::new(AvailabilityInfo::Untracked),
    ))
}

#[turbo_tasks::function]
pub async fn get_app_client_shared_chunks(
    app_client_runtime_entries: EvaluatableAssetsVc,
    client_chunking_context: EcmascriptChunkingContextVc,
) -> Result<AssetsVc> {
    if app_client_runtime_entries.await?.is_empty() {
        return Ok(AssetsVc::empty());
    }

    let app_client_shared_chunk =
        get_app_shared_client_chunk(app_client_runtime_entries, client_chunking_context);

    let app_client_shared_chunks = client_chunking_context
        .evaluated_chunk_group(app_client_shared_chunk.into(), app_client_runtime_entries);

    Ok(app_client_shared_chunks)
}

/// See next.js/packages/next/src/lib/client-reference.ts
fn get_client_reference_module_key(server_path: &str, export_name: &str) -> String {
    if export_name == "*" {
        server_path.to_string()
    } else {
        format!("{}#{}", server_path, export_name)
    }
}

impl From<&TurbopackModuleId> for ModuleId {
    fn from(module_id: &TurbopackModuleId) -> Self {
        match module_id {
            TurbopackModuleId::String(string) => ModuleId::String(string.clone()),
            TurbopackModuleId::Number(number) => ModuleId::Number(*number as _),
        }
    }
}
