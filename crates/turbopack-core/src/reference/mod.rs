use std::collections::{HashSet, VecDeque};

use anyhow::Result;
use turbo_tasks::primitives::StringVc;

use crate::{
    asset::{AssetVc, AssetsSet, AssetsSetVc},
    resolve::{ResolveResult, ResolveResultVc},
};

#[turbo_tasks::value_trait]
pub trait AssetReference {
    fn resolve_reference(&self) -> ResolveResultVc;
    // TODO think about different types
    // fn kind(&self) -> AssetReferenceTypeVc;
    fn description(&self) -> StringVc;
}

#[turbo_tasks::function]
pub async fn all_referenced_assets(asset: AssetVc) -> Result<AssetsSetVc> {
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
    Ok(AssetsSet { assets }.into())
}

#[turbo_tasks::function]
pub async fn all_assets(asset: AssetVc) -> Result<AssetsSetVc> {
    let mut queue = VecDeque::new();
    queue.push_back(all_referenced_assets(asset));
    let mut assets = HashSet::new();
    assets.insert(asset);
    while let Some(references) = queue.pop_front() {
        for asset in references.await?.assets.iter() {
            if assets.insert(*asset) {
                queue.push_back(all_referenced_assets(*asset));
            }
        }
    }
    Ok(AssetsSet {
        assets: assets.into_iter().collect(),
    }
    .into())
}
