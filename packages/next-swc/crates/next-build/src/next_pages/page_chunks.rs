use anyhow::{bail, Result};
use next_core::{
    env::env_for_js,
    mode::NextMode,
    next_client::{
        get_client_compile_time_info, get_client_module_options_context,
        get_client_resolve_options_context, get_client_runtime_entries, ClientContextType,
        RuntimeEntriesVc, RuntimeEntry,
    },
    next_client_chunks::NextClientChunksTransitionVc,
    next_config::NextConfigVc,
    next_server::{
        get_server_compile_time_info, get_server_module_options_context,
        get_server_resolve_options_context, ServerContextType,
    },
    pages_structure::{
        OptionPagesStructureVc, PagesDirectoryStructure, PagesDirectoryStructureVc, PagesStructure,
        PagesStructureItem, PagesStructureVc,
    },
    turbopack::core::{asset::AssetsVc, chunk::EvaluatableAssetsVc},
};
use turbo_binding::{
    turbo::{
        tasks::{primitives::StringVc, Value},
        tasks_env::ProcessEnvVc,
        tasks_fs::FileSystemPathVc,
    },
    turbopack::{
        core::{
            asset::AssetVc,
            chunk::ChunkVc,
            context::AssetContextVc,
            environment::ServerAddrVc,
            reference_type::{EntryReferenceSubType, ReferenceType},
            resolve::parse::RequestVc,
            source_asset::SourceAssetVc,
            virtual_asset::VirtualAssetVc,
        },
        ecmascript::chunk::EcmascriptChunkPlaceablesVc,
        env::ProcessEnvAssetVc,
        node::execution_context::ExecutionContextVc,
        turbopack::{transition::TransitionsByNameVc, ModuleAssetContextVc},
    },
};

use super::{client_context::PagesBuildClientContextVc, node_context::PagesBuildNodeContextVc};

#[turbo_tasks::value(transparent)]
pub struct PageChunks(Vec<PageChunkVc>);

#[turbo_tasks::value_impl]
impl PageChunksVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        PageChunks(vec![]).cell()
    }
}

// TODO(alexkirsz)
#[turbo_tasks::function]
pub async fn get_page_chunks(
    pages_structure: OptionPagesStructureVc,
    project_root: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    node_root: FileSystemPathVc,
    client_root: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
    next_config: NextConfigVc,
    node_addr: ServerAddrVc,
) -> Result<PageChunksVc> {
    let Some(pages_structure) = *pages_structure.await? else {
        return Ok(PageChunksVc::empty());
    };
    let pages_dir = pages_structure.project_path().resolve().await?;

    let mode = Value::new(NextMode::Build);

    let client_ty = Value::new(ClientContextType::Pages { pages_dir });
    let node_ty = Value::new(ServerContextType::Pages { pages_dir });

    let client_compile_time_info = get_client_compile_time_info(mode, browserslist_query);

    let transitions = TransitionsByNameVc::cell(
        [(
            // TODO(alexkirsz) Should accept client chunking context? But how do we get this?
            "next-client-chunks".to_string(),
            NextClientChunksTransitionVc::new(
                project_root,
                execution_context,
                client_ty,
                mode,
                client_root,
                client_compile_time_info,
                next_config,
            )
            .into(),
        )]
        .into_iter()
        .collect(),
    );

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
    let client_asset_context: AssetContextVc = ModuleAssetContextVc::new(
        transitions,
        client_compile_time_info,
        client_module_options_context,
        client_resolve_options_context,
    )
    .into();

    let node_compile_time_info = get_server_compile_time_info(node_ty, env, node_addr);
    let node_resolve_options_context = get_server_resolve_options_context(
        project_root,
        node_ty,
        mode,
        next_config,
        execution_context,
    );
    let node_module_options_context = get_server_module_options_context(
        project_root,
        execution_context,
        node_ty,
        mode,
        next_config,
    );

    let node_asset_context = ModuleAssetContextVc::new(
        transitions,
        node_compile_time_info,
        node_module_options_context,
        node_resolve_options_context,
    )
    .into();

    let node_runtime_entries = get_node_runtime_entries(project_root, env, next_config);

    let client_runtime_entries = get_client_runtime_entries(
        project_root,
        env,
        client_ty,
        mode,
        next_config,
        execution_context,
    );
    let client_runtime_entries = client_runtime_entries.resolve_entries(client_asset_context);

    let node_build_context = PagesBuildNodeContextVc::new(
        project_root,
        node_root,
        node_asset_context,
        node_runtime_entries,
    );
    let client_build_context = PagesBuildClientContextVc::new(
        project_root,
        client_root,
        client_asset_context,
        client_runtime_entries,
    );

    Ok(get_page_chunks_for_root_directory(
        node_build_context,
        client_build_context,
        pages_structure,
    ))
}

