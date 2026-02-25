#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use anyhow::Result;
use rustc_hash::FxHashMap;
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{ExpandOutputAssetsInput, OutputAsset, OutputAssets, expand_output_assets},
    source_map::GenerateSourceMap,
    virtual_output::VirtualOutputAsset,
};

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
            AssetContent::file(FileContent::Content(File::from("{\"type\": \"commonjs\"}")).cell()),
        )),
        dir,
    ))
}
