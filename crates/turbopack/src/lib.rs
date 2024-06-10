#![feature(box_patterns)]
#![feature(trivial_bounds)]
#![feature(min_specialization)]
#![feature(map_try_insert)]
#![feature(option_get_or_insert_default)]
#![feature(hash_set_entry)]
#![recursion_limit = "256"]
#![feature(arbitrary_self_types)]

pub mod evaluate_context;
mod graph;
pub mod module_options;
pub mod rebase;
pub mod transition;
pub(crate) mod unsupported_sass;

use std::{
    collections::{HashMap, HashSet},
    mem::swap,
};

use anyhow::{bail, Result};
use css::{CssModuleAsset, ModuleCssAsset};
use ecmascript::{
    chunk::EcmascriptChunkPlaceable,
    references::{follow_reexports, FollowExportsResult},
    side_effect_optimization::facade::module::EcmascriptModuleFacadeModule,
    EcmascriptModuleAsset, EcmascriptModuleAssetType, TreeShakingMode,
};
use graph::{aggregate, AggregatedGraph, AggregatedGraphNodeContent};
use module_options::{ModuleOptions, ModuleOptionsContext, ModuleRuleEffect, ModuleType};
use tracing::Instrument;
use turbo_tasks::{Completion, RcStr, Value, ValueToString, Vc};
use turbo_tasks_fs::{glob::Glob, FileSystemPath};
pub use turbopack_core::condition;
use turbopack_core::{
    asset::Asset,
    compile_time_info::CompileTimeInfo,
    context::{AssetContext, ProcessResult},
    ident::AssetIdent,
    issue::{Issue, IssueExt, IssueStage, OptionStyledString, StyledString},
    module::Module,
    output::OutputAsset,
    raw_module::RawModule,
    reference_type::{
        CssReferenceSubType, EcmaScriptModulesReferenceSubType, ImportWithType, InnerAssets,
        ReferenceType,
    },
    resolve::{
        options::ResolveOptions, origin::PlainResolveOrigin, parse::Request, resolve, ExternalType,
        ModulePart, ModuleResolveResult, ModuleResolveResultItem, ResolveResult,
    },
    source::Source,
};
pub use turbopack_css as css;
pub use turbopack_ecmascript as ecmascript;
use turbopack_ecmascript::references::external_module::{CachedExternalModule, CachedExternalType};
use turbopack_json::JsonModuleAsset;
use turbopack_mdx::MdxModuleAsset;
pub use turbopack_resolve::{resolve::resolve_options, resolve_options_context};
use turbopack_resolve::{resolve_options_context::ResolveOptionsContext, typescript::type_resolve};
use turbopack_static::StaticModuleAsset;
use turbopack_wasm::{module_asset::WebAssemblyModuleAsset, source::WebAssemblySource};

use self::{
    module_options::CustomModuleType,
    transition::{Transition, TransitionsByName},
};

#[turbo_tasks::value]
struct ModuleIssue {
    ident: Vc<AssetIdent>,
    title: Vc<StyledString>,
    description: Vc<StyledString>,
}

#[turbo_tasks::value_impl]
impl Issue for ModuleIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::ProcessModule.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.ident.path()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}

