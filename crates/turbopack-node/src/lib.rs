#![feature(async_closure)]
#![feature(min_specialization)]
#![feature(lint_reasons)]

use std::{collections::HashMap, iter::once, thread::available_parallelism};

use anyhow::{bail, Result};
use indexmap::IndexSet;
pub use node_entry::{
    NodeEntry, NodeEntryVc, NodeRenderingEntriesVc, NodeRenderingEntry, NodeRenderingEntryVc,
};
use turbo_tasks::{
    graph::{GraphTraversal, ReverseTopological},
    CompletionVc, CompletionsVc, TryJoinIterExt, ValueToString,
};
use turbo_tasks_env::{ProcessEnv, ProcessEnvVc};
use turbo_tasks_fs::{to_sys_path, File, FileContent, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc, AssetsSetVc},
    chunk::{
        ChunkableAsset, ChunkingContext, ChunkingContextVc, EvaluatableAssetVc, EvaluatableAssetsVc,
    },
    reference::primary_referenced_assets,
    source_map::GenerateSourceMapVc,
    virtual_asset::VirtualAssetVc,
};
use turbopack_ecmascript::EcmascriptModuleAssetVc;

use self::{
    bootstrap::NodeJsBootstrapAsset,
    pool::{NodeJsPool, NodeJsPoolVc},
    source_map::StructuredError,
};

pub mod bootstrap;
pub mod embed_js;
pub mod evaluate;
pub mod execution_context;
mod node_entry;
mod pool;
pub mod render;
pub mod route_matcher;
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
            .map(|a| a.content().write(a.ident().path()))
            .collect(),
    )
    .completed())
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

#[turbo_tasks::value(transparent)]
pub struct AssetsForSourceMapping(HashMap<String, GenerateSourceMapVc>);

/// Extracts a map of "internal" assets ([`internal_assets`]) which implement
/// the [GenerateSourceMap] trait.
#[turbo_tasks::function]
async fn internal_assets_for_source_mapping(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetsForSourceMappingVc> {
    let internal_assets = internal_assets(intermediate_asset, intermediate_output_path).await?;
    let intermediate_output_path = &*intermediate_output_path.await?;
    let mut internal_assets_for_source_mapping = HashMap::new();
    for asset in internal_assets.iter() {
        if let Some(generate_source_map) = GenerateSourceMapVc::resolve_from(asset).await? {
            if let Some(path) = intermediate_output_path.get_path_to(&*asset.ident().path().await?)
            {
                internal_assets_for_source_mapping.insert(path.to_string(), generate_source_map);
            }
        }
    }
    Ok(AssetsForSourceMappingVc::cell(
        internal_assets_for_source_mapping,
    ))
}

/// Returns a set of "external" assets on the boundary of the "internal"
/// subgraph
#[turbo_tasks::function]
pub async fn external_asset_entrypoints(
    module: EcmascriptModuleAssetVc,
    runtime_entries: EvaluatableAssetsVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetsSetVc> {
    Ok(separate_assets(
        get_intermediate_asset(chunking_context, module.into(), runtime_entries)
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
    let intermediate_output_path = &*intermediate_output_path.await?;
    #[derive(PartialEq, Eq, Hash, Clone, Copy)]
    enum Type {
        Internal(AssetVc),
        External(AssetVc),
    }
    let get_asset_children = |asset| async move {
        let Type::Internal(asset) = asset else {
            return Ok(Vec::new());
        };
        primary_referenced_assets(asset)
            .await?
            .iter()
            .map(|asset| async {
                // Assets within the output directory are considered as "internal" and all
                // others as "external". We follow references on "internal" assets, but do not
                // look into references of "external" assets, since there are no "internal"
                // assets behind "externals"
                if asset
                    .ident()
                    .path()
                    .await?
                    .is_inside(intermediate_output_path)
                {
                    Ok(Type::Internal(*asset))
                } else {
                    Ok(Type::External(*asset))
                }
            })
            .try_join()
            .await
    };

    let graph = ReverseTopological::new()
        .skip_duplicates()
        .visit(once(Type::Internal(intermediate_asset)), get_asset_children)
        .await
        .completed()?
        .into_inner();

    let mut internal_assets = IndexSet::new();
    let mut external_asset_entrypoints = IndexSet::new();

    for item in graph {
        match item {
            Type::Internal(asset) => {
                internal_assets.insert(asset);
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

/// Emit a basic package.json that sets the type of the package to commonjs.
/// Currently code generated for Node is CommonJS, while authored code may be
/// ESM, for example.
pub(self) fn emit_package_json(dir: FileSystemPathVc) -> CompletionVc {
    emit(
        VirtualAssetVc::new(
            dir.join("package.json"),
            FileContent::Content(File::from("{\"type\": \"commonjs\"}")).into(),
        )
        .into(),
        dir,
    )
}

/// Creates a node.js renderer pool for an entrypoint.
#[turbo_tasks::function]
pub async fn get_renderer_pool(
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
    output_root: FileSystemPathVc,
    project_dir: FileSystemPathVc,
    debug: bool,
) -> Result<NodeJsPoolVc> {
    emit_package_json(intermediate_output_path).await?;

    let emit = emit(intermediate_asset, output_root);
    let assets_for_source_mapping =
        internal_assets_for_source_mapping(intermediate_asset, output_root);

    let entrypoint = intermediate_asset.ident().path();

    let Some(cwd) = to_sys_path(cwd).await? else {
        bail!("can only render from a disk filesystem, but `cwd = {}`", cwd.to_string().await?);
    };
    let Some(entrypoint) = to_sys_path(entrypoint).await? else {
        bail!("can only render from a disk filesystem, but `entrypoint = {}`", entrypoint.to_string().await?);
    };

    emit.await?;
    Ok(NodeJsPool::new(
        cwd,
        entrypoint,
        env.read_all()
            .await?
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        assets_for_source_mapping,
        output_root,
        project_dir,
        available_parallelism().map_or(1, |v| v.get()),
        debug,
    )
    .cell())
}

/// Converts a module graph into node.js executable assets
#[turbo_tasks::function]
pub async fn get_intermediate_asset(
    chunking_context: ChunkingContextVc,
    main_entry: EvaluatableAssetVc,
    other_entries: EvaluatableAssetsVc,
) -> Result<AssetVc> {
    Ok(NodeJsBootstrapAsset {
        path: chunking_context.chunk_path(main_entry.ident(), ".js"),
        chunking_context,
        entry: main_entry.as_root_chunk(chunking_context),
        evaluatable_assets: other_entries.with_entry(main_entry),
    }
    .cell()
    .into())
}

#[derive(Clone, Debug)]
#[turbo_tasks::value(shared)]
pub struct ResponseHeaders {
    pub status: u16,
    pub headers: Vec<(String, String)>,
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_bytes::register();
    turbo_tasks_fs::register();
    turbopack_dev_server::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
