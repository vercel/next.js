use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, EvaluatableAsset},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences, SingleChunkableModuleReference},
    resolve::{ExportUsage, ModulePart},
};

use crate::{
    AnalyzeEcmascriptModuleResult, EcmascriptAnalyzable, EcmascriptAnalyzableExt,
    EcmascriptModuleAsset, EcmascriptModuleContent, EcmascriptModuleContentOptions,
    EcmascriptParsable,
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    parse::ParseResult,
    references::{
        FollowExportsResult, analyze_ecmascript_module, esm::FoundExportType,
        exports::compute_ecmascript_module_exports, follow_reexports,
    },
    rename::module::EcmascriptModuleRenameModule,
    tree_shake::{
        Key, SplitResult, get_part_id, part_of_module, side_effects::module::SideEffectsModule,
        split_module,
    },
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
        assert_ne!(self.part, ModulePart::Facade);
        Ok(part_of_module(split_data, self.part.clone()))
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
        let module = turbo_tasks::read!(self)?;

        let split_data = split_module(*module.full_module);
        let parsed =
            turbo_tasks::read!(part_of_module(split_data, module.part.clone()).to_resolved())?;

        let analyze = self.analyze();
        let analyze_ref = turbo_tasks::read!(analyze)?;

        let module_type_result = turbo_tasks::read!(module.full_module.determine_module_type())?;
        let generate_source_map =
            *turbo_tasks::read!(chunking_context.reference_module_source_maps(Vc::upcast(*self)))?;
        Ok(EcmascriptModuleContentOptions {
            parsed: Some(parsed),
            module: ResolvedVc::upcast(self),
            specified_module_type: module_type_result.module_type,
            chunking_context,
            references: turbo_tasks::read!(analyze.references().to_resolved())?,
            esm_references: analyze_ref.esm_references,
            part_references: vec![],
            code_generation: analyze_ref.code_generation,
            async_module: analyze_ref.async_module,
            generate_source_map,
            original_source_map: analyze_ref.source_map,
            exports: turbo_tasks::read!(self.get_exports().to_resolved())?,
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
        let split_result = turbo_tasks::read!(split_module(*module))?;
        let part_id = turbo_tasks::read!(get_part_id(&split_result, &part))?;

        Ok(Self::new_raw(*module, ModulePart::internal(part_id)))
    }

    #[turbo_tasks::function]
    pub async fn select_part(
        module: Vc<EcmascriptModuleAsset>,
        part: ModulePart,
    ) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
        let SplitResult::Ok { entrypoints, .. } = &*turbo_tasks::read!(split_module(module))?
        else {
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
                let source_module = Vc::upcast(module);
                let FollowExportsWithSideEffectsResult {
                    side_effects,
                    result,
                } = &*turbo_tasks::read!(follow_reexports_with_side_effects(
                    source_module,
                    export.clone()
                ))?;
                let FollowExportsResult {
                    module: final_module,
                    export_name: new_export,
                    ..
                } = &*turbo_tasks::read!(result)?;
                let final_module = if let Some(new_export) = new_export {
                    if *new_export == export {
                        *final_module
                    } else {
                        ResolvedVc::upcast(turbo_tasks::read!(
                            EcmascriptModuleRenameModule::new(
                                **final_module,
                                ModulePart::renamed_export(new_export.clone(), export.clone()),
                            )
                            .to_resolved()
                        )?)
                    }
                } else {
                    ResolvedVc::upcast(turbo_tasks::read!(
                        EcmascriptModuleRenameModule::new(
                            **final_module,
                            ModulePart::renamed_namespace(export.clone()),
                        )
                        .to_resolved()
                    )?)
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
        let this = turbo_tasks::read!(self)?;
        let result = analyze_ecmascript_module(*this.full_module, Some(this.part.clone()));

        if let Some(async_module) = *turbo_tasks::read!(turbo_tasks::read!(result)?.async_module)? {
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
) -> Result<Vc<FollowExportsWithSideEffectsResult>> {
    let mut side_effects = vec![];

    let mut current_module = module;
    let mut current_export_name = export_name;
    let result = loop {
        if *turbo_tasks::read!(current_module.side_effects())? != ModuleSideEffects::SideEffectFree
        {
            side_effects.push(turbo_tasks::read!(
                only_effects(*current_module).to_resolved()
            )?);
        }

        // We ignore the side effect of the entry module here, because we need to proceed.
        let result = turbo_tasks::read!(
            follow_reexports(*current_module, current_export_name.clone(), true).to_resolved()
        )?;

        let FollowExportsResult {
            module,
            export_name,
            ty,
        } = &*turbo_tasks::read!(result)?;

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
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(turbo_tasks::read!(self.full_module.ident().owned())?
            .with_part(self.part.clone())
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
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
            references.push(turbo_tasks::read!(
                part_dep(ModulePart::evaluation()).to_resolved()
            )?);
            references.push(turbo_tasks::read!(
                part_dep(ModulePart::exports()).to_resolved()
            )?);
            return Ok(Vc::cell(references));
        }

        let analyze = analyze_ecmascript_module(*self.full_module, Some(self.part.clone()));

        Ok(analyze.references())
    }

    #[turbo_tasks::function]
    async fn side_effects(&self) -> Vc<ModuleSideEffects> {
        match self.part {
            ModulePart::Exports | ModulePart::Export(..) => {
                ModuleSideEffects::SideEffectFree.cell()
            }
            _ => self.full_module.side_effects(),
        }
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn get_exports(&self) -> Result<Vc<EcmascriptExports>> {
        Ok(*turbo_tasks::read!(compute_ecmascript_module_exports(
            *self.full_module,
            Some(self.part.clone())
        ))?
        .exports)
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let analyze = turbo_tasks::read!(self.analyze())?;
        let async_module_options = analyze.async_module.module_options(async_module_info);

        let content = self.module_content(chunking_context, async_module_info);

        Ok(EcmascriptChunkItemContent::new(
            content,
            chunking_context,
            async_module_options,
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    pub(super) fn analyze(&self) -> Vc<AnalyzeEcmascriptModuleResult> {
        analyze_ecmascript_module(*self.full_module, Some(self.part.clone()))
    }
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