#[turbo_tasks::function]
async fn apply_module_type(
    source: Vc<Box<dyn Source>>,
    module_asset_context: Vc<ModuleAssetContext>,
    module_type: Vc<ModuleType>,
    reference_type: Value<ReferenceType>,
    part: Option<Vc<ModulePart>>,
    inner_assets: Option<Vc<InnerAssets>>,
    runtime_code: bool,
) -> Result<Vc<ProcessResult>> {
    let module_type = &*module_type.await?;
    Ok(ProcessResult::Module(match module_type {
        ModuleType::Ecmascript {
            transforms,
            options,
        }
        | ModuleType::Typescript {
            transforms,
            tsx: _,
            analyze_types: _,
            options,
        }
        | ModuleType::TypescriptDeclaration {
            transforms,
            options,
        } => {
            let context_for_module = match module_type {
                ModuleType::Typescript { analyze_types, .. } if *analyze_types => {
                    module_asset_context.with_types_resolving_enabled()
                }
                ModuleType::TypescriptDeclaration { .. } => {
                    module_asset_context.with_types_resolving_enabled()
                }
                _ => module_asset_context,
            };
            let mut builder = EcmascriptModuleAsset::builder(
                source,
                Vc::upcast(context_for_module),
                *transforms,
                *options,
                module_asset_context.compile_time_info(),
            );
            match module_type {
                ModuleType::Ecmascript { .. } => {
                    builder = builder.with_type(EcmascriptModuleAssetType::Ecmascript)
                }
                ModuleType::Typescript {
                    tsx, analyze_types, ..
                } => {
                    builder = builder.with_type(EcmascriptModuleAssetType::Typescript {
                        tsx: *tsx,
                        analyze_types: *analyze_types,
                    })
                }
                ModuleType::TypescriptDeclaration { .. } => {
                    builder = builder.with_type(EcmascriptModuleAssetType::TypescriptDeclaration)
                }
                _ => unreachable!(),
            }

            if let Some(inner_assets) = inner_assets {
                builder = builder.with_inner_assets(inner_assets);
            }

            if runtime_code {
                Vc::upcast(builder.build())
            } else {
                let options = options.await?;
                match options.tree_shaking_mode {
                    Some(TreeShakingMode::ModuleFragments) => {
                        let side_effect_free_packages =
                            module_asset_context.side_effect_free_packages();

                        let module = builder.clone().build();

                        Vc::upcast(
                            if let Some(part) = part {
                                if let ModulePart::Evaluation = *part.await? {
                                    if *module
                                        .is_marked_as_side_effect_free(side_effect_free_packages)
                                        .await?
                                    {
                                        return Ok(ProcessResult::Ignore.cell());
                                    }
                                }

                                builder.build_part(part)
                            } else {
                                builder.build_part(ModulePart::facade())
                            }
                            .await?,
                        )
                    }
                    Some(TreeShakingMode::ReexportsOnly) => {
                        let side_effect_free_packages =
                            module_asset_context.side_effect_free_packages();

                        let module = builder.build();
                        if let Some(part) = part {
                            match *part.await? {
                                ModulePart::Evaluation => {
                                    if *module
                                        .is_marked_as_side_effect_free(side_effect_free_packages)
                                        .await?
                                    {
                                        return Ok(ProcessResult::Ignore.cell());
                                    }
                                    if *module.get_exports().needs_facade().await? {
                                        Vc::upcast(EcmascriptModuleFacadeModule::new(
                                            Vc::upcast(module),
                                            part,
                                        ))
                                    } else {
                                        Vc::upcast(module)
                                    }
                                }
                                ModulePart::Export(_) => {
                                    if *module.get_exports().needs_facade().await? {
                                        apply_reexport_tree_shaking(
                                            Vc::upcast(EcmascriptModuleFacadeModule::new(
                                                Vc::upcast(module),
                                                ModulePart::exports(),
                                            )),
                                            part,
                                            side_effect_free_packages,
                                        )
                                    } else {
                                        apply_reexport_tree_shaking(
                                            Vc::upcast(module),
                                            part,
                                            side_effect_free_packages,
                                        )
                                    }
                                }
                                _ => bail!(
                                    "Invalid module part for reexports only tree shaking mode"
                                ),
                            }
                        } else if *module.get_exports().needs_facade().await? {
                            Vc::upcast(EcmascriptModuleFacadeModule::new(
                                Vc::upcast(module),
                                ModulePart::facade(),
                            ))
                        } else {
                            Vc::upcast(module)
                        }
                    }
                    None => Vc::upcast(builder.build()),
                }
            }
        }
        ModuleType::Json => Vc::upcast(JsonModuleAsset::new(source)),
        ModuleType::Raw => Vc::upcast(RawModule::new(source)),
        ModuleType::CssGlobal => {
            return Ok(module_asset_context.process(
                source,
                Value::new(ReferenceType::Css(CssReferenceSubType::Internal)),
            ))
        }
        ModuleType::CssModule => Vc::upcast(ModuleCssAsset::new(
            source,
            Vc::upcast(module_asset_context),
        )),
        ModuleType::Css { ty, use_swc_css } => Vc::upcast(CssModuleAsset::new(
            source,
            Vc::upcast(module_asset_context),
            *ty,
            *use_swc_css,
            if let ReferenceType::Css(CssReferenceSubType::AtImport(import)) =
                reference_type.into_value()
            {
                import
            } else {
                None
            },
        )),
        ModuleType::Static => Vc::upcast(StaticModuleAsset::new(
            source,
            Vc::upcast(module_asset_context),
        )),
        ModuleType::Mdx {
            transforms,
            options,
        } => Vc::upcast(MdxModuleAsset::new(
            source,
            Vc::upcast(module_asset_context),
            *transforms,
            *options,
        )),
        ModuleType::WebAssembly { source_ty } => Vc::upcast(WebAssemblyModuleAsset::new(
            WebAssemblySource::new(source, *source_ty),
            Vc::upcast(module_asset_context),
        )),
        ModuleType::Custom(custom) => custom.create_module(source, module_asset_context, part),
    })
    .cell())
}

