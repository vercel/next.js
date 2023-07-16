use std::hash::Hash;

use anyhow::Result;
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    output::OutputAsset,
    reference::{AssetReference, AssetReferences},
    resolve::ResolveResult,
};

#[turbo_tasks::value]
#[derive(Hash)]
pub struct RebasedAsset {
    source: Vc<Box<dyn Asset>>,
    input_dir: Vc<FileSystemPath>,
    output_dir: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl RebasedAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: Vc<Box<dyn Asset>>,
        input_dir: Vc<FileSystemPath>,
        output_dir: Vc<FileSystemPath>,
    ) -> Vc<Self> {
        Self::cell(RebasedAsset {
            source,
            input_dir,
            output_dir,
        })
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for RebasedAsset {}

#[turbo_tasks::value_impl]
impl Asset for RebasedAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        AssetIdent::from_path(FileSystemPath::rebase(
            self.source.ident().path(),
            self.input_dir,
            self.output_dir,
        ))
    }

    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<AssetReferences>> {
        let input_references = self.source.references().await?;
        let mut references = Vec::new();
        for reference in input_references.iter() {
            references.push(Vc::upcast(
                RebasedAssetReference {
                    reference: *reference,
                    input_dir: self.input_dir,
                    output_dir: self.output_dir,
                }
                .cell(),
            ));
        }
        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value(shared)]
struct RebasedAssetReference {
    reference: Vc<Box<dyn AssetReference>>,
    input_dir: Vc<FileSystemPath>,
    output_dir: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl AssetReference for RebasedAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ResolveResult>> {
        let result = self.reference.resolve_reference().await?;
        Ok(result
            .map(
                |asset| {
                    let asset =
                        Vc::upcast(RebasedAsset::new(asset, self.input_dir, self.output_dir));
                    async move { Ok(asset) }
                },
                |reference| {
                    let reference: Vc<Box<dyn AssetReference>> = Vc::upcast(
                        RebasedAssetReference {
                            reference,
                            input_dir: self.input_dir,
                            output_dir: self.output_dir,
                        }
                        .cell(),
                    );
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
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "rebased {}",
            self.reference.to_string().await?
        )))
    }
}
