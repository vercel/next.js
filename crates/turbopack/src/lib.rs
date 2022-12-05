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
use css::{CssModuleAssetVc, ModuleCssModuleAssetVc};
use ecmascript::{
    typescript::resolve::TypescriptTypesAssetReferenceVc, EcmascriptModuleAssetType,
    EcmascriptModuleAssetVc,
};
use graph::{aggregate, AggregatedGraphNodeContent, AggregatedGraphVc};
use lazy_static::lazy_static;
use module_options::{
    ModuleOptionsContextVc, ModuleOptionsVc, ModuleRuleEffect, ModuleType, ModuleTypeVc,
};
pub use resolve::resolve_options;
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    CompletionVc, Value,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::AssetVc,
    context::{AssetContext, AssetContextVc},
    environment::EnvironmentVc,
    issue::{unsupported_module::UnsupportedModuleIssue, Issue, IssueVc},
    reference::all_referenced_assets,
    resolve::{
        options::ResolveOptionsVc,
        origin::PlainResolveOriginVc,
        parse::{Request, RequestVc},
        pattern::Pattern,
        resolve, ResolveResultVc,
    },
};

mod graph;
pub mod module_options;
pub mod rebase;
pub mod resolve;
pub mod resolve_options_context;
pub mod transition;

pub use turbopack_css as css;
pub use turbopack_ecmascript as ecmascript;
use turbopack_json::JsonModuleAssetVc;
use turbopack_static::StaticModuleAssetVc;

use self::{
    resolve_options_context::ResolveOptionsContextVc,
    transition::{TransitionVc, TransitionsByNameVc},
};

lazy_static! {
    static ref UNSUPPORTED_PACKAGES: HashSet<String> =
        ["@vercel/og".to_owned(), "@next/font".to_owned()].into();
    static ref UNSUPPORTED_PACKAGE_PATHS: HashSet<(String, String)> = [].into();
}

#[turbo_tasks::value]
struct ModuleIssue {
    path: FileSystemPathVc,
    title: StringVc,
    description: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for ModuleIssue {
    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("other".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.description
    }
}

#[turbo_tasks::function]
async fn get_module_type(path: FileSystemPathVc, options: ModuleOptionsVc) -> Result<ModuleTypeVc> {
    let mut current_module_type = None;
    for rule in options.await?.rules.iter() {
        if rule.matches(&path.await?) {
            for (_, effect) in rule.effects() {
                match effect {
                    ModuleRuleEffect::ModuleType(module) => {
                        current_module_type = Some(*module);
                    }
                    ModuleRuleEffect::AddEcmascriptTransforms(additional_transforms) => {
                        current_module_type = match current_module_type {
                            Some(ModuleType::Ecmascript(transforms)) => Some(
                                ModuleType::Ecmascript(transforms.extend(*additional_transforms)),
                            ),
                            Some(ModuleType::Typescript(transforms)) => Some(
                                ModuleType::Typescript(transforms.extend(*additional_transforms)),
                            ),
                            Some(module_type) => {
                                ModuleIssue {
                                    path,
                                    title: StringVc::cell("Invalid module type".to_string()),
                                    description: StringVc::cell(
                                        "The module type must be Ecmascript or Typescript to add \
                                         Ecmascript transforms"
                                            .to_string(),
                                    ),
                                }
                                .cell()
                                .as_issue()
                                .emit();
                                Some(module_type)
                            }
                            None => {
                                ModuleIssue {
                                    path,
                                    title: StringVc::cell("Missing module type".to_string()),
                                    description: StringVc::cell(
                                        "The module type effect must be applied before adding \
                                         Ecmascript transforms"
                                            .to_string(),
                                    ),
                                }
                                .cell()
                                .as_issue()
                                .emit();
                                None
                            }
                        };
                    }
                    ModuleRuleEffect::Custom => {
                        todo!("Custom module rule effects are not yet supported");
                    }
                }
            }
        }
    }

    Ok(current_module_type.unwrap_or(ModuleType::Raw).cell())
}

#[turbo_tasks::function]
async fn module(source: AssetVc, context: ModuleAssetContextVc) -> Result<AssetVc> {
    let path = source.path();
    let options = ModuleOptionsVc::new(path.parent(), context.module_options_context());

    let current_module_type = get_module_type(path, options).await?;

    Ok(match &*current_module_type {
        ModuleType::Ecmascript(transforms) => EcmascriptModuleAssetVc::new(
            source,
            context.into(),
            Value::new(EcmascriptModuleAssetType::Ecmascript),
            *transforms,
            context.environment(),
        )
        .into(),
        ModuleType::Typescript(transforms) => EcmascriptModuleAssetVc::new(
            source,
            context.with_typescript_resolving_enabled().into(),
            Value::new(EcmascriptModuleAssetType::Typescript),
            *transforms,
            context.environment(),
        )
        .into(),
        ModuleType::TypescriptDeclaration(transforms) => EcmascriptModuleAssetVc::new(
            source,
            context.with_typescript_resolving_enabled().into(),
            Value::new(EcmascriptModuleAssetType::TypescriptDeclaration),
            *transforms,
            context.environment(),
        )
        .into(),
        ModuleType::Json => JsonModuleAssetVc::new(source).into(),
        ModuleType::Raw => source,
        ModuleType::Css(transforms) => {
            CssModuleAssetVc::new(source, context.into(), *transforms).into()
        }
        ModuleType::CssModule(transforms) => {
            ModuleCssModuleAssetVc::new(source, context.into(), *transforms).into()
        }
        ModuleType::Static => StaticModuleAssetVc::new(source, context.into()).into(),
        ModuleType::Custom(_) => todo!(),
    })
}

#[turbo_tasks::value]
pub struct ModuleAssetContext {
    transitions: TransitionsByNameVc,
    environment: EnvironmentVc,
    module_options_context: ModuleOptionsContextVc,
    resolve_options_context: ResolveOptionsContextVc,
    transition: Option<TransitionVc>,
}

#[turbo_tasks::value_impl]
impl ModuleAssetContextVc {
    #[turbo_tasks::function]
    pub fn new(
        transitions: TransitionsByNameVc,
        environment: EnvironmentVc,
        module_options_context: ModuleOptionsContextVc,
        resolve_options_context: ResolveOptionsContextVc,
    ) -> Self {
        Self::cell(ModuleAssetContext {
            transitions,
            environment,
            module_options_context,
            resolve_options_context,
            transition: None,
        })
    }

