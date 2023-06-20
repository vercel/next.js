use anyhow::{bail, Result};
use indexmap::indexmap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{JsonValueVc, StringVc, StringsVc},
    trace::TraceRawVcs,
    Value,
};
use turbopack_binding::{
    turbo::{
        tasks_env::{CustomProcessEnvVc, EnvMapVc, ProcessEnvVc},
        tasks_fs::{FileContent, FileSystemPathVc},
    },
    turbopack::{
        core::{
            asset::{AssetVc, AssetsVc},
            chunk::{ChunkingContextVc, EvaluatableAssetVc, EvaluatableAssetsVc},
            context::{AssetContext, AssetContextVc},
            environment::{EnvironmentIntention, ServerAddrVc},
            reference_type::{EntryReferenceSubType, InnerAssetsVc, ReferenceType},
            source_asset::SourceAssetVc,
        },
        dev::DevChunkingContextVc,
        dev_server::{
            html::DevHtmlAssetVc,
            source::{
                asset_graph::AssetGraphContentSourceVc,
                combined::{CombinedContentSource, CombinedContentSourceVc},
                specificity::SpecificityVc,
                ContentSourceData, ContentSourceVc,
            },
        },
        env::ProcessEnvAssetVc,
        node::{
            debug::should_debug,
            execution_context::ExecutionContextVc,
            render::{
                node_api_source::create_node_api_source,
                rendered_source::create_node_rendered_source,
            },
            route_matcher::RouteMatcherVc,
            NodeEntry, NodeEntryVc, NodeRenderingEntry, NodeRenderingEntryVc,
        },
        turbopack::{transition::TransitionsByNameVc, ModuleAssetContextVc},
    },
};

use crate::{
    embed_js::next_asset,
    env::env_for_js,
    fallback::get_fallback_page,
    mode::NextMode,
    next_client::{
        context::{
            get_client_assets_path, get_client_chunking_context, get_client_compile_time_info,
            get_client_module_options_context, get_client_resolve_options_context,
            get_client_runtime_entries, ClientContextType,
        },
        transition::NextClientTransition,
    },
    next_client_chunks::client_chunks_transition::NextClientChunksTransitionVc,
    next_config::NextConfigVc,
    next_edge::{
        context::{get_edge_compile_time_info, get_edge_resolve_options_context},
        route_transition::NextEdgeRouteTransition,
    },
    next_route_matcher::{
        NextExactMatcherVc, NextFallbackMatcherVc, NextParamsMatcherVc,
        NextPrefixSuffixParamsMatcherVc,
    },
    next_server::context::{
        get_server_compile_time_info, get_server_module_options_context,
        get_server_resolve_options_context, ServerContextType,
    },
    page_loader::create_page_loader,
    pages_structure::{
        OptionPagesStructureVc, PagesDirectoryStructure, PagesDirectoryStructureVc, PagesStructure,
        PagesStructureItem, PagesStructureVc,
    },
    util::{parse_config_from_source, pathname_for_path, render_data, NextRuntime, PathType},
};

