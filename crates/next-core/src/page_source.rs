use std::collections::HashMap;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    trace::TraceRawVcs,
    Value,
};
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc};
use turbopack::{transition::TransitionsByNameVc, ModuleAssetContextVc};
use turbopack_core::{
    asset::AssetVc,
    chunk::{dev::DevChunkingContextVc, ChunkingContextVc},
    context::AssetContextVc,
    environment::ServerAddrVc,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source_asset::SourceAssetVc,
    virtual_asset::VirtualAssetVc,
};
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
    EcmascriptModuleAssetType, EcmascriptModuleAssetVc,
};
use turbopack_env::ProcessEnvAssetVc;
use turbopack_node::{
    execution_context::ExecutionContextVc,
    render::{
        node_api_source::create_node_api_source, rendered_source::create_node_rendered_source,
    },
    NodeEntry, NodeEntryVc, NodeRenderingEntry, NodeRenderingEntryVc,
};

use crate::{
    embed_js::{next_js_file, wrap_with_next_js_fs},
    env::env_for_js,
    fallback::get_fallback_page,
    next_client::{
        context::{
            get_client_assets_path, get_client_chunking_context, get_client_environment,
            get_client_module_options_context, get_client_resolve_options_context,
            get_client_runtime_entries, ClientContextType,
        },
        transition::NextClientTransition,
    },
    next_client_chunks::client_chunks_transition::NextClientChunksTransitionVc,
    next_config::NextConfigVc,
    next_edge::{
        context::{get_edge_environment, get_edge_resolve_options_context},
        transition::NextEdgeTransition,
    },
    next_server::context::{
        get_server_environment, get_server_module_options_context,
        get_server_resolve_options_context, ServerContextType,
    },
    page_loader::create_page_loader,
    params_matcher::NextParamsMatcherVc,
    util::{parse_config_from_source, pathname_for_path, NextRuntime},
};

/// Create a content source serving the `pages` or `src/pages` directory as
/// Next.js pages folder.
#[turbo_tasks::function]
pub async fn create_page_source(
    project_root: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    output_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
) -> Result<ContentSourceVc> {
    let project_path = wrap_with_next_js_fs(project_root);

    let pages = project_path.join("pages");
    let src_pages = project_path.join("src/pages");
    let pages_dir = if *pages.get_type().await? == FileSystemEntryType::Directory {
        pages
    } else if *src_pages.get_type().await? == FileSystemEntryType::Directory {
        src_pages
    } else {
        return Ok(NoContentSourceVc::new().into());
    };

    let client_ty = Value::new(ClientContextType::Pages { pages_dir });
    let server_ty = Value::new(ServerContextType::Pages { pages_dir });
    let server_data_ty = Value::new(ServerContextType::PagesData { pages_dir });

    let client_environment = get_client_environment(browserslist_query);
    let client_module_options_context = get_client_module_options_context(
        project_path,
        execution_context,
        client_environment,
        client_ty,
        next_config,
    );
    let client_resolve_options_context =
        get_client_resolve_options_context(project_path, client_ty, next_config);
    let client_context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        client_environment,
        client_module_options_context,
        client_resolve_options_context,
    )
    .into();

    let client_chunking_context =
        get_client_chunking_context(project_path, server_root, client_environment, client_ty);

    let client_runtime_entries =
        get_client_runtime_entries(project_path, env, client_ty, next_config);

    let next_client_transition = NextClientTransition {
        is_app: false,
        client_chunking_context,
        client_module_options_context,
        client_resolve_options_context,
        client_environment,
        server_root,
        runtime_entries: client_runtime_entries,
    }
    .cell()
    .into();

    let edge_environment = get_edge_environment(server_addr);

    let edge_chunking_context = DevChunkingContextVc::builder(
        project_path,
        output_path.join("edge"),
        output_path.join("edge/chunks"),
        get_client_assets_path(
            server_root,
            Value::new(ClientContextType::Pages { pages_dir }),
        ),
        edge_environment,
    )
    .build();
    let edge_resolve_options_context =
        get_edge_resolve_options_context(project_path, server_ty, next_config);

    let next_edge_transition = NextEdgeTransition {
        edge_environment,
        edge_chunking_context,
        edge_resolve_options_context,
        output_path,
        base_path: project_path,
    }
    .cell()
    .into();

    let server_environment = get_server_environment(server_ty, env, server_addr);
    let server_resolve_options_context =
        get_server_resolve_options_context(project_path, server_ty, next_config);

    let server_module_options_context =
        get_server_module_options_context(project_path, execution_context, server_ty, next_config);
    let server_transitions = TransitionsByNameVc::cell(
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
                    browserslist_query,
                    next_config,
                )
                .into(),
            ),
        ]
        .into_iter()
        .collect(),
    );

    let server_context: AssetContextVc = ModuleAssetContextVc::new(
        server_transitions,
        server_environment,
        server_module_options_context,
        server_resolve_options_context,
    )
    .into();

    let server_data_module_options_context = get_server_module_options_context(
        project_path,
        execution_context,
        server_data_ty,
        next_config,
    );

    let server_data_context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        server_environment,
        server_data_module_options_context,
        server_resolve_options_context,
    )
    .into();

    let server_runtime_entries =
        vec![
            ProcessEnvAssetVc::new(project_path, env_for_js(env, false, next_config))
                .as_ecmascript_chunk_placeable(),
        ];

    let fallback_page = get_fallback_page(
        project_path,
        execution_context,
        server_root,
        env,
        browserslist_query,
        next_config,
    );

    let page_source = create_page_source_for_directory(
        project_path,
        server_context,
        server_data_context,
        client_context,
        pages_dir,
        SpecificityVc::exact(),
        0,
        pages_dir,
        EcmascriptChunkPlaceablesVc::cell(server_runtime_entries),
        fallback_page,
        server_root,
        server_root,
        server_root.join("api"),
        output_path,
        output_path,
    );
    let fallback_source =
        AssetGraphContentSourceVc::new_eager(server_root, fallback_page.as_asset());

    Ok(CombinedContentSource {
        sources: vec![page_source.into(), fallback_source.into()],
    }
    .cell()
    .into())
}

