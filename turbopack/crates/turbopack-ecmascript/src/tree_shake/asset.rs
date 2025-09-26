use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::glob::Glob;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, EvaluatableAsset},
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences, SingleChunkableModuleReference},
    resolve::{ExportUsage, ModulePart, origin::ResolveOrigin},
};

use super::{
    SplitResult, chunk_item::EcmascriptModulePartChunkItem, get_part_id, part_of_module,
    split_module,
};
use crate::{
    AnalyzeEcmascriptModuleResult, EcmascriptAnalyzable, EcmascriptModuleAsset,
    EcmascriptModuleAssetType, EcmascriptModuleContent, EcmascriptModuleContentOptions,
    EcmascriptParsable,
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    parse::ParseResult,
    references::{
        FollowExportsResult, analyze_ecmascript_module, esm::FoundExportType, follow_reexports,
    },
    side_effect_optimization::facade::module::EcmascriptModuleFacadeModule,
    tree_shake::{Key, side_effect_module::SideEffectsModule},
};

/// A reference to part of an ES module.
///
/// This type is used for an advanced tree shkaing.
#[turbo_tasks::value]
pub struct EcmascriptModulePartAsset {
    pub full_module: ResolvedVc<EcmascriptModuleAsset>,
    pub part: ModulePart,
}

