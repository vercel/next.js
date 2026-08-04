#![feature(trivial_bounds)]
#![feature(min_specialization)]
#![recursion_limit = "256"]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

pub mod evaluate_context;
pub mod global_module_ids;
pub mod module_options;
pub mod runtime_asset_context;
pub mod transition;

use anyhow::{Context as _, Result, bail};
use module_options::{
    ConfiguredModuleType, ModuleOptions, ModuleOptionsContext, ModuleRuleEffect, ModuleType,
};
pub use runtime_asset_context::get_runtime_asset_context;
#[cfg(not(feature = "sync"))]
use tracing::Instrument;
use tracing::field::Empty;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
pub use turbopack_core::condition;
use turbopack_core::{
    asset::Asset,
    chunk::SourceMapsType,
    compile_time_info::CompileTimeInfo,
    context::{AssetContext, ProcessResult},
    ident::{AssetIdent, Layer},
    issue::{IssueExt, IssueSource, module::ModuleIssue},
    module::{Module, ModuleSideEffects},
    node_addon_module::NodeAddonModule,
    output::{ExpandedOutputAssets, OutputAsset},
    raw_module::RawModule,
    reference_type::{
        CssReferenceSubType, EcmaScriptModulesReferenceSubType, InnerAssets, ReferenceType,
    },
    resolve::{
        ExternalTraced, ExternalType, ModulePart, ModuleResolveResult, ModuleResolveResultItem,
        ResolveResult, ResolveResultItem,
        options::{ConditionValue, ResolveOptions},
        origin::PlainResolveOrigin,
        parse::Request,
        resolve,
    },
    source::Source,
    source_transform::SourceTransforms,
};
use turbopack_css::{CssModule, EcmascriptCssModule};
use turbopack_ecmascript::{
    AnalyzeMode, EcmascriptInputTransforms, EcmascriptModuleAsset, EcmascriptModuleAssetType,
    EcmascriptOptions, TreeShakingMode,
    chunk::EcmascriptChunkPlaceable,
    references::{
        FollowExportsResult,
        external_module::{CachedExternalModule, CachedExternalTracingMode, CachedExternalType},
        follow_reexports,
    },
    rename::module::EcmascriptModuleRenameModule,
    side_effect_optimization::{
        facade::module::EcmascriptModuleFacadeModule, locals::module::EcmascriptModuleLocalsModule,
    },
    tree_shake::part::module::EcmascriptModulePartAsset,
};
use turbopack_node::transforms::webpack::{WebpackLoaderItem, WebpackLoaderItems, WebpackLoaders};
use turbopack_resolve::{
    resolve::resolve_options, resolve_options_context::ResolveOptionsContext,
    typescript::type_resolve,
};
use turbopack_static::{css::StaticUrlCssModule, ecma::StaticUrlJsModule};
use turbopack_wasm::{module_asset::WebAssemblyModuleAsset, source::WebAssemblySource};

use crate::{
    evaluate_context::node_evaluate_asset_context,
    module_options::{
        CssOptionsContext, CustomModuleType, EcmascriptOptionsContext, TypescriptTransformOptions,
        package_import_map_from_context, package_import_map_from_import_mapping,
    },
    transition::{Transition, TransitionOptions},
};