    #[turbo_tasks::function]
    pub fn new_transition(
        transitions: TransitionsByNameVc,
        environment: EnvironmentVc,
        module_options_context: ModuleOptionsContextVc,
        resolve_options_context: ResolveOptionsContextVc,
        transition: TransitionVc,
    ) -> Self {
        Self::cell(ModuleAssetContext {
            transitions,
            environment,
            module_options_context,
            resolve_options_context,
            transition: Some(transition),
        })
    }

    #[turbo_tasks::function]
    pub async fn module_options_context(self) -> Result<ModuleOptionsContextVc> {
        Ok(self.await?.module_options_context)
    }

    #[turbo_tasks::function]
    pub async fn is_typescript_resolving_enabled(self) -> Result<BoolVc> {
        Ok(BoolVc::cell(
            self.await?.resolve_options_context.await?.enable_typescript,
        ))
    }

    #[turbo_tasks::function]
    pub async fn with_typescript_resolving_enabled(self) -> Result<ModuleAssetContextVc> {
        if *self.is_typescript_resolving_enabled().await? {
            return Ok(self);
        }
        let this = self.await?;
        let resolve_options_context = this
            .resolve_options_context
            .with_typescript_enabled()
            .resolve()
            .await?;
        Ok(ModuleAssetContextVc::new(
            this.transitions,
            this.environment,
            this.module_options_context,
            resolve_options_context,
        ))
    }
}

#[turbo_tasks::value_impl]
impl AssetContext for ModuleAssetContext {
    #[turbo_tasks::function]
    fn environment(&self) -> EnvironmentVc {
        self.environment
    }

    #[turbo_tasks::function]
    async fn resolve_options(&self, origin_path: FileSystemPathVc) -> Result<ResolveOptionsVc> {
        Ok(resolve_options(
            origin_path.parent().resolve().await?,
            self.resolve_options_context,
        ))
    }

    #[turbo_tasks::function]
    async fn resolve_asset(
        self_vc: ModuleAssetContextVc,
        origin_path: FileSystemPathVc,
        request: RequestVc,
        resolve_options: ResolveOptionsVc,
    ) -> Result<ResolveResultVc> {
        warn_on_unsupported_modules(request, origin_path).await?;

        let context_path = origin_path.parent().resolve().await?;

        let result = resolve(context_path, request, resolve_options);
        let result = self_vc.process_resolve_result(result);

        if *self_vc.is_typescript_resolving_enabled().await? {
            let types_reference = TypescriptTypesAssetReferenceVc::new(
                PlainResolveOriginVc::new(self_vc.into(), origin_path).into(),
                request,
            );

            result.add_reference(types_reference.into());
        }

        Ok(result)
    }

