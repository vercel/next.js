use std::collections::HashMap;

use anyhow::Result;
use turbo_tasks::Value;
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc};
use turbopack::ModuleAssetContextVc;
use turbopack_core::{
    chunk::dev::DevChunkingContext,
    context::AssetContextVc,
    environment::{
        BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment,
        NodeJsEnvironment,
    },
    source_asset::SourceAssetVc,
    target::CompileTargetVc,
    transition::TransitionsByNameVc,
};
use turbopack_dev_server::source::{
    asset_graph::AssetGraphContentSourceVc,
    combined::{CombinedContentSource, CombinedContentSourceVc},
    ContentSourceVc, NoContentSourceVc,
};

use crate::{next_client::NextClientTransition, server_render::asset::ServerRenderedAssetVc};

/// Create a content source serving the `pages` or `src/pages` directory as
/// Node.js pages folder.
#[turbo_tasks::function]
pub async fn create_server_rendered_source(
    root_path: FileSystemPathVc,
    output_path: FileSystemPathVc,
    target_root: FileSystemPathVc,
) -> Result<ContentSourceVc> {
    let pages = root_path.join("pages");
    let src_pages = root_path.join("src/pages");
    let dir = if *pages.get_type().await? == FileSystemEntryType::Directory {
        pages
    } else if *src_pages.get_type().await? == FileSystemEntryType::Directory {
        src_pages
    } else {
        return Ok(NoContentSourceVc::new().into());
    };

    let client_chunking_context = DevChunkingContext {
        context_path: root_path,
        chunk_root_path: target_root.join("_next/static/chunks"),
        asset_root_path: target_root.join("_next/static/assets"),
    }
    .cell()
    .into();
    let client_environment = EnvironmentVc::new(
        Value::new(ExecutionEnvironment::Browser(
            BrowserEnvironment {
                dom: true,
                web_worker: false,
                service_worker: false,
                browser_version: 0,
            }
            .into(),
        )),
        Value::new(EnvironmentIntention::Client),
    );
    let next_client_transition = NextClientTransition {
        client_chunking_context,
        client_environment,
        server_root: target_root,
    }
    .cell()
    .into();

    let mut transitions = HashMap::new();
    transitions.insert("next-client".to_string(), next_client_transition);
    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(transitions),
        root_path,
        EnvironmentVc::new(
            Value::new(ExecutionEnvironment::NodeJsLambda(
                NodeJsEnvironment {
                    compile_target: CompileTargetVc::current(),
                    node_version: 0,
                    typescript_enabled: false,
                }
                .into(),
            )),
            Value::new(EnvironmentIntention::Client),
        ),
        Default::default(),
    )
    .into();

    Ok(create_server_rendered_source_for_directory(
        context,
        dir,
        target_root,
        target_root,
        output_path,
    )
    .into())
}

/// Handles a single page file in the pages directory
#[turbo_tasks::function]
async fn create_server_rendered_source_for_file(
    context: AssetContextVc,
    entry: FileSystemPathVc,
    target_root: FileSystemPathVc,
    target_path: FileSystemPathVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetGraphContentSourceVc> {
    let context_path = context.context_path();
    let source_asset = SourceAssetVc::new(entry).into();
    let module = context
        .with_context_path(entry.parent())
        .process(source_asset);
    let asset = ServerRenderedAssetVc::new(
        target_path,
        context,
        module,
        context_path,
        intermediate_output_path,
        "{\"props\":{}}\n".to_string(),
    );
    Ok(AssetGraphContentSourceVc::new_lazy(
        target_root,
        asset.into(),
    ))
}

/// Handles a directory in the pages directory (or the pages directory itself).
/// Calls itself recursively for sub directories or the
/// [create_server_rendered_source_for_file] method for files.
#[turbo_tasks::function]
async fn create_server_rendered_source_for_directory(
    context: AssetContextVc,
    input_dir: FileSystemPathVc,
    target_root: FileSystemPathVc,
    target_path: FileSystemPathVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<CombinedContentSourceVc> {
    let mut sources = Vec::new();
    if let DirectoryContent::Entries(entries) = &*input_dir.read_dir().await? {
        for (name, entry) in entries.iter() {
            match entry {
                DirectoryEntry::File(file) => {
                    if let Some((name, extension)) = name.rsplit_once('.') {
                        match extension {
                            // pageExtensions option from next.js
                            // defaults: https://github.com/vercel/next.js/blob/611e13f5159457fedf96d850845650616a1f75dd/packages/next/server/config-shared.ts#L499
                            "js" | "ts" | "jsx" | "tsx" => {
                                let (target_path, intermediate_output_path) = if name == "index" {
                                    (target_path.join("index.html"), intermediate_output_path)
                                } else {
                                    (
                                        target_path.join(name).join("index.html"),
                                        intermediate_output_path.join(name),
                                    )
                                };
                                sources.push(
                                    create_server_rendered_source_for_file(
                                        context,
                                        *file,
                                        target_root,
                                        target_path,
                                        intermediate_output_path,
                                    )
                                    .into(),
                                );
                            }
                            _ => {}
                        }
                    }
                }
                DirectoryEntry::Directory(dir) => {
                    sources.push(
                        create_server_rendered_source_for_directory(
                            context,
                            *dir,
                            target_root,
                            target_path.join(name),
                            intermediate_output_path.join(name),
                        )
                        .into(),
                    );
                }
                _ => {}
            }
        }
    }
    Ok(CombinedContentSource { sources }.cell())
}
