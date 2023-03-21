use anyhow::Result;
use indexmap::indexmap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{OptionStringVc, StringVc, StringsVc},
    trace::TraceRawVcs,
    Value,
};
use turbo_tasks_env::{CustomProcessEnvVc, EnvMapVc, ProcessEnvVc};
use turbo_tasks_fs::{FileContent, FileSystemPathVc};
use turbopack::{transition::TransitionsByNameVc, ModuleAssetContextVc};
use turbopack_core::{
    asset::AssetVc,
    chunk::ChunkingContextVc,
    context::{AssetContext, AssetContextVc},
    environment::{EnvironmentIntention, ServerAddrVc},
    reference_type::{EntryReferenceSubType, ReferenceType},
    source_asset::SourceAssetVc,
};
use turbopack_dev::DevChunkingContextVc;
use turbopack_dev_server::{
    html::DevHtmlAssetVc,
    source::{
        asset_graph::AssetGraphContentSourceVc,
        combined::{CombinedContentSource, CombinedContentSourceVc},
        specificity::SpecificityVc,
        ContentSourceData, ContentSourceVc, NoContentSourceVc,
    },
};
use turbopack_ecmascript::{
    chunk::EcmascriptChunkPlaceablesVc, EcmascriptInputTransform, EcmascriptInputTransformsVc,
    EcmascriptModuleAssetType, EcmascriptModuleAssetVc, InnerAssetsVc,
};
use turbopack_env::ProcessEnvAssetVc;
use turbopack_node::{
    execution_context::ExecutionContextVc,
    render::{
        node_api_source::create_node_api_source, rendered_source::create_node_rendered_source,
    },
    route_matcher::RouteMatcherVc,
    NodeEntry, NodeEntryVc, NodeRenderingEntry, NodeRenderingEntryVc,
};

use crate::{
    embed_js::{next_asset, next_js_file},
    env::env_for_js,
    fallback::get_fallback_page,
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
        transition::NextEdgeTransition,
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
        OptionPagesStructureVc, PagesStructure, PagesStructureItem, PagesStructureVc,
    },
    util::{parse_config_from_source, pathname_for_path, NextRuntime},
};