    #[turbo_tasks::function]
    async fn process_resolve_result(
        self_vc: ModuleAssetContextVc,
        result: ResolveResultVc,
    ) -> Result<ResolveResultVc> {
        Ok(result
            .await?
            .map(|a| self_vc.process(a).resolve(), |i| async move { Ok(i) })
            .await?
            .into())
    }

    #[turbo_tasks::function]
    async fn process(self_vc: ModuleAssetContextVc, asset: AssetVc) -> Result<AssetVc> {
        let this = self_vc.await?;
        if let Some(transition) = this.transition {
            let asset = transition.process_source(asset);
            let environment = transition.process_environment(this.environment);
            let module_options_context =
                transition.process_module_options_context(this.module_options_context);
            let resolve_options_context =
                transition.process_resolve_options_context(this.resolve_options_context);
            let context = ModuleAssetContextVc::new(
                this.transitions,
                environment,
                module_options_context,
                resolve_options_context,
            );
            let m = module(asset, context);
            Ok(transition.process_module(m, context))
        } else {
            let context = ModuleAssetContextVc::new(
                this.transitions,
                this.environment,
                this.module_options_context,
                this.resolve_options_context,
            );
            Ok(module(asset, context))
        }
    }

    #[turbo_tasks::function]
    async fn with_transition(&self, transition: &str) -> Result<AssetContextVc> {
        Ok(
            if let Some(transition) = self.transitions.await?.get(transition) {
                ModuleAssetContextVc::new_transition(
                    self.transitions,
                    self.environment,
                    self.module_options_context,
                    self.resolve_options_context,
                    *transition,
                )
                .into()
            } else {
                // TODO report issue
                ModuleAssetContextVc::new(
                    self.transitions,
                    self.environment,
                    self.module_options_context,
                    self.resolve_options_context,
                )
                .into()
            },
        )
    }
}

#[turbo_tasks::function]
pub async fn emit_with_completion(asset: AssetVc, output_dir: FileSystemPathVc) -> CompletionVc {
    emit_assets_aggregated(asset, output_dir)
}

#[turbo_tasks::function]
async fn emit_assets_aggregated(asset: AssetVc, output_dir: FileSystemPathVc) -> CompletionVc {
    let aggregated = aggregate(asset);
    emit_aggregated_assets(aggregated, output_dir)
}

#[turbo_tasks::function]
async fn emit_aggregated_assets(
    aggregated: AggregatedGraphVc,
    output_dir: FileSystemPathVc,
) -> Result<CompletionVc> {
    Ok(match &*aggregated.content().await? {
        AggregatedGraphNodeContent::Asset(asset) => emit_asset_into_dir(*asset, output_dir),
        AggregatedGraphNodeContent::Children(children) => {
            for aggregated in children {
                emit_aggregated_assets(*aggregated, output_dir).await?;
            }
            CompletionVc::new()
        }
    })
}

#[turbo_tasks::function]
pub async fn emit_asset(asset: AssetVc) -> CompletionVc {
    asset.content().write(asset.path())
}

#[turbo_tasks::function]
pub async fn emit_asset_into_dir(
    asset: AssetVc,
    output_dir: FileSystemPathVc,
) -> Result<CompletionVc> {
    let dir = &*output_dir.await?;
    Ok(if asset.path().await?.is_inside(dir) {
        emit_asset(asset)
    } else {
        CompletionVc::new()
    })
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

async fn warn_on_unsupported_modules(
    request: RequestVc,
    origin_path: FileSystemPathVc,
) -> Result<()> {
    if let Request::Module {
        module,
        path,
        query: _,
    } = &*request.await?
    {
        // Warn if the package is known not to be supported by Turbopack at the moment.
        if UNSUPPORTED_PACKAGES.contains(module) {
            UnsupportedModuleIssue {
                context: origin_path,
                package: module.into(),
                package_path: None,
            }
            .cell()
            .as_issue()
            .emit();
        }

        if let Pattern::Constant(path) = path {
            if UNSUPPORTED_PACKAGE_PATHS.contains(&(module.to_string(), path.to_owned())) {
                UnsupportedModuleIssue {
                    context: origin_path,
                    package: module.into(),
                    package_path: Some(path.to_owned()),
                }
                .cell()
                .as_issue()
                .emit();
            }
        }
    }

    Ok(())
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_css::register();
    turbopack_ecmascript::register();
    turbopack_env::register();
    turbopack_json::register();
    turbopack_static::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
