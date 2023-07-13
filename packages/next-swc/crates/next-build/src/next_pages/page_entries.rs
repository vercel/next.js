use anyhow::{bail, Result};
use next_core::{
    create_page_loader_entry_module, get_asset_path_from_pathname,
    mode::NextMode,
    next_client::{
        get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries, ClientContextType,
    },
    next_config::NextConfigVc,
    next_dynamic::NextDynamicTransitionVc,
    next_server::{
        get_server_module_options_context, get_server_resolve_options_context,
        get_server_runtime_entries, ServerContextType,
    },
    pages_structure::{
        find_pages_structure, PagesDirectoryStructure, PagesDirectoryStructureVc, PagesStructure,
        PagesStructureItem, PagesStructureVc,
    },
    pathname_for_path, PathType,
};
use turbopack_binding::{
    turbo::{
        tasks::{primitives::StringVc, Value},
        tasks_env::ProcessEnvVc,
        tasks_fs::{FileSystemPath, FileSystemPathVc},
    },
    turbopack::{
        build::BuildChunkingContextVc,
        core::{
            asset::Asset,
            chunk::{ChunkableModule, ChunkingContext, EvaluatableAssetsVc},
            compile_time_info::CompileTimeInfoVc,
            context::{AssetContext, AssetContextVc},
            file_source::FileSourceVc,
            output::OutputAssetVc,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::SourceVc,
        },
        ecmascript::{
            chunk::{EcmascriptChunkPlaceableVc, EcmascriptChunkingContextVc},
            EcmascriptModuleAssetVc,
        },
        node::execution_context::ExecutionContextVc,
        turbopack::{
            transition::{ContextTransitionVc, TransitionsByNameVc},
            ModuleAssetContextVc,
        },
    },
};

use crate::manifests::{BuildManifest, PagesManifest};

#[turbo_tasks::value]
pub struct PageEntries {
    pub entries: Vec<PageEntryVc>,
    pub ssr_runtime_entries: EvaluatableAssetsVc,
    pub client_runtime_entries: EvaluatableAssetsVc,
}

/// Computes all the page entries within the given project root.
#[turbo_tasks::function]
pub async fn get_page_entries(
    next_router_root: FileSystemPathVc,
    project_root: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    env: ProcessEnvVc,
    client_compile_time_info: CompileTimeInfoVc,
    server_compile_time_info: CompileTimeInfoVc,
    next_config: NextConfigVc,
) -> Result<PageEntriesVc> {
    let pages_structure = find_pages_structure(
        project_root,
        next_router_root,
        next_config.page_extensions(),
    );

    let pages_dir = if let Some(pages) = pages_structure.await?.pages {
        pages.project_path().resolve().await?
    } else {
        project_root.join("pages")
    };

    let mode = NextMode::Build;

    let client_ty = Value::new(ClientContextType::Pages { pages_dir });
    let ssr_ty = Value::new(ServerContextType::Pages { pages_dir });

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

    let transitions = TransitionsByNameVc::cell(
        [(
            "next-dynamic".to_string(),
            NextDynamicTransitionVc::new(client_transition).into(),
        )]
        .into_iter()
        .collect(),
    );

    let client_module_context: AssetContextVc = ModuleAssetContextVc::new(
        transitions,
        client_compile_time_info,
        client_module_options_context,
        client_resolve_options_context,
    )
    .into();

    let client_runtime_entries = get_client_runtime_entries(
        project_root,
        env,
        client_ty,
        mode,
        next_config,
        execution_context,
    );
    let client_runtime_entries = client_runtime_entries.resolve_entries(client_module_context);

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

    let ssr_module_context = ModuleAssetContextVc::new(
        transitions,
        server_compile_time_info,
        ssr_module_options_context,
        ssr_resolve_options_context,
    )
    .into();

    let ssr_runtime_entries =
        get_server_runtime_entries(project_root, env, ssr_ty, mode, next_config);
    let ssr_runtime_entries = ssr_runtime_entries.resolve_entries(ssr_module_context);

    let entries = get_page_entries_for_root_directory(
        ssr_module_context,
        client_module_context,
        pages_structure,
        next_router_root,
    )
    .await?;

    Ok(PageEntries {
        entries,
        ssr_runtime_entries,
        client_runtime_entries,
    }
    .cell())
}

async fn get_page_entries_for_root_directory(
    ssr_module_context: AssetContextVc,
    client_module_context: AssetContextVc,
    pages_structure: PagesStructureVc,
    next_router_root: FileSystemPathVc,
) -> Result<Vec<PageEntryVc>> {
    let PagesStructure {
        app,
        document,
        error,
        api,
        pages,
    } = *pages_structure.await?;
    let mut entries = vec![];

    // This only makes sense on both the client and the server, but they should map
    // to different assets (server can be an external module).
    let app = app.await?;
    entries.push(get_page_entry_for_file(
        ssr_module_context,
        client_module_context,
        FileSourceVc::new(app.project_path).into(),
        next_router_root,
        app.next_router_path,
    ));

    // This only makes sense on the server.
    let document = document.await?;
    entries.push(get_page_entry_for_file(
        ssr_module_context,
        client_module_context,
        FileSourceVc::new(document.project_path).into(),
        next_router_root,
        document.next_router_path,
    ));

    // This only makes sense on both the client and the server, but they should map
    // to different assets (server can be an external module).
    let error = error.await?;
    entries.push(get_page_entry_for_file(
        ssr_module_context,
        client_module_context,
        FileSourceVc::new(error.project_path).into(),
        next_router_root,
        error.next_router_path,
    ));

    if let Some(api) = api {
        get_page_entries_for_directory(
            ssr_module_context,
            client_module_context,
            api,
            next_router_root,
            &mut entries,
        )
        .await?;
    }

    if let Some(pages) = pages {
        get_page_entries_for_directory(
            ssr_module_context,
            client_module_context,
            pages,
            next_router_root,
            &mut entries,
        )
        .await?;
    }

    Ok(entries)
}