/// Handles a single page file in the pages directory
#[turbo_tasks::function]
async fn create_page_source_for_file(
    context_path: FileSystemPathVc,
    server_context: AssetContextVc,
    server_data_context: AssetContextVc,
    client_context: AssetContextVc,
    pages_dir: FileSystemPathVc,
    specificity: SpecificityVc,
    page_file: FileSystemPathVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
    server_root: FileSystemPathVc,
    server_path: FileSystemPathVc,
    is_api_path: BoolVc,
    intermediate_output_path: FileSystemPathVc,
    output_root: FileSystemPathVc,
) -> Result<ContentSourceVc> {
    let source_asset = SourceAssetVc::new(page_file).into();
    let entry_asset = server_context.process(
        source_asset,
        Value::new(ReferenceType::Entry(EntryReferenceSubType::Page)),
    );
    let data_asset = server_data_context.process(
        source_asset,
        Value::new(ReferenceType::Entry(EntryReferenceSubType::Page)),
    );

    let server_chunking_context = DevChunkingContextVc::builder(
        context_path,
        intermediate_output_path,
        intermediate_output_path.join("chunks"),
        get_client_assets_path(
            server_root,
            Value::new(ClientContextType::Pages { pages_dir }),
        ),
        server_context.environment(),
    )
    .build();

    let data_intermediate_output_path = intermediate_output_path.join("data");

    let server_data_chunking_context = DevChunkingContextVc::builder(
        context_path,
        data_intermediate_output_path,
        data_intermediate_output_path.join("chunks"),
        get_client_assets_path(
            server_root,
            Value::new(ClientContextType::Pages { pages_dir }),
        ),
        server_context.environment(),
    )
    .build();

    let client_chunking_context = get_client_chunking_context(
        context_path,
        server_root,
        client_context.environment(),
        Value::new(ClientContextType::Pages { pages_dir }),
    );

    let pathname = pathname_for_path(server_root, server_path, true);
    let params_matcher = NextParamsMatcherVc::new(pathname, None, None);

    let page_config = parse_config_from_source(entry_asset);

    Ok(if *is_api_path.await? {
        let ty = if page_config.await?.runtime == NextRuntime::Edge {
            SsrType::EdgeApi
        } else {
            SsrType::Api
        };
        create_node_api_source(
            specificity,
            server_root,
            pathname,
            params_matcher.into(),
            SsrEntry {
                context: server_context,
                entry_asset,
                ty,
                chunking_context: server_chunking_context,
                intermediate_output_path,
                output_root,
            }
            .cell()
            .into(),
            runtime_entries,
        )
    } else {
        let data_params_matcher = NextParamsMatcherVc::new(
            pathname,
            Some(StringVc::cell("_next/data/development/".to_string())),
            Some(StringVc::cell(".json".to_string())),
        );

        let ssr_entry = SsrEntry {
            context: server_context,
            entry_asset,
            ty: SsrType::Html,
            chunking_context: server_chunking_context,
            intermediate_output_path,
            output_root,
        }
        .cell()
        .into();

        let ssr_data_entry = SsrEntry {
            context: server_data_context,
            entry_asset: data_asset,
            ty: SsrType::Data,
            chunking_context: server_data_chunking_context,
            intermediate_output_path: data_intermediate_output_path,
            output_root,
        }
        .cell()
        .into();

        CombinedContentSourceVc::new(vec![
            create_node_rendered_source(
                specificity,
                server_root,
                pathname,
                params_matcher.into(),
                ssr_entry,
                runtime_entries,
                fallback_page,
            ),
            create_node_rendered_source(
                specificity,
                server_root,
                pathname,
                data_params_matcher.into(),
                ssr_data_entry,
                runtime_entries,
                fallback_page,
            ),
            create_page_loader(
                server_root,
                client_context,
                client_chunking_context,
                entry_asset,
                pathname,
            ),
        ])
        .into()
    })
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories or the
/// [create_page_source_for_file] method for files.
#[turbo_tasks::function]
async fn create_page_source_for_directory(
    context_path: FileSystemPathVc,
    server_context: AssetContextVc,
    server_data_context: AssetContextVc,
    client_context: AssetContextVc,
    pages_dir: FileSystemPathVc,
    specificity: SpecificityVc,
    position: u32,
    input_dir: FileSystemPathVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
    server_root: FileSystemPathVc,
    server_path: FileSystemPathVc,
    server_api_path: FileSystemPathVc,
    intermediate_output_path: FileSystemPathVc,
    output_root: FileSystemPathVc,
) -> Result<CombinedContentSourceVc> {
    let mut sources = vec![];
    let dir_content = input_dir.read_dir().await?;
    if let DirectoryContent::Entries(entries) = &*dir_content {
        for (name, entry) in entries.iter() {
            let specificity = if name.starts_with("[[") || name.starts_with("[...") {
                specificity.with_catch_all(position)
            } else if name.starts_with('[') {
                specificity.with_dynamic_segment(position)
            } else {
                specificity
            };
            match entry {
                DirectoryEntry::File(file) => {
                    if let Some((basename, extension)) = name.rsplit_once('.') {
                        match extension {
                            // pageExtensions option from next.js
                            // defaults: https://github.com/vercel/next.js/blob/611e13f5159457fedf96d850845650616a1f75dd/packages/next/server/config-shared.ts#L499
                            "js" | "ts" | "jsx" | "tsx" | "mdx" => {
                                let (dev_server_path, intermediate_output_path, specificity) =
                                    if basename == "index" {
                                        (
                                            server_path.join("index.html"),
                                            intermediate_output_path,
                                            specificity,
                                        )
                                    } else if basename == "404" {
                                        (
                                            server_path.join("[...].html"),
                                            intermediate_output_path.join(basename),
                                            specificity.with_fallback(position),
                                        )
                                    } else {
                                        (
                                            server_path.join(basename).join("index.html"),
                                            intermediate_output_path.join(basename),
                                            specificity,
                                        )
                                    };
                                sources.push((
                                    name,
                                    create_page_source_for_file(
                                        context_path,
                                        server_context,
                                        server_data_context,
                                        client_context,
                                        pages_dir,
                                        specificity,
                                        *file,
                                        runtime_entries,
                                        fallback_page,
                                        server_root,
                                        dev_server_path,
                                        dev_server_path.is_inside(server_api_path),
                                        intermediate_output_path,
                                        output_root,
                                    ),
                                ));
                            }
                            _ => {}
                        }
                    }
                }
                DirectoryEntry::Directory(dir) => {
                    sources.push((
                        name,
                        create_page_source_for_directory(
                            context_path,
                            server_context,
                            server_data_context,
                            client_context,
                            pages_dir,
                            specificity,
                            position + 1,
                            *dir,
                            runtime_entries,
                            fallback_page,
                            server_root,
                            server_path.join(name),
                            server_api_path,
                            intermediate_output_path.join(name),
                            output_root,
                        )
                        .into(),
                    ));
                }
                _ => {}
            }
        }
    }

    // Ensure deterministic order since read_dir is not deterministic
    sources.sort_by_key(|(k, _)| *k);

    Ok(CombinedContentSource {
        sources: sources.into_iter().map(|(_, v)| v).collect(),
    }
    .cell())
}

#[derive(
    Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize, PartialOrd, Ord, TraceRawVcs,
)]
enum SsrType {
    Api,
    EdgeApi,
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
}

