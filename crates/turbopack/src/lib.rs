#![feature(box_patterns)]
#![feature(box_syntax)]
#![feature(trivial_bounds)]
#![feature(into_future)]
#![feature(map_try_insert)]
#![feature(option_get_or_insert_default)]
#![feature(once_cell)]
#![feature(hash_set_entry)]
#![recursion_limit = "256"]

use std::{
    collections::{HashMap, HashSet, VecDeque},
    mem::swap,
};

use anyhow::Result;
use asset::{AssetVc, AssetsSet, AssetsSetVc};
use graph::{aggregate, AggregatedGraphNodeContent, AggregatedGraphVc};
use module_options::{
    module_options, ModuleRuleCondition, ModuleRuleEffect, ModuleRuleEffectKey, ModuleType,
};
use reference::all_referenced_assets;
use turbo_tasks::{CompletionVc, Value};

// TODO move into ecmascript?
pub mod analyzer;
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
pub async fn module(source: AssetVc) -> Result<AssetVc> {
    let path = source.path();
    let options = module_options(path.parent());
    let options = options.await?;
    let path_value = path.await?;

    let mut effects = HashMap::new();
    for rule in options.rules.iter() {
        if rule.conditions.iter().all(|c| match c {
            ModuleRuleCondition::ResourcePathEndsWith(end) => path_value.path.ends_with(end),
            ModuleRuleCondition::ResourcePathHasNoExtension => {
                if let Some(i) = path_value.path.rfind('.') {
                    if let Some(j) = path_value.path.rfind('/') {
                        j > i
                    } else {
                        false
                    }
                } else {
                    true
                }
            }
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
            ModuleType::Ecmascript => ecmascript::ModuleAssetVc::new(
                source,
                Value::new(ecmascript::ModuleAssetType::Ecmascript),
            )
            .into(),
            ModuleType::Typescript => ecmascript::ModuleAssetVc::new(
                source,
                Value::new(ecmascript::ModuleAssetType::Typescript),
            )
            .into(),
            ModuleType::TypescriptDeclaration => ecmascript::ModuleAssetVc::new(
                source,
                Value::new(ecmascript::ModuleAssetType::TypescriptDeclaration),
            )
            .into(),
            ModuleType::Json => json::ModuleAssetVc::new(source).into(),
            ModuleType::Raw => source,
            ModuleType::Css => todo!(),
            ModuleType::Custom(_) => todo!(),
        },
    )
}

#[turbo_tasks::function]
pub async fn emit(asset: AssetVc) {
    // emit_assets_recursive_avoid_cycle(asset, CycleDetectionVc::new());
    emit_assets_recursive(asset);
}

#[turbo_tasks::function]
pub async fn emit_with_completion(asset: AssetVc) -> CompletionVc {
    emit_assets_aggregated(asset)
}

#[turbo_tasks::function]
async fn emit_assets_aggregated(asset: AssetVc) -> CompletionVc {
    let aggregated = aggregate(asset);
    emit_aggregated_assets(aggregated)
}

#[turbo_tasks::function]
async fn emit_aggregated_assets(aggregated: AggregatedGraphVc) -> Result<CompletionVc> {
    Ok(match &*aggregated.content().await? {
        AggregatedGraphNodeContent::Asset(asset) => emit_asset(*asset),
        AggregatedGraphNodeContent::Children(children) => {
            for aggregated in children {
                emit_aggregated_assets(*aggregated).await?;
            }
            CompletionVc::new()
        }
    })
}

#[turbo_tasks::function(cycle)]
async fn emit_assets_recursive(asset: AssetVc) -> Result<()> {
    let assets_set = all_referenced_assets(asset).await?;
    emit_asset(asset);
    for asset in assets_set.assets.iter() {
        emit_assets_recursive(*asset);
    }
    Ok(())
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
struct CycleDetection {
    visited: HashSet<AssetVc>,
}

impl CycleDetection {
    fn has(&self, asset: &AssetVc) -> bool {
        self.visited.contains(asset)
    }
}

#[turbo_tasks::value_impl]
impl CycleDetectionVc {
    #[turbo_tasks::function]
    fn new() -> Self {
        Self::slot(CycleDetection {
            visited: HashSet::new(),
        })
    }

    #[turbo_tasks::function]
    async fn concat(self, asset: AssetVc) -> Result<Self> {
        let mut visited = self.await?.visited.clone();
        visited.insert(asset);
        Ok(CycleDetection { visited }.into())
    }
}

#[turbo_tasks::function]
async fn emit_assets_recursive_avoid_cycle(
    asset: AssetVc,
    cycle_detection: CycleDetectionVc,
) -> Result<()> {
    let assets_set = all_referenced_assets(asset).await?;
    emit_asset(asset);
    if !assets_set.assets.is_empty() {
        let cycle_detection_value = cycle_detection.await?;
        let new_cycle_detection = cycle_detection.concat(asset);
        for ref_asset in assets_set.assets.iter() {
            let ref_asset = ref_asset.resolve().await?;
            if ref_asset == asset {
                continue;
            }
            if cycle_detection_value.has(&ref_asset) {
                continue;
            }
            emit_assets_recursive_avoid_cycle(ref_asset, new_cycle_detection);
        }
    }
    Ok(())
}

#[turbo_tasks::function]
pub fn emit_asset(asset: AssetVc) -> CompletionVc {
    asset.path().write(asset.content())
}

#[turbo_tasks::function]
pub fn print_most_referenced(asset: AssetVc) {
    let aggregated = aggregate(asset);
    let back_references = compute_back_references(aggregated);
    let sorted_back_references = top_references(back_references);
    print_references(sorted_back_references);
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
struct ReferencesList {
    referenced_by: HashMap<AssetVc, HashSet<AssetVc>>,
}

#[turbo_tasks::function]
async fn compute_back_references(aggregated: AggregatedGraphVc) -> Result<ReferencesListVc> {
    Ok(match &*aggregated.content().await? {
        AggregatedGraphNodeContent::Asset(asset) => {
            let mut referenced_by = HashMap::new();
            for reference in all_referenced_assets(*asset).await?.assets.iter() {
                referenced_by.insert(*reference, [*asset].into_iter().collect());
            }
            ReferencesList { referenced_by }.into()
        }
        AggregatedGraphNodeContent::Children(children) => {
            let mut referenced_by = HashMap::<AssetVc, HashSet<AssetVc>>::new();
            let lists = children
                .iter()
                .map(|child| compute_back_references(*child))
                .collect::<Vec<_>>();
            for list in lists {
                for (key, values) in list.await?.referenced_by.iter() {
                    if let Some(set) = referenced_by.get_mut(key) {
                        for value in values {
                            set.insert(*value);
                        }
                    } else {
                        referenced_by.insert(*key, values.clone());
                    }
                }
            }
            ReferencesList { referenced_by }.into()
        }
    })
}

#[turbo_tasks::function]
async fn top_references(list: ReferencesListVc) -> Result<ReferencesListVc> {
    let list = list.await?;
    const N: usize = 5;
    let mut top = Vec::<(&AssetVc, &HashSet<AssetVc>)>::new();
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
            .map(|(asset, set)| (*asset, set.clone()))
            .collect(),
    }
    .into())
}

#[turbo_tasks::function]
async fn print_references(list: ReferencesListVc) -> Result<()> {
    let list = list.await?;
    println!("TOP REFERENCES:");
    for (asset, references) in list.referenced_by.iter() {
        println!(
            "{} -> {} times referenced",
            asset.path().await?.path,
            references.len()
        );
    }
    Ok(())
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

#[doc(hidden)]
pub mod __internals {
    pub use super::analyzer::test_utils;
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
