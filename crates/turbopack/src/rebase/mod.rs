use std::hash::Hash;

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use crate::{
    asset::{Asset, AssetVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::ResolveResultVc,
};

#[turbo_tasks::value(Asset)]
#[derive(Hash, PartialEq, Eq)]
pub struct RebasedAsset {
    source: AssetVc,
    input_dir: FileSystemPathVc,
    output_dir: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl RebasedAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, input_dir: FileSystemPathVc, output_dir: FileSystemPathVc) -> Self {
        Self::slot(RebasedAsset {
            source: source,
            input_dir: input_dir,
            output_dir: output_dir,
        })
    }
}

#[turbo_tasks::value_impl]
impl Asset for RebasedAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> FileSystemPathVc {
        FileSystemPathVc::rebase(self.source.path(), self.input_dir, self.output_dir)
    }

    #[turbo_tasks::function]
    async fn content(&self) -> FileContentVc {
        self.source.content()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<Vec<AssetReferenceVc>>> {
        let input_references = self.source.references().await?;
        let mut references = Vec::new();
        for reference in input_references.iter() {
            references.push(
                RebasedAssetReference {
                    reference: reference.resolve().await?,
                    input_dir: self.input_dir,
                    output_dir: self.output_dir,
                }
                .into(),
            );
        }
        Ok(Vc::slot(references))
    }
}

#[turbo_tasks::value(shared, AssetReference)]
#[derive(PartialEq, Eq)]
struct RebasedAssetReference {
    reference: AssetReferenceVc,
    input_dir: FileSystemPathVc,
    output_dir: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl AssetReference for RebasedAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let result = self.reference.resolve_reference().await?;
        Ok(result
            .map(
                |asset| {
                    let asset = RebasedAssetVc::new(asset, self.input_dir, self.output_dir).into();
                    async move { Ok(asset) }
                },
                |reference| {
                    let reference = RebasedAssetReference {
                        reference: reference,
                        input_dir: self.input_dir,
                        output_dir: self.output_dir,
                    }
                    .into();
                    async move { Ok(reference) }
                },
            )
            .await?
            .into())
    }
}
