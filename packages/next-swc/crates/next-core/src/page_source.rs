use anyhow::{bail, Result};
use indexmap::{indexmap, IndexMap};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use turbo_tasks::{trace::TraceRawVcs, Value, Vc};
use turbo_tasks_fs::FileSystemPathOption;
use turbopack_binding::{
    turbo::{
        tasks_env::{CustomProcessEnv, EnvMap, ProcessEnv},
        tasks_fs::{FileContent, FileSystemPath},
    },
    turbopack::{
        core::{
            chunk::{ChunkingContext, EvaluatableAsset, EvaluatableAssetExt},
            compile_time_info::CompileTimeInfo,
            context::AssetContext,
            environment::ServerAddr,
            file_source::FileSource,
            module::Module,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::{Source, Sources},
        },
        dev::DevChunkingContext,
        dev_server::{
            html::DevHtmlAsset,
            source::{
                asset_graph::AssetGraphContentSource,
                combined::CombinedContentSource,
                route_tree::{BaseSegment, RouteType},
                ContentSource, ContentSourceData, ContentSourceExt,
            },
        },
        ecmascript::chunk::EcmascriptChunkingContext,
        env::ProcessEnvAsset,
        node::{
            debug::should_debug,
            execution_context::ExecutionContext,
            render::{
                node_api_source::create_node_api_source,
                rendered_source::create_node_rendered_source,
            },
            route_matcher::RouteMatcher,
            NodeEntry, NodeRenderingEntry,
        },
        turbopack::ModuleAssetContext,
    },
};

use crate::{
    embed_js::next_asset,
    env::env_for_js,
    fallback::get_fallback_page,
    mode::NextMode,
    next_client::{
        context::{
            get_client_assets_path, get_client_chunking_context, get_client_module_options_context,
            get_client_resolve_options_context, get_client_runtime_entries, ClientContextType,
        },
        transition::NextClientTransition,
    },
    next_client_chunks::client_chunks_transition::NextClientChunksTransition,
    next_config::NextConfig,
    next_edge::{
        context::{get_edge_compile_time_info, get_edge_resolve_options_context},
        route_transition::NextEdgeRouteTransition,
    },
    next_route_matcher::{
        NextExactMatcher, NextFallbackMatcher, NextParamsMatcher, NextPrefixSuffixParamsMatcher,
    },
    next_server::context::{
        get_server_compile_time_info, get_server_module_options_context,
        get_server_resolve_options_context, ServerContextType,
    },
    page_loader::create_page_loader,
    pages_structure::{PagesDirectoryStructure, PagesStructure, PagesStructureItem},
    util::{parse_config_from_source, pathname_for_path, render_data, NextRuntime, PathType},
};

