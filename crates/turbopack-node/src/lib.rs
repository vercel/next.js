#![feature(async_closure)]
#![feature(min_specialization)]

use std::{
    collections::{HashMap, HashSet},
    fmt::Write as _,
    path::PathBuf,
};

use anyhow::{anyhow, bail, Result};
use futures::{stream::FuturesUnordered, TryStreamExt};
use indexmap::IndexSet;
pub use node_entry::{
    NodeEntry, NodeEntryVc, NodeRenderingEntriesVc, NodeRenderingEntry, NodeRenderingEntryVc,
};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use turbo_tasks::{CompletionVc, CompletionsVc, TryJoinIterExt};
use turbo_tasks_fs::{to_sys_path, File, FileContent, FileSystemPathVc};
use turbopack_core::{
    asset::{AssetVc, AssetsSetVc},
    chunk::{ChunkGroupVc, ChunkVc, ChunkingContextVc},
    source_map::{GenerateSourceMapVc, SourceMapVc},
    virtual_asset::VirtualAssetVc,
};
use turbopack_ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc};

use self::{
    bootstrap::NodeJsBootstrapAsset,
    pool::{NodeJsPool, NodeJsPoolVc},
};
use crate::source_map::{SourceMapTraceVc, StackFrame, TraceResult};

pub mod bootstrap;
mod embed_js;
pub mod evaluate;
pub mod execution_context;
mod node_entry;
pub mod path_regex;
mod pool;
pub mod render;
pub mod source_map;
pub mod transforms;