/// Create a content source serving the `pages` or `src/pages` directory as
/// Next.js pages folder.
#[turbo_tasks::function]
pub async fn create_page_source(
    pages_structure: OptionPagesStructureVc,
    project_root: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    node_root: FileSystemPathVc,
    client_root: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
) -> Result<ContentSourceVc> {
    let (pages_dir, pages_structure) = if let Some(pages_structure) = *pages_structure.await? {
        (
            pages_structure.project_path().resolve().await?,
            Some(pages_structure),
        )
    } else {
        (project_root.join("pages"), None)
    };

    let mode = NextMode::Development;
    let client_ty = Value::new(ClientContextType::Pages { pages_dir });
    let server_ty = Value::new(ServerContextType::Pages { pages_dir });
    let server_data_ty = Value::new(ServerContextType::PagesData { pages_dir });

    let client_compile_time_info = get_client_compile_time_info(mode, browserslist_query);
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

    let client_chunking_context = get_client_chunking_context(
        project_root,
        client_root,
        client_compile_time_info.environment(),
        client_ty,
    );

    let client_runtime_entries = get_client_runtime_entries(
        project_root,
        env,
        client_ty,
        mode,
        next_config,
        execution_context,
    );

    let next_client_transition = NextClientTransition {
        is_app: false,
        client_chunking_context,
        client_module_options_context,
        client_resolve_options_context,
        client_compile_time_info,
        runtime_entries: client_runtime_entries,
    }
    .cell()
    .into();

    let edge_compile_time_info = get_edge_compile_time_info(
        project_root,
        server_addr,
        Value::new(EnvironmentIntention::Api),
    );

    let edge_chunking_context = DevChunkingContextVc::builder(
        project_root,
        node_root.join("edge"),
        node_root.join("edge/chunks"),
        get_client_assets_path(
            client_root,
            Value::new(ClientContextType::Pages { pages_dir }),
        ),
        edge_compile_time_info.environment(),
    )
    .reference_chunk_source_maps(should_debug("page_source"))
    .build();
    let edge_resolve_options_context =
        get_edge_resolve_options_context(project_root, server_ty, next_config, execution_context);

    let next_edge_transition = NextEdgeRouteTransition {
        edge_compile_time_info,
        edge_chunking_context,
        edge_module_options_context: None,
        edge_resolve_options_context,
        output_path: node_root,
        base_path: project_root,
        bootstrap_asset: next_asset("entry/edge-bootstrap.ts"),
        entry_name: "edge".to_string(),
    }
    .cell()
    .into();

    let server_compile_time_info = get_server_compile_time_info(server_ty, mode, env, server_addr);
    let server_resolve_options_context = get_server_resolve_options_context(
        project_root,
        server_ty,
        mode,
        next_config,
        execution_context,
    );

    let server_module_options_context = get_server_module_options_context(
        project_root,
        execution_context,
        server_ty,
        mode,
        next_config,
    );

    let server_data_module_options_context = get_server_module_options_context(
        project_root,
        execution_context,
        server_data_ty,
        mode,
        next_config,
    );

    let transitions = TransitionsByNameVc::cell(
        [
            ("next-edge".to_string(), next_edge_transition),
            ("next-client".to_string(), next_client_transition),
            (
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
            ),
        ]
        .into_iter()
        .collect(),
    );

    let client_context: AssetContextVc = ModuleAssetContextVc::new(
        transitions,
        client_compile_time_info,
        client_module_options_context,
        client_resolve_options_context,
    )
    .into();
    let server_context: AssetContextVc = ModuleAssetContextVc::new(
        transitions,
        server_compile_time_info,
        server_module_options_context,
        server_resolve_options_context,
    )
    .into();
    let server_data_context: AssetContextVc = ModuleAssetContextVc::new(
        transitions,
        server_compile_time_info,
        server_data_module_options_context,
        server_resolve_options_context,
    )
    .into();

    let injected_env = env_for_js(EnvMapVc::empty().into(), false, next_config);
    let env = CustomProcessEnvVc::new(env, next_config.env()).as_process_env();

    let server_runtime_entries =
        AssetsVc::cell(vec![
            ProcessEnvAssetVc::new(project_root, injected_env).into()
        ]);
    let fallback_runtime_entries = AssetsVc::cell(vec![]);

    let fallback_page = get_fallback_page(
        project_root,
        execution_context,
        client_root,
        env,
        client_compile_time_info,
        next_config,
    );

    let render_data = render_data(next_config, server_addr);
    let page_extensions = next_config.page_extensions();

    let mut sources = vec![];

    // Match _next/404 first to ensure rewrites work properly.
    sources.push(
        create_not_found_page_source(
            project_root,
            env,
            server_context,
            client_context,
            pages_dir,
            page_extensions,
            fallback_runtime_entries,
            fallback_page,
            client_root,
            node_root.join("force_not_found"),
            SpecificityVc::exact(),
            NextExactMatcherVc::new(StringVc::cell("_next/404".to_string())).into(),
            render_data,
        )
        .issue_context(pages_dir, "Next.js pages directory not found"),
    );

    if let Some(pages_structure) = pages_structure {
        sources.push(create_page_source_for_root_directory(
            pages_structure,
            project_root,
            env,
            server_context,
            server_data_context,
            client_context,
            pages_dir,
            server_runtime_entries,
            fallback_page,
            client_root,
            node_root,
            render_data,
        ));
    }

    sources.push(
        AssetGraphContentSourceVc::new_eager(client_root, fallback_page.as_asset())
            .as_content_source()
            .issue_context(pages_dir, "Next.js pages directory fallback"),
    );

    sources.push(
        create_not_found_page_source(
            project_root,
            env,
            server_context,
            client_context,
            pages_dir,
            page_extensions,
            fallback_runtime_entries,
            fallback_page,
            client_root,
            node_root.join("fallback_not_found"),
            SpecificityVc::not_found(),
            NextFallbackMatcherVc::new().into(),
            render_data,
        )
        .issue_context(pages_dir, "Next.js pages directory not found fallback"),
    );

    let source = CombinedContentSource { sources }.cell().into();
    Ok(source)
}

