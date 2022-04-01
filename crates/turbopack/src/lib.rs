#![feature(box_patterns)]
#![feature(box_syntax)]
#![feature(trivial_bounds)]
#![feature(into_future)]
#![feature(map_try_insert)]
#![feature(option_get_or_insert_default)]
#![feature(once_cell)]

use std::{
    collections::{HashMap, HashSet, VecDeque},
    mem::swap,
};

use anyhow::Result;
use asset::{AssetRef, AssetsSet, AssetsSetRef};
use graph::{aggregate, AggregatedGraphNodeContent, AggregatedGraphRef};
use module_options::{
    module_options, ModuleRuleCondition, ModuleRuleEffect, ModuleRuleEffectKey, ModuleType,
};
use reference::all_referenced_assets;
use turbo_tasks::CompletionRef;

// TODO move into ecmascript?
mod analyzer;
pub mod asset;
pub mod ecmascript;
mod errors;
mod graph;
pub mod json;
pub mod module_options;
pub mod rebase;
pub mod reference;
pub mod resolve;
pub mod source_asset;
mod utils;

#[turbo_tasks::function]
pub async fn module(source: AssetRef) -> Result<AssetRef> {
    let path = source.path();
    let options = module_options(path.clone().parent());
    let options = options.await?;
    let path_value = path.await?;

    let mut effects = HashMap::new();
    for rule in options.rules.iter() {
        if rule.conditions.iter().all(|c| match c {
            ModuleRuleCondition::ResourcePathEndsWith(end) => path_value.path.ends_with(end),
            _ => todo!("not implemented yet"),
        }) {
            for (key, effect) in rule.effects.iter() {
                effects.insert(key, effect);
            }
        }
    }
    Ok(
        match effects
            .get(&ModuleRuleEffectKey::ModuleType)
            .map(|e| {
                if let ModuleRuleEffect::ModuleType(ty) = e {
                    ty
                } else {
                    &ModuleType::Ecmascript
                }
            })
            .unwrap_or_else(|| &ModuleType::Raw)
        {
            ModuleType::Ecmascript => ecmascript::ModuleAssetRef::new(source.clone()).into(),
            ModuleType::Json => json::ModuleAssetRef::new(source.clone()).into(),
            ModuleType::Raw => source,
            ModuleType::Css => todo!(),
            ModuleType::Custom(_) => todo!(),
        },
    )
}

#[turbo_tasks::function]
pub async fn emit(asset: AssetRef) {
    // emit_assets_recursive_avoid_cycle(asset, CycleDetectionRef::new());
    emit_assets_recursive(asset);
}

#[turbo_tasks::function]
pub async fn emit_with_completion(asset: AssetRef) -> CompletionRef {
    emit_assets_aggregated(asset)
}

#[turbo_tasks::function]
async fn emit_assets_aggregated(asset: AssetRef) -> CompletionRef {
    let aggregated = aggregate(asset);
    emit_aggregated_assets(aggregated)
}

#[turbo_tasks::function]
async fn emit_aggregated_assets(aggregated: AggregatedGraphRef) -> Result<CompletionRef> {
    Ok(match &*aggregated.content().await? {
        AggregatedGraphNodeContent::Asset(asset) => emit_asset(asset.clone()),
        AggregatedGraphNodeContent::Children(children) => {
            for aggregated in children {
                emit_aggregated_assets(aggregated.clone()).await?;
            }
            CompletionRef::new()
        }
    })
}