turbo_tasks::dual_fn! {
fn apply_module_type(
    source: ResolvedVc<Box<dyn Source>>,
    module_asset_context: Vc<ModuleAssetContext>,
    module_type: Vc<ModuleType>,
    reference_type: ReferenceType,
    inner_assets: Option<ResolvedVc<InnerAssets>>,
) -> Result<Vc<ProcessResult>> {
    let tree_shaking_mode = turbo_tasks::read!(module_asset_context
        .module_options_context())
        ?
        .tree_shaking_mode;
    let part = match &reference_type {
        ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::ImportPart(part)) => {
            Some(part)
        }
        _ => None,
    };
    let css_import_context = match reference_type {
        ReferenceType::Css(CssReferenceSubType::AtImport(import)) => import,
        _ => None,
    };
    let is_evaluation = matches!(&part, Some(ModulePart::Evaluation));

    let module_type = &*turbo_tasks::read!(module_type)?;
    let module = match module_type {
        ModuleType::Ecmascript {
            preprocess,
            main,
            postprocess,
            options,
        }
        | ModuleType::EcmascriptExtensionless {
            preprocess,
            main,
            postprocess,
            options,
        }
        | ModuleType::Typescript {
            preprocess,
            main,
            postprocess,
            tsx: _,
            analyze_types: _,
            options,
        }
        | ModuleType::TypescriptDeclaration {
            preprocess,
            main,
            postprocess,
            options,
        } => {
            let context_for_module = turbo_tasks::read!(match module_type {
                ModuleType::Typescript { analyze_types, .. } if *analyze_types => {
                    module_asset_context.with_types_resolving_enabled()
                }
                ModuleType::TypescriptDeclaration { .. } => {
                    module_asset_context.with_types_resolving_enabled()
                }
                _ => module_asset_context,
            }
            .to_resolved())
            ?;
            let side_effect_free_packages = turbo_tasks::read!(module_asset_context
                .module_options_context())
                ?
                .side_effect_free_packages;
            let mut builder = EcmascriptModuleAsset::builder(
                source,
                ResolvedVc::upcast(context_for_module),
                turbo_tasks::read!(preprocess
                    .extend(**main)
                    .extend(**postprocess)
                    .to_resolved())
                    ?,
                *options,
                turbo_tasks::read!(module_asset_context
                    .compile_time_info()
                    .to_resolved())
                    ?,
                side_effect_free_packages,
            );
            match module_type {
                ModuleType::Ecmascript { .. } => {
                    builder = builder.with_type(EcmascriptModuleAssetType::Ecmascript)
                }
                ModuleType::EcmascriptExtensionless { .. } => {
                    builder = builder.with_type(EcmascriptModuleAssetType::EcmascriptExtensionless)
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

            let module = turbo_tasks::read!(builder.build().to_resolved())?;
            if matches!(reference_type, ReferenceType::Runtime) {
                ResolvedVc::upcast(module)
            } else {
                // Check side effect free on the intermediate module before following reexports
                // This can skip the module earlier and could skip more modules than only doing it
                // at the end. Also we avoid parsing/analyzing the module in this
                // case, because we would need to parse/analyze it for reexports.
                if tree_shaking_mode.is_some() && is_evaluation {
                    // If we are tree shaking, skip the evaluation part if the module is marked as
                    // side effect free.
                    if *turbo_tasks::read!(module.side_effects())? == ModuleSideEffects::SideEffectFree {
                        return Ok(ProcessResult::Ignore.cell());
                    }
                }

                turbo_tasks::read!(match tree_shaking_mode {
                    Some(TreeShakingMode::ModuleFragments) => {
                        Vc::upcast(EcmascriptModulePartAsset::select_part(
                            *module,
                            part.cloned().unwrap_or(ModulePart::facade()),
                        ))
                    }
                    Some(TreeShakingMode::ReexportsOnly) => {
                        if *turbo_tasks::read!(module.get_exports().split_locals_and_reexports())? {
                            if let Some(part) = part {
                                match part {
                                    ModulePart::Evaluation => {
                                        Vc::upcast(EcmascriptModuleLocalsModule::new(*module))
                                    }
                                    ModulePart::Export(_) => {
                                        turbo_tasks::read!(apply_reexport_tree_shaking(
                                            Vc::upcast(
                                                *turbo_tasks::read!(EcmascriptModuleFacadeModule::new(Vc::upcast(
                                                    *module,
                                                ))
                                                .to_resolved())
                                                ?,
                                            ),
                                            part.clone(),
                                        ))
                                        ?
                                    }
                                    _ => bail!(
                                        "Invalid module part \"{}\" for reexports only tree \
                                         shaking mode",
                                        part
                                    ),
                                }
                            } else {
                                Vc::upcast(EcmascriptModuleFacadeModule::new(Vc::upcast(*module)))
                            }
                        } else {
                            Vc::upcast(*module)
                        }
                    }
                    None => Vc::upcast(*module),
                }
                .to_resolved())
                ?
            }
        }
        ModuleType::Raw => ResolvedVc::upcast(turbo_tasks::read!(RawModule::new(*source).to_resolved())?),
        ModuleType::NodeAddon => {
            ResolvedVc::upcast(turbo_tasks::read!(NodeAddonModule::new(*source).to_resolved())?)
        }
        ModuleType::CssModule => ResolvedVc::upcast(
            turbo_tasks::read!(EcmascriptCssModule::new(*source, Vc::upcast(module_asset_context))
                .to_resolved())
                ?,
        ),

        ModuleType::Css {
            ty,
            environment,
            lightningcss_features,
        } => ResolvedVc::upcast(
            turbo_tasks::read!(CssModule::new(
                *source,
                Vc::upcast(module_asset_context),
                *ty,
                css_import_context.map(|c| *c),
                environment.as_deref().copied(),
                *lightningcss_features,
            )
            .to_resolved())
            ?,
        ),
        ModuleType::StaticUrlJs { tag } => ResolvedVc::upcast(
            turbo_tasks::read!(StaticUrlJsModule::new(*source, tag.clone())
                .to_resolved())
                ?,
        ),
        ModuleType::StaticUrlCss { tag } => ResolvedVc::upcast(
            turbo_tasks::read!(StaticUrlCssModule::new(*source, tag.clone())
                .to_resolved())
                ?,
        ),
        ModuleType::WebAssembly { source_ty } => ResolvedVc::upcast(
            turbo_tasks::read!(WebAssemblyModuleAsset::new(
                WebAssemblySource::new(*source, *source_ty),
                Vc::upcast(module_asset_context),
            )
            .to_resolved())
            ?,
        ),
        ModuleType::Custom(custom) => {
            turbo_tasks::read!(custom
                .create_module(*source, module_asset_context, reference_type)
                .to_resolved())
                ?
        }
    };

    if tree_shaking_mode.is_some() && is_evaluation {
        // If we are tree shaking, skip the evaluation part if the module is marked as
        // side effect free.
        if *turbo_tasks::read!(module.side_effects())? == ModuleSideEffects::SideEffectFree {
            return Ok(ProcessResult::Ignore.cell());
        }
    }

    Ok(ProcessResult::Module(module).cell())
}
}

turbo_tasks::dual_fn! {
fn apply_reexport_tree_shaking(
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    part: ModulePart,
) -> Result<Vc<Box<dyn Module>>> {
    if let ModulePart::Export(export) = &part {
        let FollowExportsResult {
            module: final_module,
            export_name: new_export,
            ..
        } = &*turbo_tasks::read!(follow_reexports(module, export.clone(), true))?;
        let module = if let Some(new_export) = new_export {
            if *new_export == *export {
                Vc::upcast(**final_module)
            } else {
                Vc::upcast(EcmascriptModuleRenameModule::new(
                    **final_module,
                    ModulePart::renamed_export(new_export.clone(), export.clone()),
                ))
            }
        } else {
            Vc::upcast(EcmascriptModuleRenameModule::new(
                **final_module,
                ModulePart::renamed_namespace(export.clone()),
            ))
        };
        return Ok(module);
    }
    Ok(Vc::upcast(module))
}
}

#[turbo_tasks::value]
#[derive(Debug)]
pub struct ModuleAssetContext {
    pub transitions: ResolvedVc<TransitionOptions>,
    pub compile_time_info: ResolvedVc<CompileTimeInfo>,
    pub module_options_context: ResolvedVc<ModuleOptionsContext>,
    pub resolve_options_context: ResolvedVc<ResolveOptionsContext>,
    pub layer: Layer,
    transition: Option<ResolvedVc<Box<dyn Transition>>>,
    /// Whether to replace external resolutions with CachedExternalModules. Used with
    /// ModuleOptionsContext.enable_externals_tracing to handle transitive external dependencies.
    replace_externals: bool,
}

#[turbo_tasks::value_impl]
impl ModuleAssetContext {
    #[turbo_tasks::function]
    pub fn new(
        transitions: ResolvedVc<TransitionOptions>,
        compile_time_info: ResolvedVc<CompileTimeInfo>,
        module_options_context: ResolvedVc<ModuleOptionsContext>,
        resolve_options_context: ResolvedVc<ResolveOptionsContext>,
        layer: Layer,
    ) -> Vc<Self> {
        Self::cell(ModuleAssetContext {
            transitions,
            compile_time_info,
            module_options_context,
            resolve_options_context,
            transition: None,
            layer,
            replace_externals: true,
        })
    }

    #[turbo_tasks::function]
    pub fn new_transition(
        transitions: ResolvedVc<TransitionOptions>,
        compile_time_info: ResolvedVc<CompileTimeInfo>,
        module_options_context: ResolvedVc<ModuleOptionsContext>,
        resolve_options_context: ResolvedVc<ResolveOptionsContext>,
        layer: Layer,
        transition: ResolvedVc<Box<dyn Transition>>,
    ) -> Vc<Self> {
        Self::cell(ModuleAssetContext {
            transitions,
            compile_time_info,
            module_options_context,
            resolve_options_context,
            layer,
            transition: Some(transition),
            replace_externals: true,
        })
    }

    /// Doesn't replace external resolve results with a CachedExternalModule.
    #[turbo_tasks::function]
    pub fn new_without_replace_externals(
        transitions: ResolvedVc<TransitionOptions>,
        compile_time_info: ResolvedVc<CompileTimeInfo>,
        module_options_context: ResolvedVc<ModuleOptionsContext>,
        resolve_options_context: ResolvedVc<ResolveOptionsContext>,
        layer: Layer,
    ) -> Vc<Self> {
        Self::cell(ModuleAssetContext {
            transitions,
            compile_time_info,
            module_options_context,
            resolve_options_context,
            transition: None,
            layer,
            replace_externals: false,
        })
    }

    #[turbo_tasks::function]
    pub fn module_options_context(&self) -> Vc<ModuleOptionsContext> {
        *self.module_options_context
    }

    #[turbo_tasks::function]
    pub fn resolve_options_context(&self) -> Vc<ResolveOptionsContext> {
        *self.resolve_options_context
    }

    #[turbo_tasks::function]
    pub async fn with_types_resolving_enabled(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        let this = turbo_tasks::read!(self)?;
        if turbo_tasks::read!(this.is_types_resolving_enabled())? {
            return Ok(self);
        }
        let resolve_options_context = *turbo_tasks::read!(
            this.resolve_options_context
                .with_types_enabled()
                .to_resolved()
        )?;

        Ok(ModuleAssetContext::new(
            *this.transitions,
            *this.compile_time_info,
            *this.module_options_context,
            resolve_options_context,
            this.layer.clone(),
        ))
    }
}

impl ModuleAssetContext {
    turbo_tasks::dual_fn! {
    fn is_types_resolving_enabled(&self) -> Result<bool> {
        let resolve_options_context = turbo_tasks::read!(self.resolve_options_context)?;
        Ok(resolve_options_context.enable_types && resolve_options_context.enable_typescript)
    }
    }

    turbo_tasks::dual_fn! {
    fn process_with_transition_rules(
        self: Vc<Self>,
        source: ResolvedVc<Box<dyn Source>>,
        reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        let this = turbo_tasks::read!(self)?;
        Ok(
            if let Some(transition) = turbo_tasks::read!(turbo_tasks::read!(this
                .transitions)
                ?
                .get_by_rules(source, &reference_type))
                ?
            {
                transition.process(*source, self, reference_type)
            } else {
                turbo_tasks::read!(self.process_default(source, reference_type))?
            },
        )
    }
    }

    turbo_tasks::dual_fn! {
    fn process_default(
        self: Vc<Self>,
        source: ResolvedVc<Box<dyn Source>>,
        reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        turbo_tasks::read!(process_default(self, source, reference_type, Vec::new()))
    }
    }
}

turbo_tasks::dual_fn! {
fn process_default(
    module_asset_context: Vc<ModuleAssetContext>,
    source: ResolvedVc<Box<dyn Source>>,
    reference_type: ReferenceType,
    processed_rules: Vec<usize>,
) -> Result<Vc<ProcessResult>> {
    let span = tracing::info_span!(
        "process module",
        name = %turbo_tasks::read!(source.ident().to_string())?,
        layer = Empty,
        reference_type = display(&reference_type)
    );
    if !span.is_disabled() {
        // You can't await multiple times in the span macro call parameters.
        span.record("layer", turbo_tasks::read!(module_asset_context)?.layer.name().as_str());
    }

    // Instrument the async future in the async build; enter the span as a guard under sync.
    #[cfg(not(feature = "sync"))]
    let result = turbo_tasks::read!(process_default_internal(
        module_asset_context,
        source,
        reference_type,
        processed_rules,
    )
    .instrument(span))?;
    #[cfg(feature = "sync")]
    let result = {
        let _guard = span.entered();
        process_default_internal(module_asset_context, source, reference_type, processed_rules)?
    };
    Ok(result)
}
}

turbo_tasks::dual_fn! {
/// Apply collected transforms to a module type.
/// For Ecmascript/Typescript variants: merge collected transforms into the module type.
/// For Custom: call extend_ecmascript_transforms() if any transforms exist.
/// For non-ecmascript types: warn if transforms exist, return unchanged.
fn apply_module_rule_transforms(
    module_type: &mut ModuleType,
    collected_preprocess: &mut Vec<ResolvedVc<EcmascriptInputTransforms>>,
    collected_main: &mut Vec<ResolvedVc<EcmascriptInputTransforms>>,
    collected_postprocess: &mut Vec<ResolvedVc<EcmascriptInputTransforms>>,
    ident: ResolvedVc<AssetIdent>,
    current_source: ResolvedVc<Box<dyn Source>>,
) -> Result<()> {
    let has_transforms = !collected_preprocess.is_empty()
        || !collected_main.is_empty()
        || !collected_postprocess.is_empty();

    // If no transforms were collected, return early
    if !has_transforms {
        return Ok(());
    }

    match module_type {
        ModuleType::Ecmascript {
            preprocess,
            main,
            postprocess,
            ..
        }
        | ModuleType::Typescript {
            preprocess,
            main,
            postprocess,
            ..
        }
        | ModuleType::TypescriptDeclaration {
            preprocess,
            main,
            postprocess,
            ..
        }
        | ModuleType::EcmascriptExtensionless {
            preprocess,
            main,
            postprocess,
            ..
        } => {
            // Apply collected preprocess/main in order, then module type's transforms
            let mut final_preprocess = EcmascriptInputTransforms::empty();
            for vc in collected_preprocess.drain(..) {
                final_preprocess = final_preprocess.extend(*vc);
            }
            final_preprocess = final_preprocess.extend(**preprocess);
            *preprocess = turbo_tasks::read!(final_preprocess.to_resolved())?;

            let mut final_main = EcmascriptInputTransforms::empty();
            for vc in collected_main.drain(..) {
                final_main = final_main.extend(*vc);
            }
            final_main = final_main.extend(**main);
            *main = turbo_tasks::read!(final_main.to_resolved())?;

            // Apply module type's postprocess first, then collected postprocess
            let mut final_postprocess = **postprocess;
            for vc in collected_postprocess.drain(..) {
                final_postprocess = final_postprocess.extend(*vc);
            }
            *postprocess = turbo_tasks::read!(final_postprocess.to_resolved())?;
        }
        ModuleType::Custom(custom_module_type) => {
            if has_transforms {
                // Combine collected transforms into single Vcs
                let mut combined_preprocess = EcmascriptInputTransforms::empty();
                for vc in collected_preprocess.drain(..) {
                    combined_preprocess = combined_preprocess.extend(*vc);
                }
                let mut combined_main = EcmascriptInputTransforms::empty();
                for vc in collected_main.drain(..) {
                    combined_main = combined_main.extend(*vc);
                }
                let mut combined_postprocess = EcmascriptInputTransforms::empty();
                for vc in collected_postprocess.drain(..) {
                    combined_postprocess = combined_postprocess.extend(*vc);
                }

                match turbo_tasks::read!(custom_module_type
                    .extend_ecmascript_transforms(
                        combined_preprocess,
                        combined_main,
                        combined_postprocess,
                    )
                    .to_resolved())

                {
                    Ok(new_custom_module_type) => {
                        *custom_module_type = new_custom_module_type;
                    }
                    Err(_) => {
                        turbo_tasks::read!(ModuleIssue::new(
                            *ident,
                            rcstr!("Invalid module type"),
                            rcstr!(
                                "The custom module type didn't accept the additional Ecmascript \
                                 transforms"
                            ),
                            Some(IssueSource::from_source_only(current_source)),
                        )
                        .to_resolved())
                        ?
                        .emit();
                    }
                }
            }
        }
        other => {
            if has_transforms {
                turbo_tasks::read!(ModuleIssue::new(
                    *ident,
                    rcstr!("Invalid module type"),
                    format!(
                        "The module type must be Ecmascript or Typescript to add Ecmascript \
                         transforms (got {})",
                        other
                    )
                    .into(),
                    Some(IssueSource::from_source_only(current_source)),
                )
                .to_resolved())
                ?
                .emit();
                collected_preprocess.clear();
                collected_main.clear();
                collected_postprocess.clear();
            }
        }
    }
    Ok(())
}
}

turbo_tasks::dual_fn! {
fn process_default_internal(
    module_asset_context: Vc<ModuleAssetContext>,
    source: ResolvedVc<Box<dyn Source>>,
    reference_type: ReferenceType,
    processed_rules: Vec<usize>,
) -> Result<Vc<ProcessResult>> {
    let ident = turbo_tasks::read!(source.ident().to_resolved())?;
    let ident_ref = turbo_tasks::read!(ident)?;
    let path_ref = &ident_ref.path;
    let options = ModuleOptions::new(
        path_ref.parent(),
        module_asset_context.module_options_context(),
        module_asset_context.resolve_options_context(),
    );

    let inner_assets = match &reference_type {
        ReferenceType::Internal(inner_assets) => Some(*inner_assets),
        _ => None,
    };
    let mut current_source = source;
    let mut current_module_type = None;

    // Handle turbopackLoader import attributes: apply inline loader as source transform
    if let ReferenceType::EcmaScriptModules(
        EcmaScriptModulesReferenceSubType::ImportWithTurbopackUse {
            ref loader,
            ref rename_as,
            ref module_type,
        },
    ) = reference_type
    {
        let module_options_context = turbo_tasks::read!(module_asset_context.module_options_context())?;
        let webpack_loaders_options = turbo_tasks::read!(module_options_context
            .enable_webpack_loaders
            .as_ref()
            .context(
                "turbopackUse import assertions require webpack loaders to be enabled \
                 (enable_webpack_loaders)",
            )?)
            ?;
        let execution_context = module_options_context
            .execution_context
            .context("execution_context is required for turbopackUse import assertions")?;
        let execution_context_value = turbo_tasks::read!(execution_context)?;

        let resolve_options_context = turbo_tasks::read!(module_asset_context
            .resolve_options_context()
            .to_resolved())
            ?;
        let source_maps = matches!(
            module_options_context.ecmascript.source_maps,
            SourceMapsType::Full
        );

        // Determine the import map for loader-runner
        let loader_runner_package = webpack_loaders_options.loader_runner_package;

        let import_map = if let Some(loader_runner_package) = loader_runner_package {
            package_import_map_from_import_mapping(rcstr!("loader-runner"), *loader_runner_package)
        } else {
            package_import_map_from_context(
                rcstr!("loader-runner"),
                execution_context_value.project_path.clone(),
            )
        };

        let evaluate_context = turbo_tasks::read!(node_evaluate_asset_context(
            *execution_context,
            Some(import_map),
            None,
            Layer::new(rcstr!("webpack_loaders")),
            false,
        )
        .to_resolved())
        ?;

        let loader_relative_path = execution_context_value
            .project_path
            .get_relative_path_to(&loader.loader)
            .context("Loader path must be on project filesystem")?;
        let webpack_loader_item = WebpackLoaderItem {
            loader: loader_relative_path,
            options: loader.options.clone(),
        };
        let loaders_vc = WebpackLoaderItems(vec![webpack_loader_item]).cell();
        let webpack_loaders = turbo_tasks::read!(WebpackLoaders::new(
            *evaluate_context,
            *execution_context,
            loaders_vc,
            rename_as.clone(),
            *resolve_options_context,
            source_maps,
        )
        .to_resolved())
        ?;

        let transforms = Vc::<SourceTransforms>::cell(vec![ResolvedVc::upcast(webpack_loaders)]);
        current_source = turbo_tasks::read!(transforms
            .transform(*current_source, Vc::upcast(module_asset_context))
            .to_resolved())
            ?;

        // If turbopackModuleType is specified, skip rule matching and directly
        // apply the requested module type with empty transforms (loader output
        // is already processed).
        if let Some(type_str) = module_type {
            let empty_transforms = turbo_tasks::read!(EcmascriptInputTransforms::empty().to_resolved())?;
            let default_options = EcmascriptOptions::default().resolved_cell();
            let effect = turbo_tasks::read!(ConfiguredModuleType::parse(type_str)?
                .into_effect(
                    empty_transforms,
                    empty_transforms,
                    empty_transforms,
                    default_options,
                    None,
                    Default::default(),
                ))
                ?;
            match effect {
                ModuleRuleEffect::ModuleType(module_type) => {
                    return turbo_tasks::read!(apply_module_type(
                        current_source,
                        module_asset_context,
                        module_type.cell(),
                        reference_type,
                        inner_assets,
                    ))
                    ;
                }
                ModuleRuleEffect::SourceTransforms(transforms) => {
                    current_source = turbo_tasks::read!(transforms
                        .transform(*current_source, Vc::upcast(module_asset_context))
                        .to_resolved())
                        ?;
                    // Fall through to re-process with new ident
                }
                _ => bail!("Unexpected module rule effect for turbopackModuleType"),
            }
        }

        // If the ident changed (e.g., due to rename_as), re-process from the
        // beginning so the new extension is matched by the correct rules.
        // Use a plain Import reference type to avoid re-applying turbopackUse
        // loaders in the recursive call (which would cause an infinite loop).
        if turbo_tasks::read!(current_source.ident().to_resolved())? != ident {
            let plain_reference_type =
                ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Import);
            if let Some(transition) = turbo_tasks::read!(turbo_tasks::read!(turbo_tasks::read!(module_asset_context)
                ?
                .transitions)
                ?
                .get_by_rules(current_source, &plain_reference_type))
                ?
            {
                return Ok(transition.process(
                    *current_source,
                    module_asset_context,
                    plain_reference_type,
                ));
            } else {
                // Async recursion boxes to keep the future size finite; sync recurses directly.
                #[cfg(not(feature = "sync"))]
                return turbo_tasks::read!(Box::pin(process_default(
                    module_asset_context,
                    current_source,
                    plain_reference_type,
                    processed_rules,
                )));
                #[cfg(feature = "sync")]
                return process_default(
                    module_asset_context,
                    current_source,
                    plain_reference_type,
                    processed_rules,
                );
            }
        }
    }

    // Collect transforms from ExtendEcmascriptTransforms effects.
    // They will be applied when ModuleType is set.
    let mut collected_preprocess: Vec<ResolvedVc<EcmascriptInputTransforms>> = Vec::new();
    let mut collected_main: Vec<ResolvedVc<EcmascriptInputTransforms>> = Vec::new();
    let mut collected_postprocess: Vec<ResolvedVc<EcmascriptInputTransforms>> = Vec::new();

    let options_value = turbo_tasks::read!(options)?;
    'outer: for (i, rule) in options_value.rules.iter().enumerate() {
        if processed_rules.contains(&i) {
            continue;
        }
        if turbo_tasks::read!(rule.matches(source, path_ref, &reference_type))? {
            for effect in rule.effects() {
                match effect {
                    ModuleRuleEffect::Ignore => {
                        return Ok(ProcessResult::Ignore.cell());
                    }
                    ModuleRuleEffect::SourceTransforms(transforms) => {
                        current_source = turbo_tasks::read!(transforms
                            .transform(*current_source, Vc::upcast(module_asset_context))
                            .to_resolved())
                            ?;
                        if turbo_tasks::read!(current_source.ident().to_resolved())? != ident {
                            // The ident has been changed, so we need to apply new rules.
                            if let Some(transition) = turbo_tasks::read!(turbo_tasks::read!(turbo_tasks::read!(module_asset_context)
                                ?
                                .transitions)
                                ?
                                .get_by_rules(current_source, &reference_type))
                                ?
                            {
                                return Ok(transition.process(
                                    *current_source,
                                    module_asset_context,
                                    reference_type,
                                ));
                            } else {
                                let mut processed_rules = processed_rules.clone();
                                processed_rules.push(i);
                                // Async recursion boxes; sync recurses directly.
                                #[cfg(not(feature = "sync"))]
                                return turbo_tasks::read!(Box::pin(process_default(
                                    module_asset_context,
                                    current_source,
                                    reference_type,
                                    processed_rules,
                                )));
                                #[cfg(feature = "sync")]
                                return process_default(
                                    module_asset_context,
                                    current_source,
                                    reference_type,
                                    processed_rules,
                                );
                            }
                        }
                    }
                    ModuleRuleEffect::ModuleType(module) => {
                        // Apply any collected transforms to this module type and exit rule
                        // processing. Once a ModuleType is determined, we
                        // stop processing further rules.
                        let mut module = module.clone();
                        turbo_tasks::read!(apply_module_rule_transforms(
                            &mut module,
                            &mut collected_preprocess,
                            &mut collected_main,
                            &mut collected_postprocess,
                            ident,
                            current_source,
                        ))
                        ?;
                        current_module_type = Some(module);
                        break 'outer;
                    }
                    ModuleRuleEffect::ExtendEcmascriptTransforms {
                        preprocess: extend_preprocess,
                        main: extend_main,
                        postprocess: extend_postprocess,
                    } => {
                        // Collect transforms. They will be applied when ModuleType is set.
                        collected_preprocess.push(*extend_preprocess);
                        collected_main.push(*extend_main);
                        collected_postprocess.push(*extend_postprocess);
                    }
                }
            }
        }
    }

    let Some(module_type) = current_module_type else {
        return Ok(ProcessResult::Unknown(current_source).cell());
    };

    let module = turbo_tasks::read!(apply_module_type(
        current_source,
        module_asset_context,
        module_type.cell(),
        reference_type,
        inner_assets,
    ))
    ?;

    Ok(module)
}
}

