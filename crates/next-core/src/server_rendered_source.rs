use std::collections::HashMap;

use anyhow::Result;
use turbo_tasks::{
    primitives::{BoolVc, StringsVc},
    Value,
};
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc};
use turbopack::{transition::TransitionsByNameVc, ModuleAssetContextVc};
use turbopack_core::{
    asset::AssetVc,
    chunk::{dev::DevChunkingContextVc, ChunkingContextVc},
    context::AssetContextVc,
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
    create_node_api_source, create_node_rendered_source,
    node_entry::{NodeRenderingEntry, NodeRenderingEntryVc},
    NodeEntry, NodeEntryVc,
};

use crate::{
    embed_js::{next_js_file, wrap_with_next_js_fs},
    env::env_for_js,
    fallback::get_fallback_page,
    next_client::{
        context::{
            add_next_transforms_to_pages, get_client_assets_path, get_client_chunking_context,
            get_client_environment, get_client_module_options_context,
            get_client_resolve_options_context, get_client_runtime_entries, ContextType,
        },
        NextClientTransition,
    },
    next_server::{
        get_server_environment, get_server_module_options_context,
        get_server_resolve_options_context, ServerContextType,
    },
    util::{pathname_for_path, regular_expression_for_path},
};

/// Create a content source serving the `pages` or `src/pages` directory as
/// Next.js pages folder.
#[turbo_tasks::function]
pub async fn create_server_rendered_source(
    project_root: FileSystemPathVc,
    output_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    env: ProcessEnvVc,
    browserslist_query: &str,
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

    let ty = Value::new(ContextType::Pages { pages_dir });
    let server_ty = Value::new(ServerContextType::Pages { pages_dir });

    let client_chunking_context = get_client_chunking_context(project_path, server_root, ty);
    let client_environment = get_client_environment(browserslist_query);
    let client_module_options_context =
        get_client_module_options_context(project_path, client_environment, ty);
    let client_module_options_context =
        add_next_transforms_to_pages(client_module_options_context, pages_dir);
    let client_resolve_options_context = get_client_resolve_options_context(project_path, ty);

    let client_runtime_entries = get_client_runtime_entries(project_path, env, ty);

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

    let mut transitions = HashMap::new();
    transitions.insert("next-client".to_string(), next_client_transition);
    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(transitions),
        get_server_environment(server_ty, env),
        get_server_module_options_context(server_ty),
        get_server_resolve_options_context(project_path, server_ty, StringsVc::empty()),
    )
    .into();

    let server_runtime_entries = vec![ProcessEnvAssetVc::new(project_path, env_for_js(env, false))
        .as_ecmascript_chunk_placeable()];

    let fallback_page = get_fallback_page(project_path, server_root, env, browserslist_query);

    let server_rendered_source = create_server_rendered_source_for_directory(
        project_path,
        context,
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
    );
    let fallback_source =
        AssetGraphContentSourceVc::new_eager(server_root, fallback_page.as_asset());

    Ok(CombinedContentSource {
        sources: vec![server_rendered_source.into(), fallback_source.into()],
    }
    .cell()
    .into())
}

/// Handles a single page file in the pages directory
#[turbo_tasks::function]
async fn create_server_rendered_source_for_file(
    context_path: FileSystemPathVc,
    context: AssetContextVc,
    pages_dir: FileSystemPathVc,
    specificity: SpecificityVc,
    page_file: FileSystemPathVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
    server_root: FileSystemPathVc,
    server_path: FileSystemPathVc,
    is_api_path: BoolVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<ContentSourceVc> {
    let source_asset = SourceAssetVc::new(page_file).into();
    let entry_asset = context.process(source_asset);

    let chunking_context = DevChunkingContextVc::builder(
        context_path,
        intermediate_output_path,
        intermediate_output_path.join("chunks"),
        get_client_assets_path(server_root, Value::new(ContextType::Pages { pages_dir })),
    )
    .build();

    let pathname = pathname_for_path(server_root, server_path, true);
    let path_regex = regular_expression_for_path(server_root, server_path, true);

    Ok(if *is_api_path.await? {
        create_node_api_source(
            specificity,
            server_root,
            path_regex,
            SsrEntry {
                context,
                entry_asset,
                is_api_path,
                chunking_context,
                intermediate_output_path,
            }
            .cell()
            .into(),
            runtime_entries,
        )
    } else {
        create_node_rendered_source(
            specificity,
            server_root,
            pathname,
            path_regex,
            SsrEntry {
                context,
                entry_asset,
                is_api_path,
                chunking_context,
                intermediate_output_path,
            }
            .cell()
            .into(),
            runtime_entries,
            fallback_page,
        )
    })
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories or the
/// [create_server_rendered_source_for_file] method for files.
#[turbo_tasks::function]
async fn create_server_rendered_source_for_directory(
    context_path: FileSystemPathVc,
    context: AssetContextVc,
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
                            "js" | "ts" | "jsx" | "tsx" => {
                                let (dev_server_path, intermediate_output_path, specificity) =
                                    if basename == "index" {
                                        (
                                            server_path.join("index.html"),
                                            intermediate_output_path,
                                            specificity,
                                        )
                                    } else if basename == "404" {
                                        (
                                            server_path.join("[...]"),
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
                                    create_server_rendered_source_for_file(
                                        context_path,
                                        context,
                                        pages_dir,
                                        specificity,
                                        *file,
                                        runtime_entries,
                                        fallback_page,
                                        server_root,
                                        dev_server_path,
                                        dev_server_path.is_inside(server_api_path),
                                        intermediate_output_path,
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
                        create_server_rendered_source_for_directory(
                            context_path,
                            context,
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

/// The node.js renderer for SSR of pages.
#[turbo_tasks::value]
struct SsrEntry {
    context: AssetContextVc,
    entry_asset: AssetVc,
    is_api_path: BoolVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl NodeEntry for SsrEntry {
    #[turbo_tasks::function]
    async fn entry(&self, _data: Value<ContentSourceData>) -> Result<NodeRenderingEntryVc> {
        let virtual_asset = if *self.is_api_path.await? {
            VirtualAssetVc::new(
                self.entry_asset.path().join("server-api.tsx"),
                next_js_file("entry/server-api.tsx").into(),
            )
        } else {
            VirtualAssetVc::new(
                self.entry_asset.path().join("server-renderer.tsx"),
                next_js_file("entry/server-renderer.tsx").into(),
            )
        };

        Ok(NodeRenderingEntry {
            module: EcmascriptModuleAssetVc::new(
                virtual_asset.into(),
                self.context,
                Value::new(EcmascriptModuleAssetType::Typescript),
                EcmascriptInputTransformsVc::cell(vec![
                    EcmascriptInputTransform::TypeScript,
                    EcmascriptInputTransform::React { refresh: false },
                ]),
                self.context.environment(),
            ),
            chunking_context: self.chunking_context,
            intermediate_output_path: self.intermediate_output_path,
        }
        .cell())
    }
}
