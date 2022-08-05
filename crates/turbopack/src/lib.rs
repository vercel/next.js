#![feature(box_patterns)]
#![feature(box_syntax)]
#![feature(trivial_bounds)]
#![feature(min_specialization)]
#![feature(map_try_insert)]
#![feature(option_get_or_insert_default)]
#![feature(once_cell)]
#![feature(hash_set_entry)]
#![recursion_limit = "256"]

use std::{
    collections::{HashMap, HashSet},
    mem::swap,
};

use anyhow::Result;
use ecmascript::typescript::resolve::TypescriptTypesAssetReferenceVc;
use graph::{aggregate, AggregatedGraphNodeContent, AggregatedGraphVc};
use module_options::{module_options, ModuleRuleEffect, ModuleRuleEffectKey, ModuleType};
use resolve::{resolve_options, typescript_resolve_options};
use turbo_tasks::{CompletionVc, Value};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::AssetVc,
    context::{AssetContext, AssetContextVc},
    environment::EnvironmentVc,
    reference::all_referenced_assets,
    resolve::{options::ResolveOptionsVc, parse::RequestVc, ResolveResultVc},
};

mod graph;
pub mod json;
pub mod module_options;
pub mod rebase;
mod resolve;

pub use turbopack_css as css;
pub use turbopack_ecmascript as ecmascript;

#[turbo_tasks::function]
async fn module(source: AssetVc, environment: EnvironmentVc) -> Result<AssetVc> {
    let path = source.path();
    let options = module_options(path.parent());
    let options = options.await?;
    let path_value = path.await?;

    let mut effects = HashMap::new();
    for rule in options.rules.iter() {
        if rule.matches(&path_value) {
            effects.extend(rule.effects());
        }
    }

    Ok(
        match effects
            .get(&ModuleRuleEffectKey::ModuleType)
            .map(|e| {
                if let ModuleRuleEffect::ModuleType(ty) = e {
                    ty
                } else {
                    unreachable!()
                }
            })
            .unwrap_or_else(|| &ModuleType::Raw)
        {
            ModuleType::Ecmascript(transforms) => {
                turbopack_ecmascript::EcmascriptModuleAssetVc::new(
                    source,
                    ModuleAssetContextVc::new(path.parent(), environment).into(),
                    Value::new(turbopack_ecmascript::ModuleAssetType::Ecmascript),
                    *transforms,
                    environment,
                )
                .into()
            }
            ModuleType::Typescript(transforms) => {
                turbopack_ecmascript::EcmascriptModuleAssetVc::new(
                    source,
                    ModuleAssetContextVc::new(path.parent(), environment.with_typescript()).into(),
                    Value::new(turbopack_ecmascript::ModuleAssetType::Typescript),
                    *transforms,
                    environment,
                )
                .into()
            }
            ModuleType::TypescriptDeclaration(transforms) => {
                turbopack_ecmascript::EcmascriptModuleAssetVc::new(
                    source,
                    ModuleAssetContextVc::new(path.parent(), environment.with_typescript()).into(),
                    Value::new(turbopack_ecmascript::ModuleAssetType::TypescriptDeclaration),
                    *transforms,
                    environment,
                )
                .into()
            }
            ModuleType::Json => json::JsonModuleAssetVc::new(source).into(),
            ModuleType::Raw => source,
            ModuleType::Css => turbopack_css::CssModuleAssetVc::new(
                source,
                ModuleAssetContextVc::new(path.parent(), environment).into(),
            )
            .into(),
            ModuleType::Static => turbopack_static::StaticModuleAssetVc::new(
                source,
                ModuleAssetContextVc::new(path.parent(), environment).into(),
            )
            .into(),
            ModuleType::Custom(_) => todo!(),
        },
    )
}

#[turbo_tasks::value]
pub struct ModuleAssetContext {
    context_path: FileSystemPathVc,
    environment: EnvironmentVc,
}

#[turbo_tasks::value_impl]
impl ModuleAssetContextVc {
    #[turbo_tasks::function]
    pub fn new(context_path: FileSystemPathVc, environment: EnvironmentVc) -> Self {
        Self::cell(ModuleAssetContext {
            context_path,
            environment,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetContext for ModuleAssetContext {
    #[turbo_tasks::function]
    fn context_path(&self) -> FileSystemPathVc {
        self.context_path
    }

    #[turbo_tasks::function]
    fn environment(&self) -> EnvironmentVc {
        self.environment
    }

    #[turbo_tasks::function]
    async fn resolve_options(&self) -> Result<ResolveOptionsVc> {
        Ok(if *self.environment.is_typescript_enabled().await? {
            typescript_resolve_options(self.context_path)
        } else {
            resolve_options(self.context_path)
        })
    }

    #[turbo_tasks::function]
    async fn resolve_asset(
        &self,
        context_path: FileSystemPathVc,
        request: RequestVc,
        resolve_options: ResolveOptionsVc,
    ) -> Result<ResolveResultVc> {
        let result =
            turbopack_core::resolve::resolve(context_path, request, resolve_options).await?;
        let mut result = result
            .map(
                |a| module(a, self.environment).resolve(),
                |i| async move { Ok(i) },
            )
            .await?;
        if *self.environment.is_typescript_enabled().await? {
            let types_reference = TypescriptTypesAssetReferenceVc::new(
                ModuleAssetContextVc::new(context_path, self.environment).into(),
                request,
            );
            result.add_reference(types_reference.into());
        }
        Ok(result.into())
    }

    #[turbo_tasks::function]
    async fn process_resolve_result(&self, result: ResolveResultVc) -> Result<ResolveResultVc> {
        Ok(result
            .await?
            .map(
                |a| module(a, self.environment).resolve(),
                |i| async move { Ok(i) },
            )
            .await?
            .into())
    }

    #[turbo_tasks::function]
    fn process(&self, asset: AssetVc) -> AssetVc {
        module(asset, self.environment)
    }

    #[turbo_tasks::function]
    fn with_context_path(&self, path: FileSystemPathVc) -> AssetContextVc {
        ModuleAssetContextVc::new(path, self.environment).into()
    }

    #[turbo_tasks::function]
    fn with_environment(&self, environment: EnvironmentVc) -> AssetContextVc {
        ModuleAssetContextVc::new(self.context_path, environment).into()
    }
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
    let assets_set = all_referenced_assets(asset);
    emit_asset(asset);
    for asset in assets_set.await?.iter() {
        emit_assets_recursive(*asset);
    }
    Ok(())
}

#[turbo_tasks::value(shared)]
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
        Self::cell(CycleDetection {
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
    emit_asset(asset);
    let assets_set = all_referenced_assets(asset).await?;
    if !assets_set.is_empty() {
        let cycle_detection_value = cycle_detection.await?;
        let new_cycle_detection = cycle_detection.concat(asset);
        for ref_asset in assets_set.iter() {
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
struct ReferencesList {
    referenced_by: HashMap<AssetVc, HashSet<AssetVc>>,
}

#[turbo_tasks::function]
async fn compute_back_references(aggregated: AggregatedGraphVc) -> Result<ReferencesListVc> {
    Ok(match &*aggregated.content().await? {
        AggregatedGraphNodeContent::Asset(asset) => {
            let mut referenced_by = HashMap::new();
            for reference in all_referenced_assets(*asset).await?.iter() {
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
        for item in &mut top {
            if item.1.len() < tuple.1.len() {
                swap(item, &mut current);
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

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    turbopack_css::register();
    turbopack_static::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