#[turbo_tasks::function]
pub async fn externals_tracing_module_context(
    compile_time_info: Vc<CompileTimeInfo>,
    resolve_typescript: bool,
) -> Result<Vc<ModuleAssetContext>> {
    let mut extensions = vec![rcstr!(".js"), rcstr!(".node"), rcstr!(".json")];
    if resolve_typescript {
        extensions.insert(0, rcstr!(".ts"));
    }

    let resolve_options = ResolveOptionsContext {
        custom_extensions: Some(extensions),
        emulate_environment: Some(turbo_tasks::read!(compile_time_info)?.environment),
        loose_errors: true,
        collect_affecting_sources: true,
        custom_conditions: vec![rcstr!("node")],
        module_sync: ConditionValue::Unknown,
        ..Default::default()
    };

    Ok(ModuleAssetContext::new_without_replace_externals(
        Default::default(),
        compile_time_info,
        // This config should be kept in sync with
        // turbopack/crates/turbopack-tracing/tests/node-file-trace.rs and
        // turbopack/crates/turbopack-tracing/tests/unit.rs and
        // turbopack/crates/turbopack/src/lib.rs and
        // turbopack/crates/turbopack-nft/src/nft.rs
        ModuleOptionsContext {
            ecmascript: EcmascriptOptionsContext {
                enable_typescript_transform: Some(
                    TypescriptTransformOptions::default().resolved_cell(),
                ),
                // enable_types should not be enabled here. It gets set automatically when a TS file
                // is encountered.
                source_maps: SourceMapsType::None,
                ..Default::default()
            },
            css: CssOptionsContext {
                source_maps: SourceMapsType::None,
                enable_raw_css: true,
                ..Default::default()
            },
            // Environment is not passed in order to avoid downleveling JS / CSS for
            // node-file-trace.
            environment: None,
            analyze_mode: AnalyzeMode::Tracing,
            // Disable tree shaking. Even side-effect-free imports need to be traced, as they will
            // execute at runtime.
            tree_shaking_mode: None,
            ..Default::default()
        }
        .cell(),
        resolve_options.cell(),
        Layer::new(rcstr!("externals-tracing")),
    ))
}

