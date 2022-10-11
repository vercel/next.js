use std::hash::Hash;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::ResolveResultVc,
};

#[turbo_tasks::value]
#[derive(Hash)]
pub struct RebasedAsset {
    source: AssetVc,
    input_dir: FileSystemPathVc,
    output_dir: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl RebasedAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, input_dir: FileSystemPathVc, output_dir: FileSystemPathVc) -> Self {
        Self::cell(RebasedAsset {
            source,
            input_dir,
            output_dir,
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
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let input_references = self.source.references().await?;
        let mut references = Vec::new();
        for reference in input_references.iter() {
            references.push(
                RebasedAssetReference {
                    reference: *reference,
                    input_dir: self.input_dir,
                    output_dir: self.output_dir,
                }
                .cell()
                .into(),
            );
        }
        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value(shared)]
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
                    let reference: AssetReferenceVc = RebasedAssetReference {
                        reference,
                        input_dir: self.input_dir,
                        output_dir: self.output_dir,
                    }
                    .cell()
                    .into();
                    async move { Ok(reference) }
                },
            )
            .await?
            .into())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for RebasedAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "rebased {}",
            self.reference.to_string().await?
        )))
    }
}