/// Create a content source serving the `pages` or `src/pages` directory as
/// Next.js pages folder.
#[turbo_tasks::function]
pub async fn create_page_source(
    pages_structure: Vc<PagesStructure>,
    project_root: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    node_root: Vc<FileSystemPath>,
    client_root: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    client_compile_time_info: Vc<CompileTimeInfo>,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let pages_dir = if let Some(pages) = pages_structure.await?.pages {
        pages.project_path().resolve().await?
    } else {
        project_root.join("pages".to_string())
    };

    let mode = NextMode::DevServer;
    let client_ty = Value::new(ClientContextType::Pages { pages_dir });
    let server_ty = Value::new(ServerContextType::Pages { pages_dir });
    let server_data_ty = Value::new(ServerContextType::PagesData { pages_dir });

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

    let client_runtime_entries = get_client_runtime_entries(
        project_root,
        env,
        client_ty,
        mode,
        next_config,
        execution_context,
    );

    let next_client_transition = Vc::upcast(
        NextClientTransition {
            is_app: false,
            client_chunking_context: Vc::upcast(client_chunking_context),
            client_module_options_context,
            client_resolve_options_context,
            client_compile_time_info,
            runtime_entries: client_runtime_entries,
        }
        .cell(),
    );

    let edge_compile_time_info = get_edge_compile_time_info(project_root, server_addr);

    let edge_chunking_context = Vc::upcast(
        DevChunkingContext::builder(
            project_root,
            node_root.join("edge".to_string()),
            node_root.join("edge/chunks".to_string()),
            get_client_assets_path(client_root),
            edge_compile_time_info.environment(),
        )
        .reference_chunk_source_maps(should_debug("page_source"))
        .build(),
    );
    let edge_resolve_options_context = get_edge_resolve_options_context(
        project_root,
        server_ty,
        mode,
        next_config,
        execution_context,
    );

    let next_edge_transition = Vc::upcast(
        NextEdgeRouteTransition {
            edge_compile_time_info,
            edge_chunking_context,
            edge_module_options_context: None,
            edge_resolve_options_context,
            output_path: node_root,
            base_path: project_root,
            bootstrap_asset: next_asset("entry/edge-bootstrap.ts".to_string()),
            entry_name: "edge".to_string(),
        }
        .cell(),
    );

    let server_compile_time_info = get_server_compile_time_info(mode, env, server_addr);
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

    let transitions = Vc::cell(
        [
            ("next-edge".to_string(), next_edge_transition),
            ("next-client".to_string(), next_client_transition),
            (
                "next-client-chunks".to_string(),
                Vc::upcast(NextClientChunksTransition::new(
                    project_root,
                    execution_context,
                    client_ty,
                    mode,
                    client_chunking_context,
                    client_compile_time_info,
                    next_config,
                )),
            ),
        ]
        .into_iter()
        .collect(),
    );

    let client_context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        transitions,
        client_compile_time_info,
        client_module_options_context,
        client_resolve_options_context,
    ));
    let server_context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        transitions,
        server_compile_time_info,
        server_module_options_context,
        server_resolve_options_context,
    ));
    let server_data_context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        transitions,
        server_compile_time_info,
        server_data_module_options_context,
        server_resolve_options_context,
    ));

    let injected_env = env_for_js(Vc::upcast(EnvMap::empty()), false, next_config);
    let env = Vc::upcast(CustomProcessEnv::new(env, next_config.env()));

    let server_runtime_entries = Vc::cell(vec![Vc::upcast(ProcessEnvAsset::new(
        project_root,
        injected_env,
    ))]);
    let fallback_runtime_entries = Vc::cell(vec![]);

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

    let sources = vec![
        // Match _next/404 first to ensure rewrites work properly.
        create_not_found_page_source(
            project_root,
            env,
            server_context,
            client_context,
            Vc::upcast(client_chunking_context),
            pages_dir,
            page_extensions,
            fallback_runtime_entries,
            fallback_page,
            client_root,
            node_root.join("force_not_found".to_string()),
            BaseSegment::from_static_pathname("_next/404").collect(),
            RouteType::Exact,
            Vc::upcast(NextExactMatcher::new(Vc::cell("_next/404".to_string()))),
            render_data,
        )
        .issue_file_path(pages_dir, "Next.js pages directory not found".to_string()),
        create_page_source_for_root_directory(
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
        ),
        Vc::upcast::<Box<dyn ContentSource>>(AssetGraphContentSource::new_eager(
            client_root,
            Vc::upcast(fallback_page),
        ))
        .issue_file_path(pages_dir, "Next.js pages directory fallback".to_string()),
        create_not_found_page_source(
            project_root,
            env,
            server_context,
            client_context,
            Vc::upcast(client_chunking_context),
            pages_dir,
            page_extensions,
            fallback_runtime_entries,
            fallback_page,
            client_root,
            node_root.join("fallback_not_found".to_string()),
            Vec::new(),
            RouteType::NotFound,
            Vc::upcast(NextFallbackMatcher::new()),
            render_data,
        )
        .issue_file_path(
            pages_dir,
            "Next.js pages directory not found fallback".to_string(),
        ),
    ];

    let source = Vc::upcast(CombinedContentSource { sources }.cell());
    Ok(source)
}

