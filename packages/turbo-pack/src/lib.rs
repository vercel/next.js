#![feature(trivial_bounds)]
#![feature(into_future)]

use std::collections::HashSet;

use asset::{Asset, AssetRef, AssetsSet, AssetsSetRef};
use graph::{aggregate, AggregatedGraph, AggregatedGraphRef};
use resolve::referenced_modules;
use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

pub mod asset;
mod ecmascript;
mod graph;
pub mod reference;
pub mod resolve;
pub mod source_asset;
mod utils;

#[turbo_tasks::function]
pub async fn emit(input: AssetRef, input_dir: FileSystemPathRef, output_dir: FileSystemPathRef) {
    let asset = nft_asset(input, input_dir, output_dir);
    // emit_assets_recursive_avoid_cycle(asset, CycleDetectionRef::new());
    emit_assets_aggregated(asset);
}

#[turbo_tasks::function]
async fn emit_assets_aggregated(asset: AssetRef) {
    let aggregated = aggregate(asset);
    emit_aggregated_assets(aggregated);
}

#[turbo_tasks::function]
async fn emit_aggregated_assets(aggregated: AggregatedGraphRef) {
    match &*aggregated.await {
        AggregatedGraph::Leaf(asset) => {
            // #[cfg(debug_assertions)]
            // println!("emit_aggregated_assets leaf {}", asset.path().await.path);
            emit_asset(asset.clone());
        }
        AggregatedGraph::Node {
            depth,
            #[cfg(debug_assertions)]
            root,
            inner,
            boundary,
        } => {
            // #[cfg(debug_assertions)]
            // println!(
            //     "emit_aggregated_assets node {} {}",
            //     depth,
            //     root.path().await.path
            // );
            for aggregated in inner {
                emit_aggregated_assets(aggregated.clone());
            }
            for aggregated in boundary {
                emit_aggregated_assets(aggregated.clone());
            }
        }
    }
}

#[turbo_tasks::function]
async fn emit_assets_recursive(asset: AssetRef) {
    let assets_set = asset.references().await;
    emit_asset(asset);
    for asset in assets_set.assets.iter() {
        emit_assets_recursive(asset.clone());
    }
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
struct CycleDetection {
    visited: HashSet<AssetRef>,
}

#[turbo_tasks::value_impl]
impl CycleDetection {
    #[turbo_tasks::constructor(intern)]
    fn new() -> Self {
        Self {
            visited: HashSet::new(),
        }
    }

    fn has(&self, asset: &AssetRef) -> bool {
        self.visited.contains(asset)
    }
}

#[turbo_tasks::value_impl]
impl CycleDetectionRef {
    async fn concat(self, asset: AssetRef) -> Self {
        let mut visited = self.await.visited.clone();
        visited.insert(asset);
        CycleDetection { visited }.into()
    }
}

#[turbo_tasks::function]
async fn emit_assets_recursive_avoid_cycle(asset: AssetRef, cycle_detection: CycleDetectionRef) {
    let assets_set = asset.references().await;
    emit_asset(asset.clone());
    if !assets_set.assets.is_empty() {
        let cycle_detection_value = cycle_detection.get().await;
        let new_cycle_detection = cycle_detection.concat(asset.clone());
        for ref_asset in assets_set.assets.iter() {
            let ref_asset = ref_asset.clone().resolve_to_slot().await;
            if ref_asset == asset {
                continue;
            }
            if cycle_detection_value.has(&ref_asset) {
                continue;
            }
            emit_assets_recursive_avoid_cycle(ref_asset, new_cycle_detection.clone());
        }
    }
}

#[turbo_tasks::function]
pub async fn nft_asset(
    source: AssetRef,
    input_dir: FileSystemPathRef,
    output_dir: FileSystemPathRef,
) -> AssetRef {
    let new_path = FileSystemPathRef::rebase(source.path(), input_dir.clone(), output_dir.clone());

    NftAssetSource {
        path: new_path,
        source,
        input_dir,
        output_dir,
    }
    .into()
}

#[turbo_tasks::value(intern, Asset)]
#[derive(Hash, PartialEq, Eq)]
struct NftAssetSource {
    path: FileSystemPathRef,
    source: AssetRef,
    input_dir: FileSystemPathRef,
    output_dir: FileSystemPathRef,
}

#[turbo_tasks::value_impl]
impl Asset for NftAssetSource {
    async fn path(&self) -> FileSystemPathRef {
        self.path.clone()
    }

    async fn content(&self) -> FileContentRef {
        self.source.path().read()
    }

    async fn references(&self) -> AssetsSetRef {
        let input_references = referenced_modules(self.source.clone());
        let mut assets = Vec::new();
        for asset in input_references.await.assets.iter() {
            assets.push(nft_asset(
                asset.clone(),
                self.input_dir.clone(),
                self.output_dir.clone(),
            ));
        }
        AssetsSet { assets }.into()
    }
}

#[turbo_tasks::function]
pub fn emit_asset(asset: AssetRef) {
    asset.path().write(asset.content());
}
