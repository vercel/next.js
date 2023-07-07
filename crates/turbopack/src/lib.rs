#![feature(box_patterns)]
#![feature(trivial_bounds)]
#![feature(min_specialization)]
#![feature(map_try_insert)]
#![feature(option_get_or_insert_default)]
#![feature(hash_set_entry)]
#![recursion_limit = "256"]

use std::{
    collections::{HashMap, HashSet},
    mem::swap,
};

use anyhow::Result;
use css::{CssModuleAssetVc, GlobalCssAssetVc, ModuleCssAssetVc};
use ecmascript::{
    typescript::resolve::TypescriptTypesAssetReferenceVc, EcmascriptModuleAssetType,
    EcmascriptModuleAssetVc,
};
use graph::{aggregate, AggregatedGraphNodeContent, AggregatedGraphVc};
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
    asset::{Asset, AssetVc},
    compile_time_info::CompileTimeInfoVc,
    context::{AssetContext, AssetContextVc},
    ident::AssetIdentVc,
    issue::{Issue, IssueVc},
    reference::all_referenced_assets,
    reference_type::{EcmaScriptModulesReferenceSubType, InnerAssetsVc, ReferenceType},
    resolve::{
        options::ResolveOptionsVc, origin::PlainResolveOriginVc, parse::RequestVc, resolve,
        ModulePartVc, ResolveResultVc,
    },
};

use crate::transition::Transition;

pub mod condition;
pub mod evaluate_context;
mod graph;
pub mod module_options;
pub mod rebase;
pub mod resolve;
pub mod resolve_options_context;
pub mod transition;
pub(crate) mod unsupported_sass;

pub use turbopack_css as css;
pub use turbopack_ecmascript as ecmascript;
use turbopack_json::JsonModuleAssetVc;
use turbopack_mdx::MdxModuleAssetVc;
use turbopack_static::StaticModuleAssetVc;

use self::{
    module_options::CustomModuleType,
    resolve_options_context::ResolveOptionsContextVc,
    transition::{TransitionVc, TransitionsByNameVc},
};

#[turbo_tasks::value]
struct ModuleIssue {
    ident: AssetIdentVc,
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
        self.ident.path()
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
async fn apply_module_type(
    source: AssetVc,
    context: ModuleAssetContextVc,
    module_type: ModuleTypeVc,
    part: Option<ModulePartVc>,
    inner_assets: Option<InnerAssetsVc>,
) -> Result<AssetVc> {
    let module_type = &*module_type.await?;
    Ok(match module_type {
        ModuleType::Ecmascript {
            transforms,
            options,
        }
        | ModuleType::Typescript {
            transforms,
            options,
        }
        | ModuleType::TypescriptWithTypes {
            transforms,
            options,
        }
        | ModuleType::TypescriptDeclaration {
            transforms,
            options,
        } => {
            let context_for_module = match module_type {
                ModuleType::TypescriptWithTypes { .. }
                | ModuleType::TypescriptDeclaration { .. } => {
                    context.with_types_resolving_enabled()
                }
                _ => context,
            };
            let mut builder = EcmascriptModuleAssetVc::builder(
                source,
                context_for_module.into(),
                *transforms,
                *options,
                context.compile_time_info(),
            );
            match module_type {
                ModuleType::Ecmascript { .. } => {
                    builder = builder.with_type(EcmascriptModuleAssetType::Ecmascript)
                }
                ModuleType::Typescript { .. } => {
                    builder = builder.with_type(EcmascriptModuleAssetType::Typescript)
                }
                ModuleType::TypescriptWithTypes { .. } => {
                    builder = builder.with_type(EcmascriptModuleAssetType::TypescriptWithTypes)
                }
                ModuleType::TypescriptDeclaration { .. } => {
                    builder = builder.with_type(EcmascriptModuleAssetType::TypescriptDeclaration)
                }
                _ => unreachable!(),
            }

            if let Some(inner_assets) = inner_assets {
                builder = builder.with_inner_assets(inner_assets);
            }

            if options.split_into_parts {
                if let Some(part) = part {
                    builder = builder.with_part(part);
                }
            }

            builder.build()
        }
        ModuleType::Json => JsonModuleAssetVc::new(source).into(),
        ModuleType::Raw => source,
        ModuleType::CssGlobal => GlobalCssAssetVc::new(source, context.into()).into(),
        ModuleType::CssModule => ModuleCssAssetVc::new(source, context.into()).into(),
        ModuleType::Css { ty, transforms } => {
            CssModuleAssetVc::new(source, context.into(), *transforms, *ty).into()
        }
        ModuleType::Static => StaticModuleAssetVc::new(source, context.into()).into(),
        ModuleType::Mdx {
            transforms,
            options,
        } => MdxModuleAssetVc::new(source, context.into(), *transforms, *options).into(),
        ModuleType::Custom(custom) => custom.create_module(source, context, part),
    })
}

#[turbo_tasks::value]
#[derive(Debug)]
pub struct ModuleAssetContext {
    pub transitions: TransitionsByNameVc,
    pub compile_time_info: CompileTimeInfoVc,
    pub module_options_context: ModuleOptionsContextVc,
    pub resolve_options_context: ResolveOptionsContextVc,
    transition: Option<TransitionVc>,
}

#[turbo_tasks::value_impl]
impl ModuleAssetContextVc {
    #[turbo_tasks::function]
    pub fn new(
        transitions: TransitionsByNameVc,
        compile_time_info: CompileTimeInfoVc,
        module_options_context: ModuleOptionsContextVc,
        resolve_options_context: ResolveOptionsContextVc,
    ) -> Self {
        Self::cell(ModuleAssetContext {
            transitions,
            compile_time_info,
            module_options_context,
            resolve_options_context,
            transition: None,
        })
    }