/// Handles a single page file in the pages directory
#[turbo_tasks::function]
async fn create_page_source_for_file(
    project_path: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    server_context: Vc<Box<dyn AssetContext>>,
    server_data_context: Vc<Box<dyn AssetContext>>,
    client_context: Vc<Box<dyn AssetContext>>,
    _pages_dir: Vc<FileSystemPath>,
    page_asset: Vc<Box<dyn Source>>,
    runtime_entries: Vc<Sources>,
    fallback_page: Vc<DevHtmlAsset>,
    client_root: Vc<FileSystemPath>,
    client_path: Vc<FileSystemPath>,
    is_api_path: bool,
    node_path: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    render_data: Vc<JsonValue>,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let mode = NextMode::DevServer;

    let server_chunking_context = Vc::upcast(
        DevChunkingContext::builder(
            project_path,
            node_path,
            node_path.join("chunks".to_string()),
            get_client_assets_path(client_root),
            server_context.compile_time_info().environment(),
        )
        .reference_chunk_source_maps(should_debug("page_source"))
        .build(),
    );

    let data_node_path = node_path.join("data".to_string());

    let server_data_chunking_context = Vc::upcast(
        DevChunkingContext::builder(
            project_path,
            data_node_path,
            data_node_path.join("chunks".to_string()),
            get_client_assets_path(client_root),
            server_context.compile_time_info().environment(),
        )
        .reference_chunk_source_maps(should_debug("page_source"))
        .build(),
    );

    let client_chunking_context = get_client_chunking_context(
        project_path,
        client_root,
        client_context.compile_time_info().environment(),
        mode,
    );

    let pathname = pathname_for_path(client_root, client_path, PathType::PagesPage);
    let route_matcher = NextParamsMatcher::new(pathname);

    let (base_segments, route_type) = pathname_to_segments(&pathname.await?, "")?;

    Ok(if is_api_path {
        create_node_api_source(
            project_path,
            env,
            base_segments,
            route_type,
            client_root,
            Vc::upcast(route_matcher),
            pathname,
            Vc::upcast(
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
                .cell(),
            ),
            render_data,
            should_debug("page_source"),
        )
    } else {
        let data_pathname = pathname_for_path(client_root, client_path, PathType::Data);
        let data_route_matcher = NextPrefixSuffixParamsMatcher::new(
            data_pathname,
            "_next/data/development/".to_string(),
            ".json".to_string(),
        );
        let (data_base_segments, data_route_type) = pathname_to_segments(
            &format!("_next/data/development/{}", data_pathname.await?),
            ".json",
        )?;

        let ssr_entry = Vc::upcast(
            SsrEntry {
                runtime_entries,
                context: server_context,
                entry_asset: page_asset,
                ty: SsrType::Html,
                chunking_context: server_chunking_context,
                node_path,
                node_root,
                project_path,
            }
            .cell(),
        );

        let ssr_data_entry = Vc::upcast(
            SsrEntry {
                runtime_entries,
                context: server_data_context,
                entry_asset: page_asset,
                ty: SsrType::Data,
                chunking_context: server_data_chunking_context,
                node_path: data_node_path,
                node_root,
                project_path,
            }
            .cell(),
        );

        Vc::upcast(CombinedContentSource::new(vec![
            create_node_rendered_source(
                project_path,
                env,
                base_segments.clone(),
                route_type.clone(),
                client_root,
                Vc::upcast(route_matcher),
                pathname,
                ssr_entry,
                fallback_page,
                render_data,
                should_debug("page_source"),
            ),
            create_node_rendered_source(
                project_path,
                env,
                data_base_segments,
                data_route_type,
                client_root,
                Vc::upcast(data_route_matcher),
                pathname,
                ssr_data_entry,
                fallback_page,
                render_data,
                should_debug("page_source"),
            ),
            create_page_loader(
                client_root,
                client_context,
                Vc::upcast(client_chunking_context),
                page_asset,
                pathname,
                FileSystemPathOption::none(),
            ),
        ]))
    })
}

async fn get_not_found_page(
    pages_dir: Vc<FileSystemPath>,
    page_extensions: Vc<Vec<String>>,
) -> Result<Option<Vc<Box<dyn Source>>>> {
    for ext in page_extensions.await?.iter() {
        let not_found_path = pages_dir.join(format!("404.{ext}"));
        let content = not_found_path.read();
        if let FileContent::Content(_) = &*content.await? {
            return Ok(Some(Vc::upcast(FileSource::new(not_found_path))));
        }
    }
    Ok(None)
}

