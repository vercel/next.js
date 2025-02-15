#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![feature(extract_if)]

use std::{iter::once, thread::available_parallelism};

use anyhow::{bail, Result};
pub use node_entry::{NodeEntry, NodeRenderingEntries, NodeRenderingEntry};
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    FxIndexSet, ResolvedVc, TryJoinIterExt, ValueToString, Vc,
};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::{to_sys_path, File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    changed::content_changed,
    chunk::{ChunkingContext, ChunkingContextExt, EvaluatableAssets},
    module::Module,
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssets, OutputAssetsSet},
    source_map::GenerateSourceMap,
    virtual_output::VirtualOutputAsset,
};

use self::{pool::NodeJsPool, source_map::StructuredError};

pub mod debug;
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
    intermediate_asset: Vc<Box<dyn OutputAsset>>,
    intermediate_output_path: Vc<FileSystemPath>,
) -> Result<()> {
    for asset in internal_assets(intermediate_asset, intermediate_output_path).await? {
        let _ = asset.content().write(asset.path()).resolve().await?;
    }
    Ok(())
}

/// List of the all assets of the "internal" subgraph and a list of boundary
/// assets that are not considered "internal" ("external")
#[derive(Debug)]
#[turbo_tasks::value]
struct SeparatedAssets {
    internal_assets: ResolvedVc<OutputAssetsSet>,
    external_asset_entrypoints: ResolvedVc<OutputAssetsSet>,
}

/// Extracts the subgraph of "internal" assets (assets within the passes
/// directory). Also lists all boundary assets that are not part of the
/// "internal" subgraph.
#[turbo_tasks::function]
async fn internal_assets(
    intermediate_asset: ResolvedVc<Box<dyn OutputAsset>>,
    intermediate_output_path: ResolvedVc<FileSystemPath>,
) -> Result<Vc<OutputAssetsSet>> {
    Ok(
        *separate_assets_operation(intermediate_asset, intermediate_output_path)
            .read_strongly_consistent()
            .await?
            .internal_assets,
    )
}

#[turbo_tasks::value(transparent)]
pub struct AssetsForSourceMapping(FxHashMap<String, ResolvedVc<Box<dyn GenerateSourceMap>>>);

/// Extracts a map of "internal" assets ([`internal_assets`]) which implement
/// the [GenerateSourceMap] trait.
#[turbo_tasks::function]
async fn internal_assets_for_source_mapping(
    intermediate_asset: Vc<Box<dyn OutputAsset>>,
    intermediate_output_path: Vc<FileSystemPath>,
) -> Result<Vc<AssetsForSourceMapping>> {
    let internal_assets = internal_assets(intermediate_asset, intermediate_output_path).await?;
    let intermediate_output_path = &*intermediate_output_path.await?;
    let mut internal_assets_for_source_mapping = FxHashMap::default();
    for asset in internal_assets.iter() {
        if let Some(generate_source_map) =
            ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(*asset)
        {
            if let Some(path) = intermediate_output_path.get_path_to(&*asset.path().await?) {
                internal_assets_for_source_mapping.insert(path.to_string(), generate_source_map);
            }
        }
    }
    Ok(Vc::cell(internal_assets_for_source_mapping))
}

/// Returns a set of "external" assets on the boundary of the "internal"
/// subgraph
#[turbo_tasks::function]
pub async fn external_asset_entrypoints(
    module: Vc<Box<dyn Module>>,
    runtime_entries: Vc<EvaluatableAssets>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    intermediate_output_path: ResolvedVc<FileSystemPath>,
) -> Result<Vc<OutputAssetsSet>> {
    Ok(*separate_assets_operation(
        get_intermediate_asset(chunking_context, module, runtime_entries)
            .to_resolved()
            .await?,
        intermediate_output_path,
    )
    .read_strongly_consistent()
    .await?
    .external_asset_entrypoints)
}