#[turbo_tasks::function]
async fn get_page_chunks_for_root_directory(
    node_build_context: PagesBuildNodeContextVc,
    client_build_context: PagesBuildClientContextVc,
    pages_structure: PagesStructureVc,
) -> Result<PageChunksVc> {
    let PagesStructure {
        app,
        document,
        error,
        api,
        pages,
    } = *pages_structure.await?;
    let mut chunks = vec![];

    // This only makes sense on both the client and the server, but they should map
    // to different assets (server can be an external module).
    let app = app.await?;
    chunks.push(get_page_chunk_for_file(
        node_build_context,
        client_build_context,
        SourceAssetVc::new(app.project_path).into(),
        app.next_router_path,
    ));

    // This only makes sense on the server.
    let document = document.await?;
    chunks.push(get_page_chunk_for_file(
        node_build_context,
        client_build_context,
        SourceAssetVc::new(document.project_path).into(),
        document.next_router_path,
    ));

    // This only makes sense on both the client and the server, but they should map
    // to different assets (server can be an external module).
    let error = error.await?;
    chunks.push(get_page_chunk_for_file(
        node_build_context,
        client_build_context,
        SourceAssetVc::new(error.project_path).into(),
        error.next_router_path,
    ));

    if let Some(api) = api {
        chunks.extend(
            get_page_chunks_for_directory(node_build_context, client_build_context, api)
                .await?
                .iter()
                .copied(),
        );
    }

    chunks.extend(
        get_page_chunks_for_directory(node_build_context, client_build_context, pages)
            .await?
            .iter()
            .copied(),
    );

    Ok(PageChunksVc::cell(chunks))
}

#[turbo_tasks::function]
async fn get_page_chunks_for_directory(
    node_build_context: PagesBuildNodeContextVc,
    client_build_context: PagesBuildClientContextVc,
    pages_structure: PagesDirectoryStructureVc,
) -> Result<PageChunksVc> {
    let PagesDirectoryStructure {
        ref items,
        ref children,
        ..
    } = *pages_structure.await?;
    let mut chunks = vec![];

    for item in items.iter() {
        match *item.await? {
            PagesStructureItem {
                project_path,
                next_router_path,
                specificity: _,
            } => {
                chunks.push(get_page_chunk_for_file(
                    node_build_context,
                    client_build_context,
                    SourceAssetVc::new(project_path).into(),
                    next_router_path,
                ));
            }
        }
    }

    for child in children.iter() {
        chunks.extend(
            // TODO(alexkirsz) This should be a tree structure instead of a flattened list.
            get_page_chunks_for_directory(node_build_context, client_build_context, *child)
                .await?
                .iter()
                .copied(),
        )
    }

    Ok(PageChunksVc::cell(chunks))
}

#[turbo_tasks::value]
pub struct PageChunk {
    pub next_router_path: FileSystemPathVc,
    pub node_chunk: AssetVc,
    pub client_chunks: AssetsVc,
}

#[turbo_tasks::function]
async fn get_page_chunk_for_file(
    node_build_context: PagesBuildNodeContextVc,
    client_build_context: PagesBuildClientContextVc,
    page_asset: AssetVc,
    next_router_path: FileSystemPathVc,
) -> Result<PageChunkVc> {
    let reference_type = Value::new(ReferenceType::Entry(EntryReferenceSubType::Page));

    let pathname = pathname_from_path(next_router_path);

    Ok(PageChunk {
        next_router_path,
        node_chunk: node_build_context.node_chunk(page_asset, pathname, reference_type.clone()),
        client_chunks: client_build_context.client_chunk(page_asset, pathname, reference_type),
    }
    .cell())
}

#[turbo_tasks::function]
async fn pathname_from_path(next_router_path: FileSystemPathVc) -> Result<StringVc> {
    let pathname = next_router_path.await?;
    Ok(StringVc::cell(pathname.path.clone()))
}

#[turbo_tasks::function]
fn get_node_runtime_entries(
    project_root: FileSystemPathVc,
    env: ProcessEnvVc,
    next_config: NextConfigVc,
) -> RuntimeEntriesVc {
    let mut node_runtime_entries = vec![];

    node_runtime_entries.push(
        RuntimeEntry::Source(
            ProcessEnvAssetVc::new(project_root, env_for_js(env, false, next_config)).into(),
        )
        .cell(),
    );

    RuntimeEntriesVc::cell(node_runtime_entries)
}