#[turbo_tasks::function]
async fn apply_reexport_tree_shaking(
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    part: Vc<ModulePart>,
    side_effect_free_packages: Vc<Glob>,
) -> Result<Vc<Box<dyn Module>>> {
    if let ModulePart::Export(export) = *part.await? {
        let export = export.await?;
        let FollowExportsResult {
            module: final_module,
            export_name: new_export,
            ..
        } = &*follow_reexports(module, export.clone_value(), side_effect_free_packages).await?;
        let module = if let Some(new_export) = new_export {
            if *new_export == *export {
                Vc::upcast(*final_module)
            } else {
                Vc::upcast(EcmascriptModuleFacadeModule::new(
                    *final_module,
                    ModulePart::renamed_export(new_export.clone(), export.clone_value()),
                ))
            }
        } else {
            Vc::upcast(EcmascriptModuleFacadeModule::new(
                *final_module,
                ModulePart::renamed_namespace(export.clone_value()),
            ))
        };
        return Ok(module);
    }
    Ok(Vc::upcast(module))
}

#[turbo_tasks::value]
#[derive(Debug)]
pub struct ModuleAssetContext {
    pub transitions: Vc<TransitionsByName>,
    pub compile_time_info: Vc<CompileTimeInfo>,
    pub module_options_context: Vc<ModuleOptionsContext>,
    pub resolve_options_context: Vc<ResolveOptionsContext>,
    pub layer: Vc<RcStr>,
    transition: Option<Vc<Box<dyn Transition>>>,
}

#[turbo_tasks::value_impl]
impl ModuleAssetContext {
    #[turbo_tasks::function]
    pub fn new(
        transitions: Vc<TransitionsByName>,
        compile_time_info: Vc<CompileTimeInfo>,
        module_options_context: Vc<ModuleOptionsContext>,
        resolve_options_context: Vc<ResolveOptionsContext>,
        layer: Vc<RcStr>,
    ) -> Vc<Self> {
        Self::cell(ModuleAssetContext {
            transitions,
            compile_time_info,
            module_options_context,
            resolve_options_context,
            transition: None,
            layer,
        })
    }

    #[turbo_tasks::function]
    pub fn new_transition(
        transitions: Vc<TransitionsByName>,
        compile_time_info: Vc<CompileTimeInfo>,
        module_options_context: Vc<ModuleOptionsContext>,
        resolve_options_context: Vc<ResolveOptionsContext>,
        layer: Vc<RcStr>,
        transition: Vc<Box<dyn Transition>>,
    ) -> Vc<Self> {
        Self::cell(ModuleAssetContext {
            transitions,
            compile_time_info,
            module_options_context,
            resolve_options_context,
            layer,
            transition: Some(transition),
        })
    }

    #[turbo_tasks::function]
    pub async fn module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(self.await?.module_options_context)
    }

    #[turbo_tasks::function]
    pub async fn resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(self.await?.resolve_options_context)
    }

    #[turbo_tasks::function]
    pub async fn is_types_resolving_enabled(self: Vc<Self>) -> Result<Vc<bool>> {
        let resolve_options_context = self.await?.resolve_options_context.await?;
        Ok(Vc::cell(
            resolve_options_context.enable_types && resolve_options_context.enable_typescript,
        ))
    }

    #[turbo_tasks::function]
    pub async fn with_types_resolving_enabled(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        if *self.is_types_resolving_enabled().await? {
            return Ok(self);
        }
        let this = self.await?;
        let resolve_options_context = this
            .resolve_options_context
            .with_types_enabled()
            .resolve()
            .await?;

        Ok(ModuleAssetContext::new(
            this.transitions,
            this.compile_time_info,
            this.module_options_context,
            resolve_options_context,
            this.layer,
        ))
    }

    #[turbo_tasks::function]
    fn process_default(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        reference_type: Value<ReferenceType>,
    ) -> Vc<ProcessResult> {
        process_default(self, source, reference_type, Vec::new())
    }
}

