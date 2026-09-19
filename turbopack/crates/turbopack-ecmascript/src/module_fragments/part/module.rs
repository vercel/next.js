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
    EcmascriptParsable, EnvVarInfo,
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
        placeable::{SideEffectsDeclaration, get_side_effect_free_declaration},
    },
    module_fragments::{
        Key, SplitResult, get_part_id, part_of_module, side_effects::module::SideEffectsModule,
        split_module,
    },
    parse::ParseResult,
    references::{
        FollowExportsResult, analyze_ecmascript_module,
        esm::{EsmExport, FoundExportType},
        exports::compute_ecmascript_module_exports,
        follow_reexports,
    },
    rename::module::EcmascriptModuleRenameModule,
    side_effect_optimization::{
        facade::module::EcmascriptModuleFacadeModule, locals::module::EcmascriptModuleLocalsModule,
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
    async fn env_var_info(self: Vc<Self>) -> Result<Vc<EnvVarInfo>> {
        Ok(*self.analyze().await?.env_var_info)
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
            exports: self.get_exports().to_resolved().await?,
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
                let source_module = ResolvedVc::upcast(module.to_resolved().await?);
                let preserve_intermediate_side_effects = matches!(
                    side_effects_declaration_for_reexport(source_module).await?,
                    SideEffectsDeclaration::SideEffectFree
                );

                let direct_reexport_part = if entrypoints.contains_key(&Key::Export(export.clone()))
                {
                    let is_reexport = if let EcmascriptExports::EsmExports(exports) =
                        &*module.get_exports().await?
                    {
                        matches!(
                            exports.await?.exports.get(&export),
                            Some(EsmExport::ImportedBinding(..) | EsmExport::ImportedNamespace(_))
                        )
                    } else {
                        false
                    };
                    let part = ResolvedVc::upcast(
                        EcmascriptModulePartAsset::new_with_resolved_part(
                            module,
                            ModulePart::Export(export.clone()),
                        )
                        .to_resolved()
                        .await?,
                    );
                    // A declared side-effect-free module may be skipped, but a direct reexport
                    // part would also skip evaluation of an effectful target. Follow that
                    // binding so the side-effect-aware path below can retain only the target's
                    // evaluation. Dynamic/unknown results fall back to this part below.
                    if !is_reexport || !preserve_intermediate_side_effects {
                        return Ok(*part);
                    }
                    Some(part)
                } else {
                    None
                };
                let FollowExportsWithSideEffectsResult {
                    side_effects,
                    result,
                } = &*follow_reexports_with_side_effects(
                    *source_module,
                    export.clone(),
                    preserve_intermediate_side_effects,
                    false,
                )
                .await?;
                let FollowExportsResult {
                    module: final_module,
                    export_name: new_export,
                    ty,
                } = &*result.await?;
                if let Some(direct_reexport_part) = direct_reexport_part
                    && (side_effects.is_empty()
                        || matches!(
                            ty,
                            FoundExportType::Dynamic
                                | FoundExportType::Unknown
                                | FoundExportType::NotFound
                        ))
                {
                    return Ok(*direct_reexport_part);
                }
                let final_module = if let Some(new_export) = new_export {
                    if *new_export == export {
                        *final_module
                    } else {
                        ResolvedVc::upcast(
                            EcmascriptModuleRenameModule::new(
                                **final_module,
                                ModulePart::renamed_export(new_export.clone(), export.clone()),
                            )
                            .to_resolved()
                            .await?,
                        )
                    }
                } else {
                    ResolvedVc::upcast(
                        EcmascriptModuleRenameModule::new(
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
        let result = analyze_ecmascript_module(*this.full_module, Some(this.part.clone()));

        if let Some(async_module) = *result.await?.async_module.await? {
            Ok(async_module.is_self_async(self.references()))
        } else {
            Ok(Vc::cell(false))
        }
    }
}

#[turbo_tasks::value]
pub(crate) struct FollowExportsWithSideEffectsResult {
    pub(crate) side_effects: Vec<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
    pub(crate) result: ResolvedVc<FollowExportsResult>,
}

#[turbo_tasks::function]
pub(crate) async fn follow_reexports_with_side_effects(
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    export_name: RcStr,
    preserve_intermediate_side_effects: bool,
    include_entry_side_effects: bool,
) -> Result<Vc<FollowExportsWithSideEffectsResult>> {
    let mut side_effects = vec![];

    let mut current_module = module;
    let mut current_export_name = export_name;
    let mut crossed_side_effect_boundary = if preserve_intermediate_side_effects {
        include_entry_side_effects
    } else {
        // Preserve the preexisting behavior for modules without an explicit declaration.
        true
    };
    let result = loop {
        // Usually the entry module has a separate evaluation reference. Declared side-effectful
        // modules can also be recursively canonicalized as another module's intermediate, so those
        // callers explicitly retain the entry evaluation before following further.
        let current_side_effects = if preserve_intermediate_side_effects {
            side_effects_for_reexport(current_module).await?
        } else {
            *current_module.side_effects().await?
        };
        if crossed_side_effect_boundary && current_side_effects != ModuleSideEffects::SideEffectFree
        {
            side_effects.push(only_effects(*current_module).to_resolved().await?);
        }

        // We ignore the side effect of the entry module here, because we need to proceed.
        let result = follow_reexports(
            *current_module,
            current_export_name.clone(),
            true,
            preserve_intermediate_side_effects,
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
                crossed_side_effect_boundary = true;
                current_module = *module;
                current_export_name = export_name.clone().unwrap_or(current_export_name);
            }
            _ => break result,
        }
    };

    if preserve_intermediate_side_effects {
        // ESM evaluates dependencies before their importers. We discover the route from the
        // importing module toward the binding provider, so reverse the collected evaluations
        // before composing the synthetic module.
        side_effects.reverse();
    }

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
        Ok(self
            .full_module
            .ident()
            .owned()
            .await?
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
            references.push(part_dep(ModulePart::evaluation()).to_resolved().await?);
            references.push(part_dep(ModulePart::exports()).to_resolved().await?);
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
        Ok(
            *compute_ecmascript_module_exports(*self.full_module, Some(self.part.clone()))
                .await?
                .exports,
        )
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let analyze = self.analyze().await?;
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
pub(crate) async fn only_effects(
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    if let Some(module) = ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(module) {
        let module =
            EcmascriptModulePartAsset::new_with_resolved_part(*module, ModulePart::evaluation());
        return Ok(Vc::upcast(module));
    }

    if let Some(module_part) = ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(module) {
        let module = EcmascriptModulePartAsset::new_with_resolved_part(
            *module_part.await?.full_module,
            ModulePart::evaluation(),
        );
        return Ok(Vc::upcast(module));
    }

    if let Some(facade) = ResolvedVc::try_downcast_type::<EcmascriptModuleFacadeModule>(module)
        && let Some(module) =
            ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(facade.await?.module)
    {
        return Ok(Vc::upcast(EcmascriptModuleLocalsModule::new(*module)));
    }

    Ok(*module)
}

/// Returns the `package.json` side-effect declaration of the original module behind an
/// export-only view.
///
/// Only modules whose package explicitly declares side-effect information participate in the
/// intermediate-preserving reexport path; modules relying on inferred analysis keep the previous
/// behavior.
pub(crate) async fn side_effects_declaration_for_reexport(
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<SideEffectsDeclaration> {
    let original_module =
        if let Some(module) = ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(module) {
            Some(module)
        } else if let Some(module_part) =
            ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(module)
        {
            Some(module_part.await?.full_module)
        } else if let Some(facade) =
            ResolvedVc::try_downcast_type::<EcmascriptModuleFacadeModule>(module)
        {
            ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(facade.await?.module)
        } else {
            None
        };

    let Some(original_module) = original_module else {
        return Ok(SideEffectsDeclaration::None);
    };
    let original = original_module.await?;
    Ok(*get_side_effect_free_declaration(
        original_module.ident().await?.path.clone(),
        original.side_effect_free_packages.map(|glob| *glob),
    )
    .await?)
}

/// Returns the side-effect status of the original module represented by an export-only view.
///
/// Export and facade modules have no local effects themselves, but reexport following must stop at
/// them when their original module's evaluation is effectful so that [`only_effects`] can retain
/// that evaluation separately from the followed binding.
pub(crate) async fn side_effects_for_reexport(
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<ModuleSideEffects> {
    if let Some(module_part) = ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(module) {
        return Ok(*module_part.await?.full_module.side_effects().await?);
    }

    if let Some(facade) = ResolvedVc::try_downcast_type::<EcmascriptModuleFacadeModule>(module) {
        return Ok(*facade.await?.module.side_effects().await?);
    }

    Ok(*module.side_effects().await?)
}
