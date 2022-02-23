#![feature(trivial_bounds)]
#![feature(into_future)]

use asset::{Asset, AssetRef, AssetsSet, AssetsSetRef};
use resolve::referenced_modules;
use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

pub mod asset;
mod ecmascript;
pub mod reference;
pub mod resolve;
pub mod source_asset;
mod utils;

#[turbo_tasks::function]
pub async fn emit(input: AssetRef, input_dir: FileSystemPathRef, output_dir: FileSystemPathRef) {
    let asset = nft_asset(input, input_dir, output_dir);
    emit_assets_recursive(asset);
}

#[turbo_tasks::function]
pub async fn emit_assets_recursive(asset: AssetRef) {
    let assets_set = asset.references().await;
    emit_asset(asset);
    for asset in assets_set.assets.iter() {
        emit_assets_recursive(asset.clone());
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