#[turbo_tasks::value_impl]
impl AssetContext for ModuleAssetContext {
    #[turbo_tasks::function]
    fn compile_time_info(&self) -> Vc<CompileTimeInfo> {
        *self.compile_time_info
    }

    fn layer(&self) -> Layer {
        self.layer.clone()
    }

    #[turbo_tasks::function]
    async fn resolve_options(
        self: Vc<Self>,
        origin_path: FileSystemPath,
    ) -> Result<Vc<ResolveOptions>> {
        let this = turbo_tasks::read!(self)?;
        let module_asset_context = if let Some(transition) = this.transition {
            transition.process_context(self)
        } else {
            self
        };
        // TODO move `apply_commonjs/esm_resolve_options` etc. to here
        let options = resolve_options(
            origin_path.parent(),
            *turbo_tasks::read!(module_asset_context)?.resolve_options_context,
        );
        // Inject the turbopack-ecmascript-runtime import map so that
        // @turbopack/* built-in modules and @vercel/turbopack-ecmascript-runtime/*
        // paths are always resolvable.
        let runtime_import_map = turbo_tasks::read!(
            turbopack_ecmascript_runtime::turbopack_runtime_import_map().to_resolved()
        )?;
        Ok(options.with_extended_import_map(*runtime_import_map))
    }