#[turbo_tasks::function]
async fn emit(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<CompletionVc> {
    Ok(CompletionsVc::cell(
        internal_assets(intermediate_asset, intermediate_output_path)
            .strongly_consistent()
            .await?
            .iter()
            .map(|a| async {
                Ok(if *a.path().extension().await? != "map" {
                    Some(a.content().write(a.path()))
                } else {
                    None
                })
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect(),
    )
    .all())
}

/// List of the all assets of the "internal" subgraph and a list of boundary
/// assets that are not considered "internal" ("external")
#[derive(Debug)]
#[turbo_tasks::value]
struct SeparatedAssets {
    internal_assets: AssetsSetVc,
    external_asset_entrypoints: AssetsSetVc,
}

/// Extracts the subgraph of "internal" assets (assets within the passes
/// directory). Also lists all boundary assets that are not part of the
/// "internal" subgraph.
#[turbo_tasks::function]
async fn internal_assets(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetsSetVc> {
    Ok(
        separate_assets(intermediate_asset, intermediate_output_path)
            .strongly_consistent()
            .await?
            .internal_assets,
    )
}

/// Returns a set of "external" assets on the boundary of the "internal"
/// subgraph
#[turbo_tasks::function]
pub async fn external_asset_entrypoints(
    module: EcmascriptModuleAssetVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetsSetVc> {
    Ok(separate_assets(
        get_intermediate_asset(
            module.as_evaluated_chunk(chunking_context, Some(runtime_entries)),
            intermediate_output_path,
        )
        .resolve()
        .await?,
        intermediate_output_path,
    )
    .strongly_consistent()
    .await?
    .external_asset_entrypoints)
}

/// Splits the asset graph into "internal" assets and boundaries to "external"
/// assets.
#[turbo_tasks::function]
async fn separate_assets(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<SeparatedAssetsVc> {
    enum Type {
        Internal(AssetVc, Vec<AssetVc>),
        External(AssetVc),
    }
    let intermediate_output_path = intermediate_output_path.await?;
    let mut queue = FuturesUnordered::new();
    let process_asset = |asset: AssetVc| {
        let intermediate_output_path = &intermediate_output_path;
        async move {
            // Assets within the output directory are considered as "internal" and all
            // others as "external". We follow references on "internal" assets, but do not
            // look into references of "external" assets, since there are no "internal"
            // assets behind "externals"
            if asset.path().await?.is_inside(intermediate_output_path) {
                let mut assets = Vec::new();
                for reference in asset.references().await?.iter() {
                    for asset in reference.resolve_reference().primary_assets().await?.iter() {
                        assets.push(*asset);
                    }
                }
                Ok::<_, anyhow::Error>(Type::Internal(asset, assets))
            } else {
                Ok(Type::External(asset))
            }
        }
    };
    queue.push(process_asset(intermediate_asset));
    let mut processed = HashSet::new();
    let mut internal_assets = IndexSet::new();
    let mut external_asset_entrypoints = IndexSet::new();
    // TODO(sokra) This is not deterministic, since it's using FuturesUnordered.
    // This need to be fixed!
    while let Some(item) = queue.try_next().await? {
        match item {
            Type::Internal(asset, assets) => {
                internal_assets.insert(asset);
                for asset in assets {
                    if processed.insert(asset) {
                        queue.push(process_asset(asset));
                    }
                }
            }
            Type::External(asset) => {
                external_asset_entrypoints.insert(asset);
            }
        }
    }
    Ok(SeparatedAssets {
        internal_assets: AssetsSetVc::cell(internal_assets),
        external_asset_entrypoints: AssetsSetVc::cell(external_asset_entrypoints),
    }
    .cell())
}

/// Creates a node.js renderer pool for an entrypoint.
#[turbo_tasks::function]
pub async fn get_renderer_pool(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<NodeJsPoolVc> {
    // Emit a basic package.json that sets the type of the package to commonjs.
    // Currently code generated for Node is CommonJS, while authored code may be
    // ESM, for example.
    //
    // Note that this is placed at .next/server/package.json, while Next.js
    // currently creates this file at .next/package.json.
    emit(
        VirtualAssetVc::new(
            intermediate_output_path.join("package.json"),
            FileContent::Content(File::from("{\"type\": \"commonjs\"}")).into(),
        )
        .into(),
        intermediate_output_path,
    )
    .await?;

    emit(intermediate_asset, intermediate_output_path).await?;

    let cwd = intermediate_output_path.root();
    let entrypoint = intermediate_output_path.join("index.js");

    if let (Some(cwd), Some(entrypoint)) = (to_sys_path(cwd).await?, to_sys_path(entrypoint).await?)
    {
        let pool = NodeJsPool::new(cwd, entrypoint, HashMap::new(), 4);
        Ok(pool.cell())
    } else {
        Err(anyhow!("can only render from a disk filesystem"))
    }
}

/// Converts a module graph into node.js executable assets
#[turbo_tasks::function]
pub async fn get_intermediate_asset(
    entry_chunk: ChunkVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetVc> {
    let chunk_group = ChunkGroupVc::from_chunk(entry_chunk);
    Ok(NodeJsBootstrapAsset {
        path: intermediate_output_path.join("index.js"),
        chunk_group,
    }
    .cell()
    .into())
}

#[turbo_tasks::value(shared)]
pub struct ResponseHeaders {
    pub status: u16,
    pub headers: Vec<String>,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EvalJavaScriptOutgoingMessage<'a> {
    #[serde(rename_all = "camelCase")]
    Evaluate { args: Vec<&'a JsonValue> },
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EvalJavaScriptIncomingMessage {
    FileDependency { path: String },
    BuildDependency { path: String },
    DirDependency { path: String, glob: String },
    JsonValue { data: String },
    Error(StructuredError),
}

#[turbo_tasks::value(shared)]
pub struct StructuredError {
    name: String,
    message: String,
    stack: Vec<StackFrame>,
}

impl StructuredError {
    async fn print(
        &self,
        assets: HashMap<String, SourceMapVc>,
        root: Option<String>,
    ) -> Result<String> {
        let mut message = String::new();

        writeln!(message, "{}: {}", self.name, self.message)?;

        for frame in &self.stack {
            if let Some((line, column)) = frame.get_pos() {
                if let Some(path) = root.as_ref().and_then(|r| frame.file.strip_prefix(r)) {
                    if let Some(map) = assets.get(path) {
                        let trace = SourceMapTraceVc::new(*map, line, column, frame.name.clone())
                            .trace()
                            .await?;
                        if let TraceResult::Found(f) = &*trace {
                            writeln!(message, "  at {} [{}]", f, frame.with_path(path))?;
                            continue;
                        }
                    }

                    writeln!(message, "  at {}", frame.with_path(path))?;
                    continue;
                }
            }

            writeln!(message, "  at {}", frame)?;
        }
        Ok(message)
    }
}

pub async fn trace_stack(
    error: StructuredError,
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<String> {
    let root = match to_sys_path(intermediate_output_path.root()).await? {
        Some(r) => r.to_string_lossy().to_string(),
        None => bail!("couldn't extract disk fs from path"),
    };

    let assets = internal_assets(intermediate_asset, intermediate_output_path.root())
        .await?
        .iter()
        .map(|a| async {
            let gen = match GenerateSourceMapVc::resolve_from(*a).await? {
                Some(gen) => gen,
                None => return Ok(None),
            };

            let path = match to_sys_path(a.path()).await? {
                Some(p) => p,
                None => PathBuf::from(&a.path().await?.path),
            };

            let p = path.strip_prefix(&root).unwrap();
            Ok(Some((
                p.to_str().unwrap().to_string(),
                gen.generate_source_map(),
            )))
        })
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .collect::<HashMap<_, _>>();

    error.print(assets, Some(root)).await
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_dev_server::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