#[turbo_tasks::function]
async fn process_default(
    module_asset_context: Vc<ModuleAssetContext>,
    source: Vc<Box<dyn Source>>,
    reference_type: Value<ReferenceType>,
    processed_rules: Vec<usize>,
) -> Result<Vc<ProcessResult>> {
    let span = tracing::info_span!(
        "process module",
        name = source.ident().to_string().await?.to_string(),
        reference_type = display(&*reference_type)
    );
    process_default_internal(
        module_asset_context,
        source,
        reference_type,
        processed_rules,
    )
    .instrument(span)
    .await
}

async fn process_default_internal(
    module_asset_context: Vc<ModuleAssetContext>,
    source: Vc<Box<dyn Source>>,
    reference_type: Value<ReferenceType>,
    processed_rules: Vec<usize>,
) -> Result<Vc<ProcessResult>> {
    let ident = source.ident().resolve().await?;
    let path_ref = ident.path().await?;
    let options = ModuleOptions::new(
        ident.path().parent(),
        module_asset_context.module_options_context(),
        module_asset_context.resolve_options_context(),
    );

    let reference_type = reference_type.into_value();
    let part: Option<Vc<ModulePart>> = match &reference_type {
        ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::ImportPart(part)) => {
            Some(*part)
        }
        _ => None,
    };
    let inner_assets = match &reference_type {
        ReferenceType::Internal(inner_assets) => Some(*inner_assets),
        _ => None,
    };

    let mut has_type_attribute = false;

    let mut current_source = source;
    let mut current_module_type = match &reference_type {
        ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::ImportWithType(ty)) => {
            has_type_attribute = true;

            match ty {
                ImportWithType::Json => Some(ModuleType::Json),
            }
        }
        _ => None,
    };

    for (i, rule) in options.await?.rules.iter().enumerate() {
        if has_type_attribute && current_module_type.is_some() {
            continue;
        }
        if processed_rules.contains(&i) {
            continue;
        }
        if rule.matches(source, &path_ref, &reference_type).await? {
            for effect in rule.effects() {
                match effect {
                    ModuleRuleEffect::SourceTransforms(transforms) => {
                        current_source = transforms.transform(current_source);
                        if current_source.ident().resolve().await? != ident {
                            // The ident has been changed, so we need to apply new rules.
                            let mut processed_rules = processed_rules.clone();
                            processed_rules.push(i);
                            return Ok(process_default(
                                module_asset_context,
                                current_source,
                                Value::new(reference_type),
                                processed_rules,
                            ));
                        }
                    }
                    ModuleRuleEffect::ModuleType(module) => {
                        current_module_type = Some(*module);
                    }
                    ModuleRuleEffect::ExtendEcmascriptTransforms { prepend, append } => {
                        current_module_type = match current_module_type {
                            Some(ModuleType::Ecmascript {
                                transforms,
                                options,
                            }) => Some(ModuleType::Ecmascript {
                                transforms: prepend.extend(transforms).extend(*append),
                                options,
                            }),
                            Some(ModuleType::Typescript {
                                transforms,
                                tsx,
                                analyze_types,
                                options,
                            }) => Some(ModuleType::Typescript {
                                transforms: prepend.extend(transforms).extend(*append),
                                tsx,
                                analyze_types,
                                options,
                            }),
                            Some(ModuleType::Mdx {
                                transforms,
                                options,
                            }) => Some(ModuleType::Mdx {
                                transforms: prepend.extend(transforms).extend(*append),
                                options,
                            }),
                            Some(module_type) => {
                                ModuleIssue {
                                    ident,
                                    title: StyledString::Text("Invalid module type".into()).cell(),
                                    description: StyledString::Text(
                                        "The module type must be Ecmascript or Typescript to add \
                                         Ecmascript transforms"
                                            .into(),
                                    )
                                    .cell(),
                                }
                                .cell()
                                .emit();
                                Some(module_type)
                            }
                            None => {
                                ModuleIssue {
                                    ident,
                                    title: StyledString::Text("Missing module type".into()).cell(),
                                    description: StyledString::Text(
                                        "The module type effect must be applied before adding \
                                         Ecmascript transforms"
                                            .into(),
                                    )
                                    .cell(),
                                }
                                .cell()
                                .emit();
                                None
                            }
                        };
                    }
                }
            }
        }
    }

    let module_type = match current_module_type {
        Some(module_type) => module_type,
        None => {
            ModuleIssue {
                ident,
                title: StyledString::Text("Unknown module type".into()).cell(),
                description: StyledString::Text(
                    r"This module doesn't have an associated type. Use a known file extension, or register a loader for it.

Read more: https://nextjs.org/docs/app/api-reference/next-config-js/turbo#webpack-loaders".into(),
                )
                .cell(),
            }
            .cell()
            .emit();

            return Ok(ProcessResult::Ignore.cell());
        }
    }.cell();

    Ok(apply_module_type(
        current_source,
        module_asset_context,
        module_type,
        Value::new(reference_type.clone()),
        part,
        inner_assets,
        matches!(reference_type, ReferenceType::Runtime),
    ))
}