    #[turbo_tasks::function]
    async fn resolve_asset(
        self: Vc<Self>,
        origin_path: FileSystemPath,
        request: Vc<Request>,
        resolve_options: Vc<ResolveOptions>,
        reference_type: ReferenceType,
    ) -> Result<Vc<ModuleResolveResult>> {
        let context_path = origin_path.parent();

        let result = resolve(
            context_path,
            reference_type.clone(),
            request,
            resolve_options,
        );

        let mut result =
            self.process_resolve_result(*turbo_tasks::read!(result.to_resolved())?, reference_type);
        let this = turbo_tasks::read!(self)?;
        if turbo_tasks::read!(this.is_types_resolving_enabled())? {
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
        reference_type: ReferenceType,
    ) -> Result<Vc<ModuleResolveResult>> {
        let this = turbo_tasks::read!(self)?;

        let replace_externals = this.replace_externals;
        let import_externals = turbo_tasks::read!(this.module_options_context)?
            .ecmascript
            .import_externals;

        let result = turbo_tasks::read!(result)?;

        // The per-item mapper is a dual helper: `map_primary_items` takes a future-returning
        // closure in the async build and a `Result`-returning closure under sync. A single
        // shared closure works for both because `process_resolve_item` is itself dual.
        let result = turbo_tasks::read!(result.map_primary_items(|item| {
            process_resolve_item(
                item,
                self,
                reference_type.clone(),
                replace_externals,
                import_externals,
            )
        }))?;

        Ok(result.cell())
    }

    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        asset: ResolvedVc<Box<dyn Source>>,
        reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        let this = turbo_tasks::read!(self)?;
        if let Some(transition) = this.transition {
            Ok(transition.process(*asset, self, reference_type))
        } else {
            Ok(turbo_tasks::read!(
                self.process_with_transition_rules(asset, reference_type)
            )?)
        }
    }