/// Handles a single page file in the pages directory
#[turbo_tasks::function]
async fn create_page_source_for_file(
    project_path: FileSystemPathVc,
    env: ProcessEnvVc,
    server_context: AssetContextVc,
    server_data_context: AssetContextVc,
    client_context: AssetContextVc,
    pages_dir: FileSystemPathVc,
    specificity: SpecificityVc,
    page_asset: AssetVc,
    runtime_entries: AssetsVc,
    fallback_page: DevHtmlAssetVc,
    client_root: FileSystemPathVc,
    client_path: FileSystemPathVc,
    is_api_path: bool,
    node_path: FileSystemPathVc,
    node_root: FileSystemPathVc,
    render_data: JsonValueVc,
) -> Result<ContentSourceVc> {
    let server_chunking_context = DevChunkingContextVc::builder(
        project_path,
        node_path,
        node_path.join("chunks"),
        get_client_assets_path(
            client_root,
            Value::new(ClientContextType::Pages { pages_dir }),
        ),
        server_context.compile_time_info().environment(),
    )
    .reference_chunk_source_maps(should_debug("page_source"))
    .build();

    let data_node_path = node_path.join("data");

    let server_data_chunking_context = DevChunkingContextVc::builder(
        project_path,
        data_node_path,
        data_node_path.join("chunks"),
        get_client_assets_path(
            client_root,
            Value::new(ClientContextType::Pages { pages_dir }),
        ),
        server_context.compile_time_info().environment(),
    )
    .reference_chunk_source_maps(should_debug("page_source"))
    .build();

    let client_chunking_context = get_client_chunking_context(
        project_path,
        client_root,
        client_context.compile_time_info().environment(),
        Value::new(ClientContextType::Pages { pages_dir }),
    );

    let pathname = pathname_for_path(client_root, client_path, PathType::Page);
    let route_matcher = NextParamsMatcherVc::new(pathname);

    Ok(if is_api_path {
        create_node_api_source(
            project_path,
            env,
            specificity,
            client_root,
            route_matcher.into(),
            pathname,
            SsrEntry {
                runtime_entries,
                context: server_context,
                entry_asset: page_asset,
                ty: SsrType::AutoApi,
                chunking_context: server_chunking_context,
                node_path,
                node_root,
                project_path,
            }
            .cell()
            .into(),
            render_data,
            should_debug("page_source"),
        )
    } else {
        let data_pathname = pathname_for_path(client_root, client_path, PathType::Data);
        let data_route_matcher =
            NextPrefixSuffixParamsMatcherVc::new(data_pathname, "_next/data/development/", ".json");

        let ssr_entry = SsrEntry {
            runtime_entries,
            context: server_context,
            entry_asset: page_asset,
            ty: SsrType::Html,
            chunking_context: server_chunking_context,
            node_path,
            node_root,
            project_path,
        }
        .cell()
        .into();

        let ssr_data_entry = SsrEntry {
            runtime_entries,
            context: server_data_context,
            entry_asset: page_asset,
            ty: SsrType::Data,
            chunking_context: server_data_chunking_context,
            node_path: data_node_path,
            node_root,
            project_path,
        }
        .cell()
        .into();

        CombinedContentSourceVc::new(vec![
            create_node_rendered_source(
                project_path,
                env,
                specificity,
                client_root,
                route_matcher.into(),
                pathname,
                ssr_entry,
                fallback_page,
                render_data,
                should_debug("page_source"),
            ),
            create_node_rendered_source(
                project_path,
                env,
                specificity,
                client_root,
                data_route_matcher.into(),
                pathname,
                ssr_data_entry,
                fallback_page,
                render_data,
                should_debug("page_source"),
            ),
            create_page_loader(
                client_root,
                client_context,
                client_chunking_context,
                page_asset,
                pathname,
            ),
        ])
        .into()
    })
}

async fn get_not_found_page(
    pages_dir: FileSystemPathVc,
    page_extensions: StringsVc,
) -> Result<Option<AssetVc>> {
    for ext in page_extensions.await?.iter() {
        let not_found_path = pages_dir.join(&format!("404.{ext}"));
        let content = not_found_path.read();
        if let FileContent::Content(_) = &*content.await? {
            return Ok(Some(SourceAssetVc::new(not_found_path).into()));
        }
    }
    Ok(None)
}

