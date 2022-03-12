use std::hash::Hash;

use anyhow::Result;
use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

use crate::{
    asset::{Asset, AssetRef},
    reference::{AssetReference, AssetReferenceRef, AssetReferencesSet, AssetReferencesSetRef},
    resolve::{ResolveResult, ResolveResultRef},
};

#[turbo_tasks::value(Asset)]
#[derive(Hash, PartialEq, Eq)]
pub struct RebasedAsset {
    source: AssetRef,
    input_dir: FileSystemPathRef,
    output_dir: FileSystemPathRef,
}

#[turbo_tasks::value_impl]
impl RebasedAssetRef {
    pub fn new(
        source: AssetRef,
        input_dir: FileSystemPathRef,
        output_dir: FileSystemPathRef,
    ) -> Self {
        Self::slot(RebasedAsset {
            source: source,
            input_dir: input_dir,
            output_dir: output_dir,
        })
    }
}

#[turbo_tasks::value_impl]
impl Asset for RebasedAsset {
    async fn path(&self) -> FileSystemPathRef {
        FileSystemPathRef::rebase(
            self.source.path(),
            self.input_dir.clone(),
            self.output_dir.clone(),
        )
    }

    async fn content(&self) -> FileContentRef {
        self.source.path().read()
    }

    async fn references(&self) -> Result<AssetReferencesSetRef> {
        let input_references = self.source.references().await?;
        let mut references = Vec::new();
        for reference in input_references.references.iter() {
            references.push(
                RebasedAssetReference {
                    reference: reference.clone().resolve().await?,
                    input_dir: self.input_dir.clone(),
                    output_dir: self.output_dir.clone(),
                }
                .into(),
            );
        }
        Ok(AssetReferencesSet { references }.into())
    }
}

#[turbo_tasks::value(shared, AssetReference)]
#[derive(PartialEq, Eq)]
struct RebasedAssetReference {
    reference: AssetReferenceRef,
    input_dir: FileSystemPathRef,
    output_dir: FileSystemPathRef,
}

#[turbo_tasks::value_impl]
impl AssetReference for RebasedAssetReference {
    async fn resolve_reference(&self) -> Result<ResolveResultRef> {
        let result = self.reference.resolve_reference().await?;
        Ok(match &*result {
            ResolveResult::Single(module, more) => {
                if more.is_some() {
                    todo!();
                }
                ResolveResult::Single(
                    RebasedAssetRef::new(
                        module.clone(),
                        self.input_dir.clone(),
                        self.output_dir.clone(),
                    )
                    .into(),
                    None,
                )
                .into()
            }
            ResolveResult::Unresolveable => ResolveResult::Unresolveable.into(),
            _ => todo!("{:?}", result),
        })
    }
}