    #[turbo_tasks::function]
    async fn with_transition(&self, transition: RcStr) -> Result<Vc<Box<dyn AssetContext>>> {
        Ok(
            if let Some(transition) = turbo_tasks::read!(self.transitions)?.get_named(transition) {
                Vc::upcast(ModuleAssetContext::new_transition(
                    *self.transitions,
                    *self.compile_time_info,
                    *self.module_options_context,
                    *self.resolve_options_context,
                    self.layer.clone(),
                    *transition,
                ))
            } else {
                // TODO report issue
                Vc::upcast(ModuleAssetContext::new(
                    *self.transitions,
                    *self.compile_time_info,
                    *self.module_options_context,
                    *self.resolve_options_context,
                    self.layer.clone(),
                ))
            },
        )
    }
}

#[turbo_tasks::function]
pub async fn emit_asset(asset: Vc<Box<dyn OutputAsset>>) -> Result<()> {
    turbo_tasks::read!(
        asset
            .content()
            .write(turbo_tasks::read!(asset.path().owned())?)
            .as_side_effect()
    )?;

    Ok(())
}

#[turbo_tasks::function]
pub async fn emit_assets_into_dir(
    assets: Vc<ExpandedOutputAssets>,
    output_dir: FileSystemPath,
) -> Result<()> {
    let assets = turbo_tasks::read!(assets)?;
    let paths = turbo_tasks::parallel!(assets.iter().map(|&asset| asset.path()))?;
    for (&asset, path) in assets.iter().zip(paths.iter()) {
        if path.is_inside_ref(&output_dir) {
            turbo_tasks::read!(emit_asset(*asset).as_side_effect())?;
        }
    }
    Ok(())
}