#[turbo_tasks::value_impl]
impl AssetContext for ModuleAssetContext {
    #[turbo_tasks::function]
    fn compile_time_info(&self) -> Vc<CompileTimeInfo> {
        self.compile_time_info
    }

    #[turbo_tasks::function]
    fn layer(&self) -> Vc<RcStr> {
        self.layer
    }

    #[turbo_tasks::function]
    async fn resolve_options(
        self: Vc<Self>,
        origin_path: Vc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
    ) -> Result<Vc<ResolveOptions>> {
        let this = self.await?;
        let module_asset_context = if let Some(transition) = this.transition {
            transition.process_context(self)
        } else {
            self
        };
        // TODO move `apply_commonjs/esm_resolve_options` etc. to here
        Ok(resolve_options(
            origin_path.parent().resolve().await?,
            module_asset_context.await?.resolve_options_context,
        ))
    }

    #[turbo_tasks::function]
    async fn resolve_asset(
        self: Vc<Self>,
        origin_path: Vc<FileSystemPath>,
        request: Vc<Request>,
        resolve_options: Vc<ResolveOptions>,
        reference_type: Value<ReferenceType>,
    ) -> Result<Vc<ModuleResolveResult>> {
        let context_path = origin_path.parent().resolve().await?;

        let result = resolve(
            context_path,
            reference_type.clone(),
            request,
            resolve_options,
        );
        let mut result = self.process_resolve_result(result.resolve().await?, reference_type);

        if *self.is_types_resolving_enabled().await? {
            let types_result = type_resolve(
                Vc::upcast(PlainResolveOrigin::new(Vc::upcast(self), origin_path)),
                request,
            );

            result = ModuleResolveResult::alternatives(vec![result, types_result]);
        }

        Ok(result)
    }

    #[turbo_tasks::function]
    async fn process_resolve_result(
        self: Vc<Self>,
        result: Vc<ResolveResult>,
        reference_type: Value<ReferenceType>,
    ) -> Result<Vc<ModuleResolveResult>> {
        let this = self.await?;
        let transition = this.transition;

        let result = result
            .await?
            .map_module(|source| {
                let reference_type = reference_type.clone();
                async move {
                    let process_result = if let Some(transition) = transition {
                        transition.process(source, self, reference_type)
                    } else {
                        self.process_default(source, reference_type)
                    };
                    Ok(match *process_result.await? {
                        ProcessResult::Module(m) => ModuleResolveResultItem::Module(Vc::upcast(m)),
                        ProcessResult::Ignore => ModuleResolveResultItem::Ignore,
                    })
                }
            })
            .await?;

        let result =
            replace_externals(result, this.module_options_context.await?.import_externals).await?;

        Ok(result.cell())
    }

    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        asset: Vc<Box<dyn Source>>,
        reference_type: Value<ReferenceType>,
    ) -> Result<Vc<ProcessResult>> {
        let this = self.await?;
        if let Some(transition) = this.transition {
            Ok(transition.process(asset, self, reference_type))
        } else {
            Ok(self.process_default(asset, reference_type))
        }
    }

    #[turbo_tasks::function]
    async fn with_transition(&self, transition: RcStr) -> Result<Vc<Box<dyn AssetContext>>> {
        Ok(
            if let Some(transition) = self.transitions.await?.get(&transition) {
                Vc::upcast(ModuleAssetContext::new_transition(
                    self.transitions,
                    self.compile_time_info,
                    self.module_options_context,
                    self.resolve_options_context,
                    self.layer,
                    *transition,
                ))
            } else {
                // TODO report issue
                Vc::upcast(ModuleAssetContext::new(
                    self.transitions,
                    self.compile_time_info,
                    self.module_options_context,
                    self.resolve_options_context,
                    self.layer,
                ))
            },
        )
    }

    #[turbo_tasks::function]
    async fn side_effect_free_packages(self: Vc<Self>) -> Result<Vc<Glob>> {
        let pkgs = &*self
            .await?
            .module_options_context
            .await?
            .side_effect_free_packages;

        let mut globs = Vec::with_capacity(pkgs.len());

        for pkg in pkgs {
            globs.push(Glob::new(format!("**/node_modules/{{{}}}/**", pkg).into()));
        }

        Ok(Glob::alternatives(globs))
    }
}