#[turbo_tasks::function(cycle)]
async fn emit_assets_recursive(asset: AssetRef) -> Result<()> {
    let assets_set = all_referenced_assets(asset.clone()).await?;
    emit_asset(asset);
    for asset in assets_set.assets.iter() {
        emit_assets_recursive(asset.clone());
    }
    Ok(())
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
struct CycleDetection {
    visited: HashSet<AssetRef>,
}

impl CycleDetection {
    fn has(&self, asset: &AssetRef) -> bool {
        self.visited.contains(asset)
    }
}

#[turbo_tasks::value_impl]
impl CycleDetectionRef {
    fn new() -> Self {
        Self::slot(CycleDetection {
            visited: HashSet::new(),
        })
    }

    async fn concat(self, asset: AssetRef) -> Result<Self> {
        let mut visited = self.await?.visited.clone();
        visited.insert(asset);
        Ok(CycleDetection { visited }.into())
    }
}

#[turbo_tasks::function]
async fn emit_assets_recursive_avoid_cycle(
    asset: AssetRef,
    cycle_detection: CycleDetectionRef,
) -> Result<()> {
    let assets_set = all_referenced_assets(asset.clone()).await?;
    emit_asset(asset.clone());
    if !assets_set.assets.is_empty() {
        let cycle_detection_value = cycle_detection.get().await?;
        let new_cycle_detection = cycle_detection.concat(asset.clone());
        for ref_asset in assets_set.assets.iter() {
            let ref_asset = ref_asset.clone().resolve().await?;
            if ref_asset == asset {
                continue;
            }
            if cycle_detection_value.has(&ref_asset) {
                continue;
            }
            emit_assets_recursive_avoid_cycle(ref_asset, new_cycle_detection.clone());
        }
    }
    Ok(())
}

#[turbo_tasks::function]
pub fn emit_asset(asset: AssetRef) -> CompletionRef {
    asset.path().write(asset.content())
}

#[turbo_tasks::function]
pub fn print_most_referenced(asset: AssetRef) {
    let aggregated = aggregate(asset);
    let back_references = compute_back_references(aggregated);
    let sorted_back_references = top_references(back_references);
    print_references(sorted_back_references);
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
struct ReferencesList {
    referenced_by: HashMap<AssetRef, HashSet<AssetRef>>,
}

#[turbo_tasks::function]
async fn compute_back_references(aggregated: AggregatedGraphRef) -> Result<ReferencesListRef> {
    Ok(match &*aggregated.content().await? {
        AggregatedGraphNodeContent::Asset(asset) => {
            let mut referenced_by = HashMap::new();
            for reference in all_referenced_assets(asset.clone()).await?.assets.iter() {
                referenced_by.insert(reference.clone(), [asset.clone()].into_iter().collect());
            }
            ReferencesList { referenced_by }.into()
        }
        AggregatedGraphNodeContent::Children(children) => {
            let mut referenced_by = HashMap::<AssetRef, HashSet<AssetRef>>::new();
            let lists = children
                .iter()
                .map(|child| compute_back_references(child.clone()))
                .collect::<Vec<_>>();
            for list in lists {
                for (key, values) in list.await?.referenced_by.iter() {
                    if let Some(set) = referenced_by.get_mut(key) {
                        for value in values {
                            set.insert(value.clone());
                        }
                    } else {
                        referenced_by.insert(key.clone(), values.clone());
                    }
                }
            }
            ReferencesList { referenced_by }.into()
        }
    })
}

#[turbo_tasks::function]
async fn top_references(list: ReferencesListRef) -> Result<ReferencesListRef> {
    let list = list.get().await?;
    const N: usize = 5;
    let mut top = Vec::<(&AssetRef, &HashSet<AssetRef>)>::new();
    for tuple in list.referenced_by.iter() {
        let mut current = tuple;
        for i in 0..top.len() {
            if top[i].1.len() < tuple.1.len() {
                swap(&mut top[i], &mut current);
            }
        }
        if top.len() < N {
            top.push(current);
        }
    }
    Ok(ReferencesList {
        referenced_by: top
            .into_iter()
            .map(|(asset, set)| (asset.clone(), set.clone()))
            .collect(),
    }
    .into())
}

#[turbo_tasks::function]
async fn print_references(list: ReferencesListRef) -> Result<()> {
    let list = list.get().await?;
    println!("TOP REFERENCES:");
    for (asset, references) in list.referenced_by.iter() {
        println!(
            "{} -> {} times referenced",
            asset.clone().path().await?.path,
            references.len()
        );
    }
    Ok(())
}

#[turbo_tasks::function]
pub async fn all_assets(asset: AssetRef) -> Result<AssetsSetRef> {
    let mut queue = VecDeque::new();
    queue.push_back(all_referenced_assets(asset.clone()));
    let mut assets = HashSet::new();
    assets.insert(asset);
    while let Some(references) = queue.pop_front() {
        for asset in references.await?.assets.iter() {
            if assets.insert(asset.clone()) {
                queue.push_back(all_referenced_assets(asset.clone()));
            }
        }
    }
    Ok(AssetsSet {
        assets: assets.into_iter().collect(),
    }
    .into())
}