/// Handles a single page file in the pages directory
#[turbo_tasks::function]
async fn create_not_found_page_source(
    project_path: FileSystemPathVc,
    env: ProcessEnvVc,
    server_context: AssetContextVc,
    client_context: AssetContextVc,
    pages_dir: FileSystemPathVc,
    page_extensions: StringsVc,
    runtime_entries: AssetsVc,
    fallback_page: DevHtmlAssetVc,
    client_root: FileSystemPathVc,
    node_path: FileSystemPathVc,
    specificity: SpecificityVc,
    route_matcher: RouteMatcherVc,
    render_data: JsonValueVc,
) -> Result<ContentSourceVc> {
    let server_chunking_context = DevChunkingContextVc::builder(
        project_path,
        node_path,
        node_path.join("chunks"),
        get_client_assets_path(
            client_root,
            Value::new(ClientContextType::Pages { pages_dir }),
        ),
        server_context.compile_time_info().environment(),
    )
    .reference_chunk_source_maps(should_debug("page_source"))
    .build();

    let client_chunking_context = get_client_chunking_context(
        project_path,
        client_root,
        client_context.compile_time_info().environment(),
        Value::new(ClientContextType::Pages { pages_dir }),
    );

    let (page_asset, pathname) =
        if let Some(not_found_page_asset) = get_not_found_page(pages_dir, page_extensions).await? {
            // If a 404 page is defined, the pathname should be 404.
            (not_found_page_asset, StringVc::cell("/404".to_string()))
        } else {
            (
                // The error page asset must be within the context path so it can depend on the
                // Next.js module.
                next_asset("entry/error.tsx"),
                // If no 404 page is defined, the pathname should be _error.
                StringVc::cell("/_error".to_string()),
            )
        };

    let entry_asset = server_context.process(
        page_asset,
        Value::new(ReferenceType::Entry(EntryReferenceSubType::Page)),
    );

    let ssr_entry = SsrEntry {
        runtime_entries,
        context: server_context,
        entry_asset,
        ty: SsrType::Html,
        chunking_context: server_chunking_context,
        node_path,
        node_root: node_path,
        project_path,
    }
    .cell()
    .into();

    let page_loader = create_page_loader(
        client_root,
        client_context,
        client_chunking_context,
        entry_asset,
        pathname,
    );

    Ok(CombinedContentSourceVc::new(vec![
        create_node_rendered_source(
            project_path,
            env,
            specificity,
            client_root,
            route_matcher,
            pathname,
            ssr_entry,
            fallback_page,
            render_data,
            should_debug("page_source"),
        ),
        page_loader,
    ])
    .into())
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories or the
/// [create_page_source_for_file] method for files.
#[turbo_tasks::function]
async fn create_page_source_for_root_directory(
    pages_structure: PagesStructureVc,
    project_root: FileSystemPathVc,
    env: ProcessEnvVc,
    server_context: AssetContextVc,
    server_data_context: AssetContextVc,
    client_context: AssetContextVc,
    pages_dir: FileSystemPathVc,
    runtime_entries: AssetsVc,
    fallback_page: DevHtmlAssetVc,
    client_root: FileSystemPathVc,
    node_root: FileSystemPathVc,
    render_data: JsonValueVc,
) -> Result<ContentSourceVc> {
    let PagesStructure {
        app: _,
        document: _,
        error: _,
        ref api,
        ref pages,
    } = *pages_structure.await?;
    let mut sources = vec![];

    sources.push(create_page_source_for_directory(
        *pages,
        project_root,
        env,
        server_context,
        server_data_context,
        client_context,
        pages_dir,
        runtime_entries,
        fallback_page,
        client_root,
        false,
        node_root,
        render_data,
    ));

    if let Some(api) = api {
        sources.push(create_page_source_for_directory(
            *api,
            project_root,
            env,
            server_context,
            server_data_context,
            client_context,
            pages_dir,
            runtime_entries,
            fallback_page,
            client_root,
            true,
            node_root,
            render_data,
        ));
    }

    Ok(CombinedContentSource { sources }.cell().into())
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories or the
/// [create_page_source_for_file] method for files.
#[turbo_tasks::function]
async fn create_page_source_for_directory(
    pages_structure: PagesDirectoryStructureVc,
    project_root: FileSystemPathVc,
    env: ProcessEnvVc,
    server_context: AssetContextVc,
    server_data_context: AssetContextVc,
    client_context: AssetContextVc,
    pages_dir: FileSystemPathVc,
    runtime_entries: AssetsVc,
    fallback_page: DevHtmlAssetVc,
    client_root: FileSystemPathVc,
    is_api_path: bool,
    node_root: FileSystemPathVc,
    render_data: JsonValueVc,
) -> Result<ContentSourceVc> {
    let PagesDirectoryStructure {
        ref items,
        ref children,
        ..
    } = *pages_structure.await?;
    let mut sources = vec![];

    for item in items.iter() {
        let PagesStructureItem {
            project_path,
            specificity,
            next_router_path,
        } = *item.await?;
        let source = create_page_source_for_file(
            project_root,
            env,
            server_context,
            server_data_context,
            client_context,
            pages_dir,
            specificity,
            SourceAssetVc::new(project_path).into(),
            runtime_entries,
            fallback_page,
            client_root,
            next_router_path,
            is_api_path,
            node_root,
            node_root,
            render_data,
        )
        .issue_context(
            project_path,
            if is_api_path {
                "Next.js page API file"
            } else {
                "Next.js page file"
            },
        );
        sources.push(source);
    }

    for child in children.iter() {
        sources.push(create_page_source_for_directory(
            *child,
            project_root,
            env,
            server_context,
            server_data_context,
            client_context,
            pages_dir,
            runtime_entries,
            fallback_page,
            client_root,
            is_api_path,
            node_root,
            render_data,
        ))
    }

    Ok(CombinedContentSource { sources }.cell().into())
}

/// The node.js renderer for SSR of pages.
#[turbo_tasks::value]
pub struct SsrEntry {
    runtime_entries: AssetsVc,
    context: AssetContextVc,
    entry_asset: AssetVc,
    ty: SsrType,
    chunking_context: ChunkingContextVc,
    node_path: FileSystemPathVc,
    node_root: FileSystemPathVc,
    project_path: FileSystemPathVc,
}

#[derive(
    Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize, PartialOrd, Ord, TraceRawVcs,
)]
pub enum SsrType {
    Api,
    EdgeApi,
    AutoApi,
    Html,
    Data,
}