#[async_recursion::async_recursion]
async fn get_page_entries_for_directory(
    ssr_module_context: AssetContextVc,
    client_module_context: AssetContextVc,
    pages_structure: PagesDirectoryStructureVc,
    next_router_root: FileSystemPathVc,
    entries: &mut Vec<PageEntryVc>,
) -> Result<()> {
    let PagesDirectoryStructure {
        ref items,
        ref children,
        ..
    } = *pages_structure.await?;

    for item in items.iter() {
        let PagesStructureItem {
            project_path,
            next_router_path,
            original_path: _,
        } = *item.await?;
        entries.push(get_page_entry_for_file(
            ssr_module_context,
            client_module_context,
            FileSourceVc::new(project_path).into(),
            next_router_root,
            next_router_path,
        ));
    }

    for child in children.iter() {
        get_page_entries_for_directory(
            ssr_module_context,
            client_module_context,
            *child,
            next_router_root,
            entries,
        )
        .await?;
    }

    Ok(())
}

/// A page entry corresponding to some route.
#[turbo_tasks::value]
pub struct PageEntry {
    /// The pathname of the page.
    pub pathname: StringVc,
    /// The Node.js SSR entry module asset.
    pub ssr_module: EcmascriptChunkPlaceableVc,
    /// The client entry module asset.
    pub client_module: EcmascriptModuleAssetVc,
}

#[turbo_tasks::function]
async fn get_page_entry_for_file(
    ssr_module_context: AssetContextVc,
    client_module_context: AssetContextVc,
    source: SourceVc,
    next_router_root: FileSystemPathVc,
    next_router_path: FileSystemPathVc,
) -> Result<PageEntryVc> {
    let reference_type = Value::new(ReferenceType::Entry(EntryReferenceSubType::Page));

    let pathname = pathname_for_path(next_router_root, next_router_path, PathType::Page);

    let ssr_module = ssr_module_context.process(source, reference_type.clone());

    let client_module = create_page_loader_entry_module(client_module_context, source, pathname);

    let Some(client_module) = EcmascriptModuleAssetVc::resolve_from(client_module).await? else {
        bail!("expected an ECMAScript module asset");
    };

    let Some(ssr_module) = EcmascriptChunkPlaceableVc::resolve_from(ssr_module).await? else {
        bail!("expected an ECMAScript chunk placeable asset");
    };

    Ok(PageEntry {
        pathname,
        ssr_module,
        client_module,
    }
    .cell())
}

/// Computes the pathname for a given path.
#[turbo_tasks::function]
async fn pathname_from_path(next_router_path: FileSystemPathVc) -> Result<StringVc> {
    let pathname = next_router_path.await?;
    Ok(StringVc::cell(pathname.path.clone()))
}

/// Computes the chunks of page entries, adds their paths to the corresponding
/// manifests, and pushes the assets to the `all_chunks` vec.
pub async fn compute_page_entries_chunks(
    page_entries: &PageEntries,
    client_chunking_context: EcmascriptChunkingContextVc,
    ssr_chunking_context: BuildChunkingContextVc,
    node_root: FileSystemPathVc,
    pages_manifest_dir_path: &FileSystemPath,
    client_relative_path: &FileSystemPath,
    pages_manifest: &mut PagesManifest,
    build_manifest: &mut BuildManifest,
    all_chunks: &mut Vec<OutputAssetVc>,
) -> Result<()> {
    for page_entry in page_entries.entries.iter() {
        let page_entry = page_entry.await?;
        let pathname = page_entry.pathname.await?;
        let asset_path: String = get_asset_path_from_pathname(&pathname, ".js");

        let ssr_entry_chunk = ssr_chunking_context.entry_chunk(
            node_root.join(&format!("server/pages/{asset_path}")),
            page_entry.ssr_module,
            page_entries.ssr_runtime_entries,
        );
        all_chunks.push(ssr_entry_chunk);

        let chunk_path = ssr_entry_chunk.ident().path().await?;
        if let Some(asset_path) = pages_manifest_dir_path.get_path_to(&chunk_path) {
            pages_manifest
                .pages
                .insert(pathname.clone_value(), asset_path.to_string());
        }

        let client_entry_chunk = page_entry
            .client_module
            .as_root_chunk(client_chunking_context.into());

        let client_chunks = client_chunking_context.evaluated_chunk_group(
            client_entry_chunk,
            page_entries
                .client_runtime_entries
                .with_entry(page_entry.client_module.into()),
        );

        let build_manifest_pages_entry = build_manifest
            .pages
            .entry(pathname.clone_value())
            .or_default();

        for chunk in client_chunks.await?.iter().copied() {
            all_chunks.push(chunk);
            let chunk_path = chunk.ident().path().await?;
            if let Some(asset_path) = client_relative_path.get_path_to(&chunk_path) {
                build_manifest_pages_entry.push(asset_path.to_string());
            }
        }
    }
    Ok(())
}
