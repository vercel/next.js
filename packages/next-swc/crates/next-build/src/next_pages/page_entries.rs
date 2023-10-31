use anyhow::{bail, Result};
use next_core::{
    create_page_loader_entry_module, get_asset_path_from_pathname,
    mode::NextMode,
    next_client::{
        get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries, ClientContextType,
    },
    next_config::NextConfig,
    next_dynamic::NextDynamicTransition,
    next_manifests::{BuildManifest, PagesManifest},
    next_pages::create_page_ssr_entry_module,
    next_server::{
        get_server_module_options_context, get_server_resolve_options_context,
        get_server_runtime_entries, ServerContextType,
    },
    pages_structure::{
        find_pages_structure, PagesDirectoryStructure, PagesStructure, PagesStructureItem,
    },
    pathname_for_path,
    util::NextRuntime,
    PathType,
};
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::{tasks::Value, tasks_fs::FileSystemPath},
    turbopack::{
        build::BuildChunkingContext,
        core::{
            chunk::{ChunkingContext, EvaluatableAssets},
            compile_time_info::CompileTimeInfo,
            context::AssetContext,
            file_source::FileSource,
            module::Module,
            output::OutputAsset,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
        },
        ecmascript::{
            chunk::{EcmascriptChunkPlaceable, EcmascriptChunkingContext},
            EcmascriptModuleAsset,
        },
        node::execution_context::ExecutionContext,
        turbopack::{transition::ContextTransition, ModuleAssetContext},
    },
};

#[turbo_tasks::value]
pub struct PageEntries {
    pub entries: Vec<Vc<PageEntry>>,
    pub ssr_runtime_entries: Vc<EvaluatableAssets>,
    pub client_runtime_entries: Vc<EvaluatableAssets>,
}

/// Computes all the page entries within the given project root.
#[turbo_tasks::function]
pub async fn get_page_entries(
    next_router_root: Vc<FileSystemPath>,
    project_root: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    client_compile_time_info: Vc<CompileTimeInfo>,
    server_compile_time_info: Vc<CompileTimeInfo>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<PageEntries>> {
    let pages_structure = find_pages_structure(
        project_root,
        next_router_root,
        next_config.page_extensions(),
    );

    let pages_dir = if let Some(pages) = pages_structure.await?.pages {
        pages.project_path().resolve().await?
    } else {
        project_root.join("pages".to_string())
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

    let client_transition = ContextTransition::new(
        client_compile_time_info,
        client_module_options_context,
        client_resolve_options_context,
        Vc::cell("client".to_string()),
    );

    let transitions = Vc::cell(
        [(
            "next-dynamic".to_string(),
            Vc::upcast(NextDynamicTransition::new(client_transition)),
        )]
        .into_iter()
        .collect(),
    );

    let client_module_context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        transitions,
        client_compile_time_info,
        client_module_options_context,
        client_resolve_options_context,
        Vc::cell("client".to_string()),
    ));

    let client_runtime_entries = get_client_runtime_entries(
        project_root,
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

    let ssr_module_context = Vc::upcast(ModuleAssetContext::new(
        transitions,
        server_compile_time_info,
        ssr_module_options_context,
        ssr_resolve_options_context,
        Vc::cell("ssr".to_string()),
    ));

    let ssr_runtime_entries = get_server_runtime_entries(ssr_ty, mode);
    let ssr_runtime_entries = ssr_runtime_entries.resolve_entries(ssr_module_context);

    let entries = get_page_entries_for_root_directory(
        ssr_module_context,
        client_module_context,
        pages_structure,
        project_root,
        next_router_root,
        next_config,
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
    ssr_module_context: Vc<Box<dyn AssetContext>>,
    client_module_context: Vc<Box<dyn AssetContext>>,
    pages_structure: Vc<PagesStructure>,
    project_root: Vc<FileSystemPath>,
    next_router_root: Vc<FileSystemPath>,
    next_config: Vc<NextConfig>,
) -> Result<Vec<Vc<PageEntry>>> {
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
        Vc::upcast(FileSource::new(app.project_path)),
        project_root,
        next_router_root,
        app.next_router_path,
        app.original_path,
        PathType::PagesPage,
        next_config,
    ));

    // This only makes sense on the server.
    let document = document.await?;
    entries.push(get_page_entry_for_file(
        ssr_module_context,
        client_module_context,
        Vc::upcast(FileSource::new(document.project_path)),
        project_root,
        next_router_root,
        document.next_router_path,
        document.original_path,
        PathType::PagesPage,
        next_config,
    ));

    // This only makes sense on both the client and the server, but they should map
    // to different assets (server can be an external module).
    let error = error.await?;
    entries.push(get_page_entry_for_file(
        ssr_module_context,
        client_module_context,
        Vc::upcast(FileSource::new(error.project_path)),
        project_root,
        next_router_root,
        error.next_router_path,
        error.original_path,
        PathType::PagesPage,
        next_config,
    ));

    if let Some(api) = api {
        get_page_entries_for_directory(
            ssr_module_context,
            client_module_context,
            api,
            project_root,
            next_router_root,
            &mut entries,
            PathType::PagesApi,
            next_config,
        )
        .await?;
    }

    if let Some(pages) = pages {
        get_page_entries_for_directory(
            ssr_module_context,
            client_module_context,
            pages,
            project_root,
            next_router_root,
            &mut entries,
            PathType::PagesPage,
            next_config,
        )
        .await?;
    }

    Ok(entries)
}