#[turbo_tasks::function]
pub async fn emit_with_completion(
    asset: Vc<Box<dyn OutputAsset>>,
    output_dir: Vc<FileSystemPath>,
) -> Vc<Completion> {
    emit_assets_aggregated(asset, output_dir)
}

#[turbo_tasks::function]
async fn emit_assets_aggregated(
    asset: Vc<Box<dyn OutputAsset>>,
    output_dir: Vc<FileSystemPath>,
) -> Vc<Completion> {
    let aggregated = aggregate(asset);
    emit_aggregated_assets(aggregated, output_dir)
}

#[turbo_tasks::function]
async fn emit_aggregated_assets(
    aggregated: Vc<AggregatedGraph>,
    output_dir: Vc<FileSystemPath>,
) -> Result<Vc<Completion>> {
    Ok(match &*aggregated.content().await? {
        AggregatedGraphNodeContent::Asset(asset) => emit_asset_into_dir(*asset, output_dir),
        AggregatedGraphNodeContent::Children(children) => {
            for aggregated in children {
                emit_aggregated_assets(*aggregated, output_dir).await?;
            }
            Completion::new()
        }
    })
}

#[turbo_tasks::function]
pub async fn emit_asset(asset: Vc<Box<dyn OutputAsset>>) -> Vc<Completion> {
    asset.content().write(asset.ident().path())
}

#[turbo_tasks::function]
pub async fn emit_asset_into_dir(
    asset: Vc<Box<dyn OutputAsset>>,
    output_dir: Vc<FileSystemPath>,
) -> Result<Vc<Completion>> {
    let dir = &*output_dir.await?;
    Ok(if asset.ident().path().await?.is_inside_ref(dir) {
        emit_asset(asset)
    } else {
        Completion::new()
    })
}

type OutputAssetSet = HashSet<Vc<Box<dyn OutputAsset>>>;

#[turbo_tasks::value(shared)]
struct ReferencesList {
    referenced_by: HashMap<Vc<Box<dyn OutputAsset>>, OutputAssetSet>,
}

#[turbo_tasks::function]
async fn compute_back_references(aggregated: Vc<AggregatedGraph>) -> Result<Vc<ReferencesList>> {
    Ok(match &*aggregated.content().await? {
        &AggregatedGraphNodeContent::Asset(asset) => {
            let mut referenced_by = HashMap::new();
            for reference in asset.references().await?.iter() {
                referenced_by.insert(*reference, [asset].into_iter().collect());
            }
            ReferencesList { referenced_by }.into()
        }
        AggregatedGraphNodeContent::Children(children) => {
            let mut referenced_by = HashMap::<Vc<Box<dyn OutputAsset>>, OutputAssetSet>::new();
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
async fn top_references(list: Vc<ReferencesList>) -> Result<Vc<ReferencesList>> {
    let list = list.await?;
    const N: usize = 5;
    let mut top = Vec::<(
        &Vc<Box<dyn OutputAsset>>,
        &HashSet<Vc<Box<dyn OutputAsset>>>,
    )>::new();
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

/// Replaces the externals in the result with `ExternalModuleAsset` instances.
pub async fn replace_externals(
    mut result: ModuleResolveResult,
    import_externals: bool,
) -> Result<ModuleResolveResult> {
    for item in result.primary.values_mut() {
        let ModuleResolveResultItem::External(request, ty) = item else {
            continue;
        };

        let external_type = match ty {
            ExternalType::CommonJs => CachedExternalType::CommonJs,
            ExternalType::EcmaScriptModule => {
                if import_externals {
                    CachedExternalType::EcmaScriptViaImport
                } else {
                    CachedExternalType::EcmaScriptViaRequire
                }
            }
            ExternalType::Url => {
                // we don't want to wrap url externals.
                continue;
            }
        };

        let module = CachedExternalModule::new(request.clone(), external_type)
            .resolve()
            .await?;

        *item = ModuleResolveResultItem::Module(Vc::upcast(module));
    }

    Ok(result)
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
    turbopack_resolve::register();
    turbopack_static::register();
    turbopack_wasm::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