    #[turbo_tasks::function]
    pub fn new_transition(
        transitions: TransitionsByNameVc,
        compile_time_info: CompileTimeInfoVc,
        module_options_context: ModuleOptionsContextVc,
        resolve_options_context: ResolveOptionsContextVc,
        transition: TransitionVc,
    ) -> Self {
        Self::cell(ModuleAssetContext {
            transitions,
            compile_time_info,
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
    pub async fn is_types_resolving_enabled(self) -> Result<BoolVc> {
        let context = self.await?.resolve_options_context.await?;
        Ok(BoolVc::cell(
            context.enable_types && context.enable_typescript,
        ))
    }

    #[turbo_tasks::function]
    pub async fn with_types_resolving_enabled(self) -> Result<ModuleAssetContextVc> {
        if *self.is_types_resolving_enabled().await? {
            return Ok(self);
        }
        let this = self.await?;
        let resolve_options_context = this
            .resolve_options_context
            .with_types_enabled()
            .resolve()
            .await?;
        Ok(ModuleAssetContextVc::new(
            this.transitions,
            this.compile_time_info,
            this.module_options_context,
            resolve_options_context,
        ))
    }

    #[turbo_tasks::function]
    fn process_default(
        self_vc: ModuleAssetContextVc,
        source: AssetVc,
        reference_type: Value<ReferenceType>,
    ) -> AssetVc {
        process_default(self_vc, source, reference_type, Vec::new())
    }
}

#[turbo_tasks::function]
async fn process_default(
    context: ModuleAssetContextVc,
    source: AssetVc,
    reference_type: Value<ReferenceType>,
    processed_rules: Vec<usize>,
) -> Result<AssetVc> {
    let ident = source.ident().resolve().await?;
    let options = ModuleOptionsVc::new(ident.path().parent(), context.module_options_context());

    let reference_type = reference_type.into_value();
    let part: Option<ModulePartVc> = match &reference_type {
        ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::ImportPart(part)) => {
            Some(*part)
        }
        _ => None,
    };
    let inner_assets = match &reference_type {
        ReferenceType::Internal(inner_assets) => Some(*inner_assets),
        _ => None,
    };
    let mut current_source = source;
    let mut current_module_type = None;
    for (i, rule) in options.await?.rules.iter().enumerate() {
        if processed_rules.contains(&i) {
            continue;
        }
        if rule
            .matches(source, &*ident.path().await?, &reference_type)
            .await?
        {
            for effect in rule.effects() {
                match effect {
                    ModuleRuleEffect::SourceTransforms(transforms) => {
                        current_source = transforms.transform(current_source);
                        if current_source.ident().resolve().await? != ident {
                            // The ident has been changed, so we need to apply new rules.
                            let mut processed_rules = processed_rules.clone();
                            processed_rules.push(i);
                            return Ok(process_default(
                                context,
                                current_source,
                                Value::new(reference_type),
                                processed_rules,
                            ));
                        }
                    }
                    ModuleRuleEffect::ModuleType(module) => {
                        current_module_type = Some(*module);
                    }
                    ModuleRuleEffect::AddEcmascriptTransforms(additional_transforms) => {
                        current_module_type = match current_module_type {
                            Some(ModuleType::Ecmascript {
                                transforms,
                                options,
                            }) => Some(ModuleType::Ecmascript {
                                transforms: transforms.extend(*additional_transforms),
                                options,
                            }),
                            Some(ModuleType::Typescript {
                                transforms,
                                options,
                            }) => Some(ModuleType::Typescript {
                                transforms: transforms.extend(*additional_transforms),
                                options,
                            }),
                            Some(ModuleType::TypescriptWithTypes {
                                transforms,
                                options,
                            }) => Some(ModuleType::TypescriptWithTypes {
                                transforms: transforms.extend(*additional_transforms),
                                options,
                            }),
                            Some(module_type) => {
                                ModuleIssue {
                                    ident,
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
                                    ident,
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
                }
            }
        }
    }

    let module_type = current_module_type.unwrap_or(ModuleType::Raw).cell();

    Ok(apply_module_type(
        current_source,
        context,
        module_type,
        part,
        inner_assets,
    ))
}

#[turbo_tasks::value_impl]
impl AssetContext for ModuleAssetContext {
    #[turbo_tasks::function]
    fn compile_time_info(&self) -> CompileTimeInfoVc {
        self.compile_time_info
    }

    #[turbo_tasks::function]
    async fn resolve_options(
        self_vc: ModuleAssetContextVc,
        origin_path: FileSystemPathVc,
        _reference_type: Value<ReferenceType>,
    ) -> Result<ResolveOptionsVc> {
        let this = self_vc.await?;
        let context = if let Some(transition) = this.transition {
            transition.process_context(self_vc)
        } else {
            self_vc
        };
        // TODO move `apply_commonjs/esm_resolve_options` etc. to here
        Ok(resolve_options(
            origin_path.parent().resolve().await?,
            context.await?.resolve_options_context,
        ))
    }

    #[turbo_tasks::function]
    async fn resolve_asset(
        self_vc: ModuleAssetContextVc,
        origin_path: FileSystemPathVc,
        request: RequestVc,
        resolve_options: ResolveOptionsVc,
        reference_type: Value<ReferenceType>,
    ) -> Result<ResolveResultVc> {
        let context_path = origin_path.parent().resolve().await?;

        let result = resolve(context_path, request, resolve_options);
        let mut result = self_vc.process_resolve_result(result, reference_type);

        if *self_vc.is_types_resolving_enabled().await? {
            let types_reference = TypescriptTypesAssetReferenceVc::new(
                PlainResolveOriginVc::new(self_vc.into(), origin_path).into(),
                request,
            );

            result = result.with_reference(types_reference.into());
        }

        Ok(result)
    }

    #[turbo_tasks::function]
    async fn process_resolve_result(
        self_vc: ModuleAssetContextVc,
        result: ResolveResultVc,
        reference_type: Value<ReferenceType>,
    ) -> Result<ResolveResultVc> {
        Ok(result
            .await?
            .map(
                |a| self_vc.process(a, reference_type.clone()).resolve(),
                |i| async move { Ok(i) },
            )
            .await?
            .into())
    }
    #[turbo_tasks::function]
    async fn process(
        self_vc: ModuleAssetContextVc,
        asset: AssetVc,
        reference_type: Value<ReferenceType>,
    ) -> Result<AssetVc> {
        let this = self_vc.await?;
        if let Some(transition) = this.transition {
            Ok(transition.process(asset, self_vc, reference_type))
        } else {
            Ok(self_vc.process_default(asset, reference_type))
        }
    }

    #[turbo_tasks::function]
    async fn with_transition(&self, transition: &str) -> Result<AssetContextVc> {
        Ok(
            if let Some(transition) = self.transitions.await?.get(transition) {
                ModuleAssetContextVc::new_transition(
                    self.transitions,
                    self.compile_time_info,
                    self.module_options_context,
                    self.resolve_options_context,
                    *transition,
                )
                .into()
            } else {
                // TODO report issue
                ModuleAssetContextVc::new(
                    self.transitions,
                    self.compile_time_info,
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
    asset.content().write(asset.ident().path())
}

#[turbo_tasks::function]
pub async fn emit_asset_into_dir(
    asset: AssetVc,
    output_dir: FileSystemPathVc,
) -> Result<CompletionVc> {
    let dir = &*output_dir.await?;
    Ok(if asset.ident().path().await?.is_inside(dir) {
        emit_asset(asset)
    } else {
        CompletionVc::new()
    })
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

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_css::register();
    turbopack_ecmascript::register();
    turbopack_node::register();
    turbopack_env::register();
    turbopack_mdx::register();
    turbopack_json::register();
    turbopack_static::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
