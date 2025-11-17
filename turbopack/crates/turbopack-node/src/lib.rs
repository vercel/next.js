#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::thread::available_parallelism;

use anyhow::{Result, bail};
use rustc_hash::FxHashMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::{File, FileSystemPath, to_sys_path};
use turbopack_core::{
    asset::{Asset, AssetContent},
    changed::content_changed,
    chunk::{ChunkingContext, ChunkingContextExt, EvaluatableAsset, EvaluatableAssets},
    module::Module,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroupEntry},
    output::{ExpandOutputAssetsInput, OutputAsset, OutputAssets, expand_output_assets},
    source_map::GenerateSourceMap,
    virtual_output::VirtualOutputAsset,
};

use self::pool::NodeJsPool;

pub mod debug;
pub mod embed_js;
pub mod evaluate;
pub mod execution_context;
mod heap_queue;
mod pool;
pub mod source_map;
pub mod transforms;

#[turbo_tasks::function]
async fn emit(
    intermediate_asset: Vc<Box<dyn OutputAsset>>,
    intermediate_output_path: FileSystemPath,
) -> Result<()> {
    for asset in internal_assets(intermediate_asset, intermediate_output_path).await? {
        let _ = asset
            .content()
            .write(asset.path().owned().await?)
            .resolve()
            .await?;
    }
    Ok(())
}

/// Extracts the subgraph of "internal" assets (assets within the passes
/// directory). Also lists all boundary assets that are not part of the
/// "internal" subgraph.
#[turbo_tasks::function]
async fn internal_assets(
    intermediate_asset: ResolvedVc<Box<dyn OutputAsset>>,
    intermediate_output_path: FileSystemPath,
) -> Result<Vc<OutputAssets>> {
    let all_assets = expand_output_assets(
        std::iter::once(ExpandOutputAssetsInput::Asset(intermediate_asset)),
        true,
    )
    .await?;
    let internal_assets = all_assets
        .into_iter()
        .map(async |asset| {
            let path = asset.path().await?;
            if path.is_inside_ref(&intermediate_output_path) {
                Ok(Some(asset))
            } else {
                Ok(None)
            }
        })
        .try_flat_join()
        .await?;
    Ok(Vc::cell(internal_assets))
}

#[turbo_tasks::value(transparent)]
pub struct AssetsForSourceMapping(FxHashMap<String, ResolvedVc<Box<dyn GenerateSourceMap>>>);

/// Extracts a map of "internal" assets ([`internal_assets`]) which implement
/// the [GenerateSourceMap] trait.
#[turbo_tasks::function]
async fn internal_assets_for_source_mapping(
    intermediate_asset: Vc<Box<dyn OutputAsset>>,
    intermediate_output_path: FileSystemPath,
) -> Result<Vc<AssetsForSourceMapping>> {
    let internal_assets =
        internal_assets(intermediate_asset, intermediate_output_path.clone()).await?;
    let intermediate_output_path = intermediate_output_path.clone();
    let mut internal_assets_for_source_mapping = FxHashMap::default();
    for asset in internal_assets.iter() {
        if let Some(generate_source_map) =
            ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(*asset)
            && let Some(path) = intermediate_output_path.get_path_to(&*asset.path().await?)
        {
            internal_assets_for_source_mapping.insert(path.to_string(), generate_source_map);
        }
    }
    Ok(Vc::cell(internal_assets_for_source_mapping))
}

/// Emit a basic package.json that sets the type of the package to commonjs.
/// Currently code generated for Node is CommonJS, while authored code may be
/// ESM, for example.
fn emit_package_json(dir: FileSystemPath) -> Result<Vc<()>> {
    Ok(emit(
        Vc::upcast(VirtualOutputAsset::new(
            dir.join("package.json")?,
            AssetContent::file(File::from("{\"type\": \"commonjs\"}").into()),
        )),
        dir,
    ))
}

/// Creates a node.js renderer pool for an entrypoint.
#[turbo_tasks::function(operation)]
pub async fn get_renderer_pool_operation(
    cwd: FileSystemPath,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    intermediate_asset: ResolvedVc<Box<dyn OutputAsset>>,
    intermediate_output_path: FileSystemPath,
    output_root: FileSystemPath,
    project_dir: FileSystemPath,
    debug: bool,
) -> Result<Vc<NodeJsPool>> {
    emit_package_json(intermediate_output_path.clone())?.await?;

    emit(*intermediate_asset, output_root.clone())
        .as_side_effect()
        .await?;
    let assets_for_source_mapping =
        internal_assets_for_source_mapping(*intermediate_asset, output_root.clone());

    let entrypoint = intermediate_asset.path().owned().await?;

    let Some(cwd) = to_sys_path(cwd.clone()).await? else {
        bail!(
            "can only render from a disk filesystem, but `cwd = {}`",
            cwd.value_to_string().await?
        );
    };
    let Some(entrypoint) = to_sys_path(entrypoint.clone()).await? else {
        bail!(
            "can only render from a disk filesystem, but `entrypoint = {}`",
            entrypoint.value_to_string().await?
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
pub async fn get_intermediate_asset(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    main_entry: ResolvedVc<Box<dyn EvaluatableAsset>>,
    other_entries: Vc<EvaluatableAssets>,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    Ok(chunking_context.root_entry_chunk_group_asset(
        chunking_context
            .chunk_path(None, main_entry.ident(), None, rcstr!(".js"))
            .owned()
            .await?,
        other_entries.with_entry(*main_entry),
        ModuleGraph::from_modules(
            Vc::cell(vec![ChunkGroupEntry::Entry(
                other_entries
                    .await?
                    .into_iter()
                    .copied()
                    .chain(std::iter::once(main_entry))
                    .map(ResolvedVc::upcast)
                    .collect(),
            )]),
            false,
        ),
        OutputAssets::empty(),
        OutputAssets::empty(),
    ))
}

#[derive(Clone, Debug)]
#[turbo_tasks::value(shared)]
pub struct ResponseHeaders {
    pub status: u16,
    pub headers: Vec<(RcStr, RcStr)>,
}