#[turbo_tasks::value_impl]
impl EcmascriptParsable for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    fn failsafe_parse(&self) -> Result<Vc<ParseResult>> {
        let split_data = split_module(*self.full_module);
        Ok(part_of_module(split_data, self.part.clone()))
    }
    #[turbo_tasks::function]
    fn parse_original(&self) -> Vc<ParseResult> {
        self.full_module.parse_original()
    }

    #[turbo_tasks::function]
    fn ty(&self) -> Vc<EcmascriptModuleAssetType> {
        self.full_module.ty()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptAnalyzable for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    fn analyze(&self) -> Vc<AnalyzeEcmascriptModuleResult> {
        analyze_ecmascript_module(*self.full_module, Some(self.part.clone()))
    }

    #[turbo_tasks::function]
    fn module_content_without_analysis(
        &self,
        generate_source_map: bool,
    ) -> Vc<EcmascriptModuleContent> {
        self.full_module
            .module_content_without_analysis(generate_source_map)
    }

    #[turbo_tasks::function]
    async fn module_content_options(
        self: ResolvedVc<Self>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        async_module_info: Option<ResolvedVc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContentOptions>> {
        let module = self.await?;

        let split_data = split_module(*module.full_module);
        let parsed = part_of_module(split_data, module.part.clone())
            .to_resolved()
            .await?;

        let analyze = self.analyze();
        let analyze_ref = analyze.await?;

        let module_type_result = module.full_module.determine_module_type().await?;
        let generate_source_map = *chunking_context
            .reference_module_source_maps(Vc::upcast(*self))
            .await?;
        Ok(EcmascriptModuleContentOptions {
            parsed: Some(parsed),
            module: ResolvedVc::upcast(self),
            specified_module_type: module_type_result.module_type,
            chunking_context,
            references: analyze.references().to_resolved().await?,
            esm_references: analyze_ref.esm_references,
            part_references: vec![],
            code_generation: analyze_ref.code_generation,
            async_module: analyze_ref.async_module,
            generate_source_map,
            original_source_map: analyze_ref.source_map,
            exports: analyze_ref.exports,
            async_module_info,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartAsset {
    /// Create a new instance of [Vc<EcmascriptModulePartAsset>], which consists
    /// of a pointer to the full module and the [ModulePart] pointing the part
    /// of the module.
    #[turbo_tasks::function]
    fn new_raw(module: ResolvedVc<EcmascriptModuleAsset>, part: ModulePart) -> Vc<Self> {
        Self {
            full_module: module,
            part,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn new_with_resolved_part(
        module: ResolvedVc<EcmascriptModuleAsset>,
        part: ModulePart,
    ) -> Result<Vc<Self>> {
        if matches!(
            part,
            ModulePart::Internal(..) | ModulePart::Facade | ModulePart::Exports
        ) {
            return Ok(Self::new_raw(*module, part));
        }

        // This is a workaround to avoid creating duplicate assets for internal parts.
        let split_result = split_module(*module).await?;
        let part_id = get_part_id(&split_result, &part).await?;

        Ok(Self::new_raw(*module, ModulePart::internal(part_id)))
    }

    #[turbo_tasks::function]
    pub async fn select_part(
        module: Vc<EcmascriptModuleAsset>,
        part: ModulePart,
    ) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
        let SplitResult::Ok { entrypoints, .. } = &*split_module(module).await? else {
            return Ok(Vc::upcast(module));
        };

        match part {
            ModulePart::Evaluation => {
                // We resolve the module evaluation here to prevent duplicate assets.
                let idx = *entrypoints.get(&Key::ModuleEvaluation).unwrap();
                return Ok(Vc::upcast(
                    EcmascriptModulePartAsset::new_with_resolved_part(
                        module,
                        ModulePart::internal(idx),
                    ),
                ));
            }

            ModulePart::Export(export) => {
                if entrypoints.contains_key(&Key::Export(export.clone())) {
                    return Ok(Vc::upcast(
                        EcmascriptModulePartAsset::new_with_resolved_part(
                            module,
                            ModulePart::Export(export),
                        ),
                    ));
                }
                let side_effect_free_packages = module.asset_context().side_effect_free_packages();
                let source_module = Vc::upcast(module);
                let FollowExportsWithSideEffectsResult {
                    side_effects,
                    result,
                } = &*follow_reexports_with_side_effects(
                    source_module,
                    export.clone(),
                    side_effect_free_packages,
                )
                .await?;
                let FollowExportsResult {
                    module: final_module,
                    export_name: new_export,
                    ..
                } = &*result.await?;
                let final_module = if let Some(new_export) = new_export {
                    if *new_export == export {
                        *final_module
                    } else {
                        ResolvedVc::upcast(
                            EcmascriptModuleFacadeModule::new(
                                **final_module,
                                ModulePart::renamed_export(new_export.clone(), export.clone()),
                            )
                            .to_resolved()
                            .await?,
                        )
                    }
                } else {
                    ResolvedVc::upcast(
                        EcmascriptModuleFacadeModule::new(
                            **final_module,
                            ModulePart::renamed_namespace(export.clone()),
                        )
                        .to_resolved()
                        .await?,
                    )
                };
                if side_effects.is_empty() {
                    return Ok(*final_module);
                }
                let side_effects_module = SideEffectsModule::new(
                    module,
                    ModulePart::Export(export),
                    *final_module,
                    side_effects.iter().map(|v| **v).collect(),
                );
                return Ok(Vc::upcast(side_effects_module));
            }
            _ => (),
        }

        Ok(Vc::upcast(
            EcmascriptModulePartAsset::new_with_resolved_part(module, part.clone()),
        ))
    }

    #[turbo_tasks::function]
    pub async fn is_async_module(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;
        let result = analyze(*this.full_module, this.part.clone());

        if let Some(async_module) = *result.await?.async_module.await? {
            Ok(async_module.is_self_async(self.references()))
        } else {
            Ok(Vc::cell(false))
        }
    }
}

#[turbo_tasks::value]
struct FollowExportsWithSideEffectsResult {
    side_effects: Vec<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
    result: ResolvedVc<FollowExportsResult>,
}

#[turbo_tasks::function]
async fn follow_reexports_with_side_effects(
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    export_name: RcStr,
    side_effect_free_packages: Vc<Glob>,
) -> Result<Vc<FollowExportsWithSideEffectsResult>> {
    let mut side_effects = vec![];

    let mut current_module = module;
    let mut current_export_name = export_name;
    let result = loop {
        let is_side_effect_free = *current_module
            .is_marked_as_side_effect_free(side_effect_free_packages)
            .await?;

        if !is_side_effect_free {
            side_effects.push(only_effects(*current_module).to_resolved().await?);
        }

        // We ignore the side effect of the entry module here, because we need to proceed.
        let result = follow_reexports(
            *current_module,
            current_export_name.clone(),
            side_effect_free_packages,
            true,
        )
        .to_resolved()
        .await?;

        let FollowExportsResult {
            module,
            export_name,
            ty,
        } = &*result.await?;

        match ty {
            FoundExportType::SideEffects => {
                current_module = *module;
                current_export_name = export_name.clone().unwrap_or(current_export_name);
            }
            _ => break result,
        }
    };

    Ok(FollowExportsWithSideEffectsResult {
        side_effects,
        result,
    }
    .cell())
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.full_module.ident().with_part(self.part.clone())
    }

    #[turbo_tasks::function]
    fn is_self_async(self: Vc<Self>) -> Vc<bool> {
        self.is_async_module()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let part_dep = |part: ModulePart| -> Vc<Box<dyn ModuleReference>> {
            let export = match &part {
                ModulePart::Export(export) => ExportUsage::named(export.clone()),
                ModulePart::Evaluation => ExportUsage::evaluation(),
                _ => ExportUsage::all(),
            };

            Vc::upcast(SingleChunkableModuleReference::new(
                Vc::upcast(EcmascriptModulePartAsset::new_with_resolved_part(
                    *self.full_module,
                    part,
                )),
                rcstr!("part reference"),
                export,
            ))
        };

        if let ModulePart::Facade = self.part {
            // Facade depends on evaluation and re-exports
            let mut references = vec![];
            references.push(part_dep(ModulePart::evaluation()).to_resolved().await?);
            references.push(part_dep(ModulePart::exports()).to_resolved().await?);
            return Ok(Vc::cell(references));
        }

        let analyze = analyze(*self.full_module, self.part.clone());

        Ok(analyze.references())
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.full_module.content()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn get_exports(self: Vc<Self>) -> Result<Vc<EcmascriptExports>> {
        Ok(*self.analyze().await?.exports)
    }

    #[turbo_tasks::function]
    async fn is_marked_as_side_effect_free(
        self: Vc<Self>,
        side_effect_free_packages: Vc<Glob>,
    ) -> Result<Vc<bool>> {
        let this = self.await?;

        match this.part {
            ModulePart::Exports | ModulePart::Export(..) => Ok(Vc::cell(true)),
            _ => Ok(this
                .full_module
                .is_marked_as_side_effect_free(side_effect_free_packages)),
        }
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(
            EcmascriptModulePartChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    pub(super) fn analyze(&self) -> Vc<AnalyzeEcmascriptModuleResult> {
        analyze(*self.full_module, self.part.clone())
    }
}

#[turbo_tasks::function]
fn analyze(
    module: Vc<EcmascriptModuleAsset>,
    part: ModulePart,
) -> Vc<AnalyzeEcmascriptModuleResult> {
    analyze_ecmascript_module(module, Some(part))
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for EcmascriptModulePartAsset {}

#[turbo_tasks::function]
async fn only_effects(
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    if let Some(module) = ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(module) {
        let module =
            EcmascriptModulePartAsset::new_with_resolved_part(*module, ModulePart::evaluation());
        return Ok(Vc::upcast(module));
    }

    Ok(*module)
}