/// Splits the asset graph into "internal" assets and boundaries to "external"
/// assets.
#[turbo_tasks::function(operation)]
async fn separate_assets_operation(
    intermediate_asset: ResolvedVc<Box<dyn OutputAsset>>,
    intermediate_output_path: ResolvedVc<FileSystemPath>,
) -> Result<Vc<SeparatedAssets>> {
    let intermediate_output_path = &*intermediate_output_path.await?;
    #[derive(PartialEq, Eq, Hash, Clone, Copy)]
    enum Type {
        Internal(ResolvedVc<Box<dyn OutputAsset>>),
        External(ResolvedVc<Box<dyn OutputAsset>>),
    }
    let get_asset_children = |asset| async move {
        let Type::Internal(asset) = asset else {
            return Ok(Vec::new());
        };
        asset
            .references()
            .await?
            .iter()
            .map(|asset| async {
                // Assets within the output directory are considered as "internal" and all
                // others as "external". We follow references on "internal" assets, but do not
                // look into references of "external" assets, since there are no "internal"
                // assets behind "externals"
                if asset.path().await?.is_inside_ref(intermediate_output_path) {
                    Ok(Type::Internal(*asset))
                } else {
                    Ok(Type::External(*asset))
                }
            })
            .try_join()
            .await
    };

    let graph = AdjacencyMap::new()
        .skip_duplicates()
        .visit(once(Type::Internal(intermediate_asset)), get_asset_children)
        .await
        .completed()?
        .into_inner();

    let mut internal_assets = FxIndexSet::default();
    let mut external_asset_entrypoints = FxIndexSet::default();

    for item in graph.into_reverse_topological() {
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
        internal_assets: ResolvedVc::cell(internal_assets),
        external_asset_entrypoints: ResolvedVc::cell(external_asset_entrypoints),
    }
    .cell())
}

/// Emit a basic package.json that sets the type of the package to commonjs.
/// Currently code generated for Node is CommonJS, while authored code may be
/// ESM, for example.
fn emit_package_json(dir: Vc<FileSystemPath>) -> Vc<()> {
    emit(
        Vc::upcast(VirtualOutputAsset::new(
            dir.join("package.json".into()),
            AssetContent::file(File::from("{\"type\": \"commonjs\"}").into()),
        )),
        dir,
    )
}

/// Creates a node.js renderer pool for an entrypoint.
#[turbo_tasks::function(operation)]
pub async fn get_renderer_pool_operation(
    cwd: ResolvedVc<FileSystemPath>,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    intermediate_asset: ResolvedVc<Box<dyn OutputAsset>>,
    intermediate_output_path: ResolvedVc<FileSystemPath>,
    output_root: ResolvedVc<FileSystemPath>,
    project_dir: ResolvedVc<FileSystemPath>,
    debug: bool,
) -> Result<Vc<NodeJsPool>> {
    emit_package_json(*intermediate_output_path).await?;

    let _ = emit(*intermediate_asset, *output_root).resolve().await?;
    let assets_for_source_mapping =
        internal_assets_for_source_mapping(*intermediate_asset, *output_root);

    let entrypoint = intermediate_asset.path();

    let Some(cwd) = to_sys_path(*cwd).await? else {
        bail!(
            "can only render from a disk filesystem, but `cwd = {}`",
            cwd.to_string().await?
        );
    };
    let Some(entrypoint) = to_sys_path(entrypoint).await? else {
        bail!(
            "can only render from a disk filesystem, but `entrypoint = {}`",
            entrypoint.to_string().await?
        );
    };
    // Invalidate pool when code content changes
    content_changed(*ResolvedVc::upcast(intermediate_asset)).await?;

    Ok(NodeJsPool::new(
        cwd,
        entrypoint,
        env.read_all()
            .await?
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        assets_for_source_mapping.to_resolved().await?,
        output_root,
        project_dir,
        available_parallelism().map_or(1, |v| v.get()),
        debug,
    )
    .cell())
}

/// Converts a module graph into node.js executable assets
#[turbo_tasks::function]
pub fn get_intermediate_asset(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    main_entry: Vc<Box<dyn Module>>,
    other_entries: Vc<EvaluatableAssets>,
) -> Vc<Box<dyn OutputAsset>> {
    Vc::upcast(chunking_context.root_entry_chunk_group_asset(
        chunking_context.chunk_path(main_entry.ident(), ".js".into()),
        main_entry,
        ModuleGraph::from_module(main_entry),
        OutputAssets::empty(),
        other_entries,
    ))
}

#[derive(Clone, Debug)]
#[turbo_tasks::value(shared)]
pub struct ResponseHeaders {
    pub status: u16,
    pub headers: Vec<(RcStr, RcStr)>,
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_bytes::register();
    turbo_tasks_fs::register();
    turbopack_dev_server::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
