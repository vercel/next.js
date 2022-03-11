use anyhow::Result;

use crate::{
    asset::{AssetRef, AssetsSet, AssetsSetRef},
    resolve::{ResolveResult, ResolveResultRef},
};

#[turbo_tasks::value_trait]
pub trait AssetReference {
    fn resolve_reference(&self) -> ResolveResultRef;
    // TODO think about different types
    // fn kind(&self) -> AssetReferenceTypeRef;
}

#[turbo_tasks::value(shared)]
#[derive(Hash, PartialEq, Eq)]
pub struct AssetReferencesSet {
    pub references: Vec<AssetReferenceRef>,
}

#[turbo_tasks::value_impl]
impl AssetReferencesSetRef {
    pub fn empty() -> Self {
        Self::slot(AssetReferencesSet {
            references: Vec::new(),
        })
    }
}

#[turbo_tasks::function]
pub async fn all_referenced_assets(asset: AssetRef) -> Result<AssetsSetRef> {
    let references_set = asset.references().await?;
    let mut assets = Vec::new();
    for reference in references_set.references.iter() {
        let resolve_result = reference.clone().resolve_reference();
        match &*resolve_result.await? {
            ResolveResult::Single(module, references) => {
                assets.push(module.clone());
                if references.is_some() {
                    todo!();
                }
            }
            ResolveResult::Nested(_) => todo!(),
            ResolveResult::Keyed(_, _) => todo!(),
            ResolveResult::Alternatives(_, _) => todo!(),
            ResolveResult::Unresolveable => {}
        }
    }
    Ok(AssetsSet { assets }.into())
}