#[turbo_tasks::function(operation, root)]
pub async fn emit_assets_into_dir_operation(
    assets: ResolvedVc<ExpandedOutputAssets>,
    output_dir: FileSystemPath,
) -> Result<()> {
    turbo_tasks::read!(emit_assets_into_dir(*assets, output_dir).as_side_effect())?;
    Ok(())
}

turbo_tasks::dual_fn! {
/// Replaces the externals in the result with `ExternalModuleAsset` instances.
pub fn replace_external(
    name: &RcStr,
    ty: ExternalType,
    target: Option<FileSystemPath>,
    import_externals: bool,
    analyze_mode: CachedExternalTracingMode,
) -> Result<Option<ModuleResolveResultItem>> {
    let external_type = match ty {
        ExternalType::CommonJs => CachedExternalType::CommonJs,
        ExternalType::EcmaScriptModule => {
            if import_externals {
                CachedExternalType::EcmaScriptViaImport
            } else {
                CachedExternalType::EcmaScriptViaRequire
            }
        }
        ExternalType::Global => CachedExternalType::Global,
        ExternalType::Script => CachedExternalType::Script,
        ExternalType::Url => {
            // we don't want to wrap url externals.
            return Ok(None);
        }
    };

    let module = turbo_tasks::read!(CachedExternalModule::new(name.clone(), target, external_type, analyze_mode)
        .to_resolved())
        ?;

    Ok(Some(ModuleResolveResultItem::Module(ResolvedVc::upcast(
        module,
    ))))
}
}

