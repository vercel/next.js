use std::collections::{HashSet, VecDeque};

use anyhow::Result;
use turbo_tasks::primitives::StringVc;

use crate::{
    asset::{AssetVc, AssetsVc},
    resolve::{ResolveResult, ResolveResultVc},
};

#[turbo_tasks::value_trait]
pub trait AssetReference {
    fn resolve_reference(&self) -> ResolveResultVc;
    // TODO think about different types
    // fn kind(&self) -> AssetReferenceTypeVc;
    fn description(&self) -> StringVc;
}

#[turbo_tasks::value(transparent)]
pub struct AssetReferences(Vec<AssetReferenceVc>);

#[turbo_tasks::value_impl]
impl AssetReferencesVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        AssetReferencesVc::slot(Vec::new())
    }
}

#[turbo_tasks::function]
pub async fn all_referenced_assets(asset: AssetVc) -> Result<AssetsVc> {
    let references_set = asset.references().await?;
    let mut assets = Vec::new();
    let mut queue = VecDeque::new();
    for reference in references_set.iter() {
        queue.push_back(reference.resolve_reference());
    }
    // that would be non-deterministic:
    // while let Some(result) = race_pop(&mut queue).await {
    // match &*result? {
    while let Some(resolve_result) = queue.pop_front() {
        match &*resolve_result.await? {
            ResolveResult::Single(module, references) => {
                assets.push(*module);
                for reference in references {
                    queue.push_back(reference.resolve_reference());
                }
            }
            ResolveResult::Alternatives(modules, references) => {
                assets.extend(modules);
                for reference in references {
                    queue.push_back(reference.resolve_reference());
                }
            }
            ResolveResult::Special(_, references) => {
                for reference in references {
                    queue.push_back(reference.resolve_reference());
                }
            }
            ResolveResult::Nested(_) => todo!(),
            ResolveResult::Keyed(_, _) => todo!(),
            ResolveResult::Unresolveable(references) => {
                for reference in references {
                    queue.push_back(reference.resolve_reference());
                }
            }
        }
    }
    Ok(AssetsVc::slot(assets))
}

#[turbo_tasks::function]
pub async fn all_assets(asset: AssetVc) -> Result<AssetsVc> {
    let mut queue = VecDeque::new();
    queue.push_back(all_referenced_assets(asset));
    let mut assets = HashSet::new();
    assets.insert(asset);
    while let Some(references) = queue.pop_front() {
        for asset in references.await?.iter() {
            if assets.insert(*asset) {
                queue.push_back(all_referenced_assets(*asset));
            }
        }
    }
    Ok(AssetsVc::slot(assets.into_iter().collect()))
}