#[async_recursion::async_recursion]
async fn get_page_entries_for_directory(
    ssr_module_context: Vc<Box<dyn AssetContext>>,
    client_module_context: Vc<Box<dyn AssetContext>>,
    pages_structure: Vc<PagesDirectoryStructure>,
    project_root: Vc<FileSystemPath>,
    next_router_root: Vc<FileSystemPath>,
    entries: &mut Vec<Vc<PageEntry>>,
    path_type: PathType,
    next_config: Vc<NextConfig>,
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
            original_path,
        } = *item.await?;
        entries.push(get_page_entry_for_file(
            ssr_module_context,
            client_module_context,
            Vc::upcast(FileSource::new(project_path)),
            project_root,
            next_router_root,
            next_router_path,
            original_path,
            path_type,
            next_config,
        ));
    }

    for child in children.iter() {
        get_page_entries_for_directory(
            ssr_module_context,
            client_module_context,
            *child,
            project_root,
            next_router_root,
            entries,
            path_type,
            next_config,
        )
        .await?;
    }

    Ok(())
}

/// A page entry corresponding to some route.
#[turbo_tasks::value]
pub struct PageEntry {
    /// The pathname of the page.
    pub pathname: Vc<String>,
    /// The Node.js SSR entry module asset.
    pub ssr_module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    /// The client entry module asset.
    pub client_module: Vc<EcmascriptModuleAsset>,
}

#[turbo_tasks::function]
async fn get_page_entry_for_file(
    ssr_module_context: Vc<Box<dyn AssetContext>>,
    client_module_context: Vc<Box<dyn AssetContext>>,
    source: Vc<Box<dyn Source>>,
    project_root: Vc<FileSystemPath>,
    next_router_root: Vc<FileSystemPath>,
    next_router_path: Vc<FileSystemPath>,
    next_original_path: Vc<FileSystemPath>,
    path_type: PathType,
    next_config: Vc<NextConfig>,
) -> Result<Vc<PageEntry>> {
    let reference_type = Value::new(ReferenceType::Entry(match path_type {
        PathType::PagesPage => EntryReferenceSubType::Page,
        PathType::PagesApi => EntryReferenceSubType::PagesApi,
        _ => bail!("Invalid path type"),
    }));

    let pathname = pathname_for_path(next_router_root, next_router_path, path_type);
    let original_name = next_original_path.await?.path.clone();

    let ssr_module = create_page_ssr_entry_module(
        pathname,
        reference_type,
        project_root,
        ssr_module_context,
        source,
        Vc::cell(original_name),
        NextRuntime::NodeJs,
        next_config,
    );

    let client_module = create_page_loader_entry_module(client_module_context, source, pathname);

    let Some(client_module) =
        Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(client_module).await?
    else {
        bail!("expected an ECMAScript module asset");
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
async fn pathname_from_path(next_router_path: Vc<FileSystemPath>) -> Result<Vc<String>> {
    let pathname = next_router_path.await?;
    Ok(Vc::cell(pathname.path.clone()))
}

/// Computes the chunks of page entries, adds their paths to the corresponding
/// manifests, and pushes the assets to the `all_chunks` vec.
pub async fn compute_page_entries_chunks(
    page_entries: &PageEntries,
    client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ssr_chunking_context: Vc<BuildChunkingContext>,
    node_root: Vc<FileSystemPath>,
    pages_manifest_dir_path: &FileSystemPath,
    client_relative_path: &FileSystemPath,
    pages_manifest: &mut PagesManifest,
    build_manifest: &mut BuildManifest,
    all_chunks: &mut Vec<Vc<Box<dyn OutputAsset>>>,
) -> Result<()> {
    for page_entry in page_entries.entries.iter() {
        let page_entry = page_entry.await?;
        let pathname = page_entry.pathname.await?;
        let asset_path: String = get_asset_path_from_pathname(&pathname, ".js");

        let ssr_entry_chunk = ssr_chunking_context.entry_chunk_group(
            node_root.join(format!("server/pages/{asset_path}")),
            Vc::upcast(page_entry.ssr_module),
            page_entries.ssr_runtime_entries,
        );
        all_chunks.push(ssr_entry_chunk);

        let chunk_path = ssr_entry_chunk.ident().path().await?;
        if let Some(asset_path) = pages_manifest_dir_path.get_path_to(&chunk_path) {
            pages_manifest
                .pages
                .insert(pathname.clone_value(), asset_path.to_string());
        }

        let client_chunks = client_chunking_context.evaluated_chunk_group(
            page_entry.client_module.ident(),
            page_entries
                .client_runtime_entries
                .with_entry(Vc::upcast(page_entry.client_module)),
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