/// Create a content source serving the `pages` or `src/pages` directory as
/// Next.js pages folder.
#[turbo_tasks::function]
pub async fn create_page_source(
    pages_structure: OptionPagesStructureVc,
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    output_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
) -> Result<ContentSourceVc> {
    let Some(pages_structure) = *pages_structure.await? else {
        return Ok(NoContentSourceVc::new().into());
    };
    let pages_dir = pages_structure.directory().resolve().await?;

    let client_ty = Value::new(ClientContextType::Pages { pages_dir });
    let server_ty = Value::new(ServerContextType::Pages { pages_dir });
    let server_data_ty = Value::new(ServerContextType::PagesData { pages_dir });

    let client_compile_time_info = get_client_compile_time_info(browserslist_query);
    let client_module_options_context = get_client_module_options_context(
        project_path,
        execution_context,
        client_compile_time_info.environment(),
        client_ty,
        next_config,
    );
    let client_resolve_options_context =
        get_client_resolve_options_context(project_path, client_ty, next_config, execution_context);

    let client_chunking_context = get_client_chunking_context(
        project_path,
        server_root,
        client_compile_time_info.environment(),
        client_ty,
    );

    let client_runtime_entries =
        get_client_runtime_entries(project_path, env, client_ty, next_config, execution_context);

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

    let edge_compile_time_info =
        get_edge_compile_time_info(server_addr, Value::new(EnvironmentIntention::Api));

    let edge_chunking_context = DevChunkingContextVc::builder(
        project_path,
        output_path.join("edge"),
        output_path.join("edge/chunks"),
        get_client_assets_path(
            server_root,
            Value::new(ClientContextType::Pages { pages_dir }),
        ),
        edge_compile_time_info.environment(),
    )
    .build();
    let edge_resolve_options_context =
        get_edge_resolve_options_context(project_path, server_ty, next_config, execution_context);

    let next_edge_transition = NextEdgeTransition {
        edge_compile_time_info,
        edge_chunking_context,
        edge_module_options_context: None,
        edge_resolve_options_context,
        output_path,
        base_path: project_path,
        bootstrap_file: next_js_file("entry/edge-bootstrap.ts"),
        entry_name: "edge".to_string(),
    }
    .cell()
    .into();

    let server_compile_time_info = get_server_compile_time_info(server_ty, env, server_addr);
    let server_resolve_options_context =
        get_server_resolve_options_context(project_path, server_ty, next_config, execution_context);

    let server_module_options_context =
        get_server_module_options_context(project_path, execution_context, server_ty, next_config);

    let server_data_module_options_context = get_server_module_options_context(
        project_path,
        execution_context,
        server_data_ty,
        next_config,
    );

    let transitions = TransitionsByNameVc::cell(
        [
            ("next-edge".to_string(), next_edge_transition),
            ("next-client".to_string(), next_client_transition),
            (
                "next-client-chunks".to_string(),
                NextClientChunksTransitionVc::new(
                    project_path,
                    execution_context,
                    client_ty,
                    server_root,
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
        vec![ProcessEnvAssetVc::new(project_path, injected_env).as_ecmascript_chunk_placeable()];
    let server_runtime_entries = EcmascriptChunkPlaceablesVc::cell(server_runtime_entries);

    let fallback_page = get_fallback_page(
        project_path,
        execution_context,
        server_root,
        env,
        client_compile_time_info,
        next_config,
    );

    let page_extensions = next_config.page_extensions();
    let force_not_found_source = create_not_found_page_source(
        project_path,
        env,
        server_context,
        client_context,
        pages_dir,
        page_extensions,
        server_runtime_entries,
        fallback_page,
        server_root,
        output_path.join("force_not_found"),
        SpecificityVc::exact(),
        NextExactMatcherVc::new(StringVc::cell("_next/404".to_string())).into(),
    );
    let fallback_not_found_source = create_not_found_page_source(
        project_path,
        env,
        server_context,
        client_context,
        pages_dir,
        page_extensions,
        server_runtime_entries,
        fallback_page,
        server_root,
        output_path.join("fallback_not_found"),
        SpecificityVc::not_found(),
        NextFallbackMatcherVc::new().into(),
    );
    let page_source = create_page_source_for_directory(
        pages_structure,
        project_path,
        env,
        server_context,
        server_data_context,
        client_context,
        pages_dir,
        server_runtime_entries,
        fallback_page,
        server_root,
        output_path,
    );
    let fallback_source =
        AssetGraphContentSourceVc::new_eager(server_root, fallback_page.as_asset());

    let source = CombinedContentSource {
        sources: vec![
            // Match _next/404 first to ensure rewrites work properly.
            force_not_found_source.issue_context(pages_dir, "Next.js pages directory not found"),
            page_source,
            fallback_source
                .as_content_source()
                .issue_context(pages_dir, "Next.js pages directory fallback"),
            fallback_not_found_source
                .issue_context(pages_dir, "Next.js pages directory not found fallback"),
        ],
    }
    .cell()
    .into();
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
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
    server_root: FileSystemPathVc,
    server_path: FileSystemPathVc,
    is_api_path: bool,
    intermediate_output_path: FileSystemPathVc,
    output_root: FileSystemPathVc,
) -> Result<ContentSourceVc> {
    let server_chunking_context = DevChunkingContextVc::builder(
        project_path,
        intermediate_output_path,
        intermediate_output_path.join("chunks"),
        get_client_assets_path(
            server_root,
            Value::new(ClientContextType::Pages { pages_dir }),
        ),
        server_context.compile_time_info().environment(),
    )
    .chunk_source_maps(false)
    .build();

    let data_intermediate_output_path = intermediate_output_path.join("data");

    let server_data_chunking_context = DevChunkingContextVc::builder(
        project_path,
        data_intermediate_output_path,
        data_intermediate_output_path.join("chunks"),
        get_client_assets_path(
            server_root,
            Value::new(ClientContextType::Pages { pages_dir }),
        ),
        server_context.compile_time_info().environment(),
    )
    .chunk_source_maps(false)
    .build();

    let client_chunking_context = get_client_chunking_context(
        project_path,
        server_root,
        client_context.compile_time_info().environment(),
        Value::new(ClientContextType::Pages { pages_dir }),
    );

    let pathname = pathname_for_path(server_root, server_path, true, false);
    let route_matcher = NextParamsMatcherVc::new(pathname);

    Ok(if is_api_path {
        create_node_api_source(
            project_path,
            env,
            specificity,
            server_root,
            route_matcher.into(),
            pathname,
            SsrEntry {
                context: server_context,
                entry_asset: page_asset,
                ty: SsrType::AutoApi,
                chunking_context: server_chunking_context,
                intermediate_output_path,
                output_root,
                project_path,
            }
            .cell()
            .into(),
            runtime_entries,
        )
    } else {
        let data_pathname = pathname_for_path(server_root, server_path, true, true);
        let data_route_matcher =
            NextPrefixSuffixParamsMatcherVc::new(data_pathname, "_next/data/development/", ".json");

        let ssr_entry = SsrEntry {
            context: server_context,
            entry_asset: page_asset,
            ty: SsrType::Html,
            chunking_context: server_chunking_context,
            intermediate_output_path,
            output_root,
            project_path,
        }
        .cell()
        .into();

        let ssr_data_entry = SsrEntry {
            context: server_data_context,
            entry_asset: page_asset,
            ty: SsrType::Data,
            chunking_context: server_data_chunking_context,
            intermediate_output_path: data_intermediate_output_path,
            output_root,
            project_path,
        }
        .cell()
        .into();

        CombinedContentSourceVc::new(vec![
            create_node_rendered_source(
                project_path,
                env,
                specificity,
                server_root,
                route_matcher.into(),
                pathname,
                ssr_entry,
                runtime_entries,
                fallback_page,
            ),
            create_node_rendered_source(
                project_path,
                env,
                specificity,
                server_root,
                data_route_matcher.into(),
                pathname,
                ssr_data_entry,
                runtime_entries,
                fallback_page,
            ),
            create_page_loader(
                server_root,
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
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
    server_root: FileSystemPathVc,
    intermediate_output_path: FileSystemPathVc,
    specificity: SpecificityVc,
    route_matcher: RouteMatcherVc,
) -> Result<ContentSourceVc> {
    let server_chunking_context = DevChunkingContextVc::builder(
        project_path,
        intermediate_output_path,
        intermediate_output_path.join("chunks"),
        get_client_assets_path(
            server_root,
            Value::new(ClientContextType::Pages { pages_dir }),
        ),
        server_context.compile_time_info().environment(),
    )
    .chunk_source_maps(false)
    .build();

    let client_chunking_context = get_client_chunking_context(
        project_path,
        server_root,
        client_context.compile_time_info().environment(),
        Value::new(ClientContextType::Pages { pages_dir }),
    );

    let (page_asset, pathname) =
        if let Some(not_found_page_asset) = get_not_found_page(pages_dir, page_extensions).await? {
            // If a 404 page is defined, the pathname should be 404.
            (not_found_page_asset, StringVc::cell("404".to_string()))
        } else {
            (
                // The error page asset must be within the context path so it can depend on the
                // Next.js module.
                next_asset("entry/error.tsx"),
                // If no 404 page is defined, the pathname should be _error.
                StringVc::cell("_error".to_string()),
            )
        };

    let entry_asset = server_context.process(
        page_asset,
        Value::new(ReferenceType::Entry(EntryReferenceSubType::Page)),
    );

    let ssr_entry = SsrEntry {
        context: server_context,
        entry_asset,
        ty: SsrType::Html,
        chunking_context: server_chunking_context,
        intermediate_output_path,
        output_root: intermediate_output_path,
        project_path,
    }
    .cell()
    .into();

    let page_loader = create_page_loader(
        server_root,
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
            server_root,
            route_matcher,
            pathname,
            ssr_entry,
            runtime_entries,
            fallback_page,
        ),
        page_loader,
    ])
    .into())
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories or the
/// [create_page_source_for_file] method for files.
#[turbo_tasks::function]
async fn create_page_source_for_directory(
    pages_structure: PagesStructureVc,
    project_path: FileSystemPathVc,
    env: ProcessEnvVc,
    server_context: AssetContextVc,
    server_data_context: AssetContextVc,
    client_context: AssetContextVc,
    pages_dir: FileSystemPathVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
    server_root: FileSystemPathVc,
    output_root: FileSystemPathVc,
) -> Result<ContentSourceVc> {
    let PagesStructure {
        ref items,
        ref children,
        ..
    } = *pages_structure.await?;
    let mut sources = vec![];

    for item in items.iter() {
        let source = match *item.await? {
            PagesStructureItem::Page {
                page,
                specificity,
                url,
            } => create_page_source_for_file(
                project_path,
                env,
                server_context,
                server_data_context,
                client_context,
                pages_dir,
                specificity,
                SourceAssetVc::new(page).into(),
                runtime_entries,
                fallback_page,
                server_root,
                url,
                false,
                output_root,
                output_root,
            )
            .issue_context(page, "Next.js pages directory"),
            PagesStructureItem::Api {
                api,
                specificity,
                url,
            } => create_page_source_for_file(
                project_path,
                env,
                server_context,
                server_data_context,
                client_context,
                pages_dir,
                specificity,
                SourceAssetVc::new(api).into(),
                runtime_entries,
                fallback_page,
                server_root,
                url,
                true,
                output_root,
                output_root,
            )
            .issue_context(api, "Next.js pages api directory"),
        };
        sources.push(source);
    }

    for child in children.iter() {
        sources.push(create_page_source_for_directory(
            *child,
            project_path,
            env,
            server_context,
            server_data_context,
            client_context,
            pages_dir,
            runtime_entries,
            fallback_page,
            server_root,
            output_root,
        ))
    }

    Ok(CombinedContentSource { sources }.cell().into())
}

#[derive(
    Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize, PartialOrd, Ord, TraceRawVcs,
)]
enum SsrType {
    Api,
    EdgeApi,
    AutoApi,
    Html,
    Data,
}

/// The node.js renderer for SSR of pages.
#[turbo_tasks::value]
struct SsrEntry {
    context: AssetContextVc,
    entry_asset: AssetVc,
    ty: SsrType,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
    output_root: FileSystemPathVc,
    project_path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl SsrEntryVc {
    #[turbo_tasks::function]
    async fn entry(self) -> Result<NodeRenderingEntryVc> {
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

        Ok(NodeRenderingEntry {
            module: EcmascriptModuleAssetVc::new_with_inner_assets(
                internal_asset,
                this.context,
                Value::new(EcmascriptModuleAssetType::Typescript),
                EcmascriptInputTransformsVc::cell(vec![
                    EcmascriptInputTransform::TypeScript {
                        use_define_for_class_fields: false,
                    },
                    EcmascriptInputTransform::React {
                        refresh: false,
                        import_source: OptionStringVc::cell(None),
                        runtime: OptionStringVc::cell(None),
                    },
                ]),
                this.context.compile_time_info(),
                InnerAssetsVc::cell(inner_assets),
            ),
            chunking_context: this.chunking_context,
            intermediate_output_path: this.intermediate_output_path,
            output_root: this.output_root,
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
