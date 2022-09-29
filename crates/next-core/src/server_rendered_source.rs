use std::collections::HashMap;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc};
use turbopack::{
    module_options::ModuleOptionsContext, resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByNameVc, ModuleAssetContextVc,
};
use turbopack_core::{
    chunk::dev::DevChunkingContext,
    context::AssetContextVc,
    environment::{
        BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment,
        NodeJsEnvironment,
    },
    reference::SingleAssetReferenceVc,
    source_asset::SourceAssetVc,
    target::CompileTargetVc,
};
use turbopack_dev_server::{
    html_runtime_asset::HtmlRuntimeAssetVc,
    source::{
        asset_graph::AssetGraphContentSourceVc,
        combined::{CombinedContentSource, CombinedContentSourceVc},
        ContentSourceVc, NoContentSourceVc,
    },
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceablesVc;
use turbopack_env::{ProcessEnvAssetVc, ProcessEnvVc};

use crate::{
    env::filter_for_client,
    next_client::{NextClientTransition, RuntimeReference},
    react_refresh::{assert_can_resolve_react_refresh, react_refresh_request},
    server_render::asset::ServerRenderedAssetVc,
};

/// Create a content source serving the `pages` or `src/pages` directory as
/// Node.js pages folder.
#[turbo_tasks::function]
pub async fn create_server_rendered_source(
    root_path: FileSystemPathVc,
    output_path: FileSystemPathVc,
    target_root: FileSystemPathVc,
    env: ProcessEnvVc,
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
        enable_hot_module_replacement: true,
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
    let client_resolve_options_context = ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        enable_node_modules: true,
        custom_conditions: vec!["development".to_string()],
        ..Default::default()
    }
    .cell();

    let server_runtime_entries =
        vec![ProcessEnvAssetVc::new(root_path, env).as_ecmascript_chunk_placeable()];
    let mut client_runtime_references = vec![RuntimeReference::Reference(
        SingleAssetReferenceVc::new(
            ProcessEnvAssetVc::new(root_path, filter_for_client(env)).as_asset(),
            StringVc::cell(".env".to_string()),
        )
        .into(),
    )];

    let enable_react_refresh =
        *assert_can_resolve_react_refresh(root_path, client_resolve_options_context).await?;
    if enable_react_refresh {
        client_runtime_references.extend(vec![
            RuntimeReference::Request(react_refresh_request(), root_path),
            RuntimeReference::Reference(
                SingleAssetReferenceVc::new(
                    HtmlRuntimeAssetVc::new().into(),
                    StringVc::cell("html-runtime".to_string()),
                )
                .into(),
            ),
        ]);
    };
    let client_module_options_context = ModuleOptionsContext {
        enable_react_refresh,
        enable_styled_jsx: true,
        enable_typescript_transform: true,
        ..Default::default()
    }
    .cell();
    let next_client_transition = NextClientTransition {
        client_chunking_context,
        client_module_options_context,
        client_resolve_options_context,
        client_environment,
        server_root: target_root,
        runtime_references: client_runtime_references,
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
                }
                .into(),
            )),
            Value::new(EnvironmentIntention::Client),
        ),
        ModuleOptionsContext {
            enable_typescript_transform: true,
            ..Default::default()
        }
        .cell(),
        ResolveOptionsContext {
            enable_typescript: true,
            enable_react: true,
            enable_node_modules: true,
            enable_node_native_modules: true,
            custom_conditions: vec!["development".to_string()],
            ..Default::default()
        }
        .cell(),
    )
    .into();

    Ok(create_server_rendered_source_for_directory(
        context,
        dir,
        EcmascriptChunkPlaceablesVc::cell(server_runtime_entries),
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
    runtime_entries: EcmascriptChunkPlaceablesVc,
    target_root: FileSystemPathVc,
    target_path: FileSystemPathVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetGraphContentSourceVc> {
    let context_path = context.context_path();
    let source_asset = SourceAssetVc::new(entry).into();
    let entry_asset = context
        .with_context_path(entry.parent())
        .process(source_asset);

    let chunking_context = DevChunkingContext {
        context_path,
        chunk_root_path: intermediate_output_path.join("chunks"),
        asset_root_path: target_root.join("_next/static/assets"),
        enable_hot_module_replacement: false,
    }
    .into();

    let asset = ServerRenderedAssetVc::new(
        target_path,
        context,
        entry_asset,
        runtime_entries,
        chunking_context,
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
    runtime_entries: EcmascriptChunkPlaceablesVc,
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
                                        runtime_entries,
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
                            runtime_entries,
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