turbo_tasks::dual_fn! {
/// Maps a single primary resolve result item to a module resolve result item.
/// Extracted from `process_resolve_result` so a single shared closure can be passed to the
/// dual `map_primary_items` in both the async and sync builds.
fn process_resolve_item(
    item: ResolveResultItem,
    module_asset_context: Vc<ModuleAssetContext>,
    reference_type: ReferenceType,
    replace_externals: bool,
    import_externals: bool,
) -> Result<ModuleResolveResultItem> {
    Ok(match item {
        ResolveResultItem::Source(source) => {
            match &*turbo_tasks::read!(module_asset_context.process(*source, reference_type))? {
                ProcessResult::Module(module) => ModuleResolveResultItem::Module(*module),
                ProcessResult::Unknown(source) => ModuleResolveResultItem::Unknown(*source),
                ProcessResult::Ignore => ModuleResolveResultItem::Ignore,
            }
        }
        ResolveResultItem::External {
            name,
            ty,
            traced,
            target,
        } => {
            let replacement = if replace_externals {
                // Determine the package folder, `target` is the full path to the
                // resolved file.
                let target = if let Some(mut target) = target {
                    loop {
                        let parent = target.parent();
                        if parent.is_root() {
                            break;
                        }
                        if parent.file_name() == "node_modules" {
                            break;
                        }
                        if parent.file_name().starts_with("@")
                            && parent.parent().file_name() == "node_modules"
                        {
                            break;
                        }
                        target = parent;
                    }
                    Some(target)
                } else {
                    None
                };

                let analyze_mode = if traced == ExternalTraced::Traced
                    && let Some(options) = &turbo_tasks::read!(module_asset_context
                        .module_options_context())
                        ?
                        .enable_externals_tracing
                {
                    // result.affecting_sources can be ignored for tracing, as this
                    // request will later be resolved relative to tracing_root (or
                    // the .next/node_modules/lodash-1238123 symlink) anyway.

                    let options = turbo_tasks::read!(options)?;
                    let origin = PlainResolveOrigin::new(
                        Vc::upcast(externals_tracing_module_context(
                            *options.compile_time_info,
                            false,
                        )),
                        // If target is specified, a symlink will be created to
                        // make the folder
                        // itself available, but we still need to trace
                        // resolving the individual file(s) inside the package.
                        target
                            .as_ref()
                            .unwrap_or(&options.tracing_root)
                            .join("_")?,
                    );
                    CachedExternalTracingMode::Traced {
                        origin: ResolvedVc::upcast(turbo_tasks::read!(origin.to_resolved())?),
                    }
                } else {
                    CachedExternalTracingMode::Untraced
                };

                turbo_tasks::read!(replace_external(&name, ty, target, import_externals, analyze_mode))?
            } else {
                None
            };

            replacement.unwrap_or_else(|| ModuleResolveResultItem::External { name, ty })
        }
        ResolveResultItem::Ignore => ModuleResolveResultItem::Ignore,
        ResolveResultItem::Empty => ModuleResolveResultItem::Empty,
        ResolveResultItem::Error(e) => ModuleResolveResultItem::Error(e),
        ResolveResultItem::Custom(u8) => ModuleResolveResultItem::Custom(u8),
    })
}
}