#[turbo_tasks::value_impl]
impl SsrEntryVc {
    #[turbo_tasks::function]
    pub async fn entry(self) -> Result<NodeRenderingEntryVc> {
        let this = self.await?;
        let entry_asset_page = this.context.process(
            this.entry_asset,
            Value::new(ReferenceType::Entry(EntryReferenceSubType::Page)),
        );
        let ty = if this.ty == SsrType::AutoApi {
            let page_config = parse_config_from_source(entry_asset_page);
            if page_config.await?.runtime == NextRuntime::Edge {
                SsrType::EdgeApi
            } else {
                SsrType::Api
            }
        } else {
            this.ty
        };
        let (internal_asset, inner_assets) = match ty {
            SsrType::AutoApi => unreachable!(),
            SsrType::Api => (
                next_asset("entry/server-api.tsx"),
                indexmap! {
                    "INNER".to_string() => entry_asset_page,
                },
            ),
            SsrType::EdgeApi => {
                let entry_asset_edge_chunk_group =
                    this.context.with_transition("next-edge").process(
                        this.entry_asset,
                        Value::new(ReferenceType::Entry(EntryReferenceSubType::PagesApi)),
                    );
                (
                    next_asset("entry/server-edge-api.tsx"),
                    indexmap! {
                        "INNER_EDGE_CHUNK_GROUP".to_string() => entry_asset_edge_chunk_group,
                    },
                )
            }
            SsrType::Data => (
                next_asset("entry/server-data.tsx"),
                indexmap! {
                    "INNER".to_string() => entry_asset_page,
                },
            ),
            SsrType::Html => {
                let entry_asset_client_chunk_group =
                    this.context.with_transition("next-client").process(
                        this.entry_asset,
                        Value::new(ReferenceType::Entry(EntryReferenceSubType::Page)),
                    );
                (
                    next_asset("entry/server-renderer.tsx"),
                    indexmap! {
                        "INNER".to_string() => entry_asset_page,
                        "INNER_CLIENT_CHUNK_GROUP".to_string() => entry_asset_client_chunk_group,
                    },
                )
            }
        };

        let module = this.context.process(
            internal_asset,
            Value::new(ReferenceType::Internal(InnerAssetsVc::cell(inner_assets))),
        );
        let Some(module) = EvaluatableAssetVc::resolve_from(module).await? else {
            bail!("internal module must be evaluatable");
        };
        Ok(NodeRenderingEntry {
            runtime_entries: EvaluatableAssetsVc::cell(
                this.runtime_entries
                    .await?
                    .iter()
                    .map(|entry| EvaluatableAssetVc::from_asset(*entry, this.context))
                    .collect(),
            ),
            module,
            chunking_context: this.chunking_context,
            intermediate_output_path: this.node_path,
            output_root: this.node_root,
            project_dir: this.project_path,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl NodeEntry for SsrEntry {
    #[turbo_tasks::function]
    fn entry(self_vc: SsrEntryVc, _data: Value<ContentSourceData>) -> NodeRenderingEntryVc {
        // Call without being keyed by data
        self_vc.entry()
    }
}