/// Handles a single page file in the pages directory
#[turbo_tasks::function]
async fn create_not_found_page_source(
    project_path: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    server_context: Vc<Box<dyn AssetContext>>,
    client_context: Vc<Box<dyn AssetContext>>,
    client_chunking_context: Vc<Box<dyn ChunkingContext>>,
    pages_dir: Vc<FileSystemPath>,
    page_extensions: Vc<Vec<String>>,
    runtime_entries: Vc<Sources>,
    fallback_page: Vc<DevHtmlAsset>,
    client_root: Vc<FileSystemPath>,
    node_path: Vc<FileSystemPath>,
    base_segments: Vec<BaseSegment>,
    route_type: RouteType,
    route_matcher: Vc<Box<dyn RouteMatcher>>,
    render_data: Vc<JsonValue>,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let server_chunking_context = Vc::upcast(
        DevChunkingContext::builder(
            project_path,
            node_path,
            node_path.join("chunks".to_string()),
            get_client_assets_path(client_root),
            server_context.compile_time_info().environment(),
        )
        .reference_chunk_source_maps(should_debug("page_source"))
        .build(),
    );

    let (page_asset, pathname) =
        if let Some(not_found_page_asset) = get_not_found_page(pages_dir, page_extensions).await? {
            // If a 404 page is defined, the pathname should be 404.
            (not_found_page_asset, Vc::cell("/404".to_string()))
        } else {
            (
                // The error page asset must be within the context path so it can depend on the
                // Next.js module.
                next_asset("entry/error.tsx".to_string()),
                // If no 404 page is defined, the pathname should be _error.
                Vc::cell("/_error".to_string()),
            )
        };

    let ssr_entry = Vc::upcast(
        SsrEntry {
            runtime_entries,
            context: server_context,
            entry_asset: page_asset,
            ty: SsrType::Html,
            chunking_context: server_chunking_context,
            node_path,
            node_root: node_path,
            project_path,
        }
        .cell(),
    );

    let page_loader = create_page_loader(
        client_root,
        client_context,
        client_chunking_context,
        page_asset,
        pathname,
        FileSystemPathOption::none(),
    );

    Ok(Vc::upcast(CombinedContentSource::new(vec![
        create_node_rendered_source(
            project_path,
            env,
            base_segments,
            route_type,
            client_root,
            route_matcher,
            pathname,
            ssr_entry,
            fallback_page,
            render_data,
            should_debug("page_source"),
        ),
        page_loader,
    ])))
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories or the
/// [create_page_source_for_file] method for files.
#[turbo_tasks::function]
async fn create_page_source_for_root_directory(
    pages_structure: Vc<PagesStructure>,
    project_root: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    server_context: Vc<Box<dyn AssetContext>>,
    server_data_context: Vc<Box<dyn AssetContext>>,
    client_context: Vc<Box<dyn AssetContext>>,
    pages_dir: Vc<FileSystemPath>,
    runtime_entries: Vc<Sources>,
    fallback_page: Vc<DevHtmlAsset>,
    client_root: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    render_data: Vc<JsonValue>,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let PagesStructure {
        app: _,
        document: _,
        error: _,
        ref api,
        ref pages,
    } = *pages_structure.await?;
    let mut sources = vec![];

    if let Some(pages) = pages {
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
    }

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

    Ok(Vc::upcast(CombinedContentSource { sources }.cell()))
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories or the
/// [create_page_source_for_file] method for files.
#[turbo_tasks::function]
async fn create_page_source_for_directory(
    pages_structure: Vc<PagesDirectoryStructure>,
    project_root: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    server_context: Vc<Box<dyn AssetContext>>,
    server_data_context: Vc<Box<dyn AssetContext>>,
    client_context: Vc<Box<dyn AssetContext>>,
    pages_dir: Vc<FileSystemPath>,
    runtime_entries: Vc<Sources>,
    fallback_page: Vc<DevHtmlAsset>,
    client_root: Vc<FileSystemPath>,
    is_api_path: bool,
    node_root: Vc<FileSystemPath>,
    render_data: Vc<JsonValue>,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let PagesDirectoryStructure {
        ref items,
        ref children,
        ..
    } = *pages_structure.await?;
    let mut sources = vec![];

    for item in items.iter() {
        let PagesStructureItem {
            project_path,
            next_router_path,
            original_path: _,
        } = *item.await?;
        let source = create_page_source_for_file(
            project_root,
            env,
            server_context,
            server_data_context,
            client_context,
            pages_dir,
            Vc::upcast(FileSource::new(project_path)),
            runtime_entries,
            fallback_page,
            client_root,
            next_router_path,
            is_api_path,
            node_root,
            node_root,
            render_data,
        )
        .issue_file_path(
            project_path,
            if is_api_path {
                "Next.js page API file"
            } else {
                "Next.js page file"
            }
            .to_string(),
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

    Ok(Vc::upcast(CombinedContentSource { sources }.cell()))
}

fn pathname_to_segments(pathname: &str, extension: &str) -> Result<(Vec<BaseSegment>, RouteType)> {
    let mut segments = Vec::new();
    let mut split = pathname.split('/');
    while let Some(segment) = split.next() {
        if segment.is_empty() {
            // ignore
        } else if segment.starts_with("[[...") && segment.ends_with("]]")
            || segment.starts_with("[...") && segment.ends_with(']')
        {
            // (optional) catch all segment
            if split.remainder().is_some() {
                bail!(
                    "Invalid route {}, catch all segment must be the last segment",
                    pathname
                )
            }
            return Ok((segments, RouteType::CatchAll));
        } else if segment.starts_with('[') || segment.ends_with(']') {
            // dynamic segment
            segments.push(BaseSegment::Dynamic);
        } else {
            // normal segment
            segments.push(BaseSegment::Static(segment.to_string()));
        }
    }
    if let Some(BaseSegment::Static(s)) = segments.last_mut() {
        s.push_str(extension);
    }
    Ok((segments, RouteType::Exact))
}

/// The node.js renderer for SSR of pages.
#[turbo_tasks::value]
pub struct SsrEntry {
    runtime_entries: Vc<Sources>,
    context: Vc<Box<dyn AssetContext>>,
    entry_asset: Vc<Box<dyn Source>>,
    ty: SsrType,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    node_path: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    project_path: Vc<FileSystemPath>,
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
impl SsrEntry {
    #[turbo_tasks::function]
    pub async fn entry(self: Vc<Self>) -> Result<Vc<NodeRenderingEntry>> {
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
        let (internal_asset, inner_assets): (_, IndexMap<_, Vc<Box<dyn Module>>>) = match ty {
            SsrType::AutoApi => unreachable!(),
            SsrType::Api => (
                next_asset("entry/server-api.tsx".to_string()),
                indexmap! {
                    "INNER".to_string() => entry_asset_page,
                },
            ),
            SsrType::EdgeApi => {
                let entry_asset_edge_chunk_group = this
                    .context
                    .with_transition("next-edge".to_string())
                    .process(
                        this.entry_asset,
                        Value::new(ReferenceType::Entry(EntryReferenceSubType::PagesApi)),
                    );
                (
                    next_asset("entry/server-edge-api.tsx".to_string()),
                    indexmap! {
                        "INNER_EDGE_CHUNK_GROUP".to_string() => entry_asset_edge_chunk_group,
                    },
                )
            }
            SsrType::Data => (
                next_asset("entry/server-data.tsx".to_string()),
                indexmap! {
                    "INNER".to_string() => entry_asset_page,
                },
            ),
            SsrType::Html => {
                let entry_asset_client_chunk_group = this
                    .context
                    .with_transition("next-client".to_string())
                    .process(
                        this.entry_asset,
                        Value::new(ReferenceType::Entry(EntryReferenceSubType::Page)),
                    );
                (
                    next_asset("entry/server-renderer.tsx".to_string()),
                    indexmap! {
                        "INNER".to_string() => entry_asset_page,
                        "INNER_CLIENT_CHUNK_GROUP".to_string() => entry_asset_client_chunk_group,
                    },
                )
            }
        };

        let module = this.context.process(
            internal_asset,
            Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
        );
        let Some(module) = Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(module).await?
        else {
            bail!("internal module must be evaluatable");
        };
        Ok(NodeRenderingEntry {
            runtime_entries: Vc::cell(
                this.runtime_entries
                    .await?
                    .iter()
                    .map(|entry| entry.to_evaluatable(this.context))
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
    fn entry(self: Vc<Self>, _data: Value<ContentSourceData>) -> Vc<NodeRenderingEntry> {
        // Call without being keyed by data
        self.entry()
    }
}