#[turbo_tasks::value_impl]
impl SsrEntryVc {
    #[turbo_tasks::function]
    async fn entry(self) -> Result<NodeRenderingEntryVc> {
        let this = self.await?;
        let virtual_asset = match this.ty {
            SsrType::Api => VirtualAssetVc::new(
                this.entry_asset.path().join("server-api.tsx"),
                next_js_file("entry/server-api.tsx").into(),
            ),
            SsrType::EdgeApi => VirtualAssetVc::new(
                this.entry_asset.path().join("server-edge-api.tsx"),
                next_js_file("entry/server-edge-api.tsx").into(),
            ),
            SsrType::Data => VirtualAssetVc::new(
                this.entry_asset.path().join("server-data.tsx"),
                next_js_file("entry/server-data.tsx").into(),
            ),
            SsrType::Html => VirtualAssetVc::new(
                this.entry_asset.path().join("server-renderer.tsx"),
                next_js_file("entry/server-renderer.tsx").into(),
            ),
        };

        Ok(NodeRenderingEntry {
            module: EcmascriptModuleAssetVc::new(
                virtual_asset.into(),
                this.context,
                Value::new(EcmascriptModuleAssetType::Typescript),
                EcmascriptInputTransformsVc::cell(vec![
                    EcmascriptInputTransform::TypeScript,
                    EcmascriptInputTransform::React { refresh: false },
                ]),
                this.context.environment(),
            ),
            chunking_context: this.chunking_context,
            intermediate_output_path: this.intermediate_output_path,
            output_root: this.output_root,
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
