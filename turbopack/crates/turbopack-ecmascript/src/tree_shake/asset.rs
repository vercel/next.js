use anyhow::{Context, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::glob::Glob;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, EvaluatableAsset},
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences, SingleModuleReference},
    resolve::{origin::ResolveOrigin, ModulePart},
};

use super::{
    chunk_item::EcmascriptModulePartChunkItem, get_part_id, part_of_module, split, split_module,
    PartId, SplitResult,
};
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    parse::ParseResult,
    references::{
        analyse_ecmascript_module, esm::FoundExportType, follow_reexports, FollowExportsResult,
    },
    side_effect_optimization::facade::module::EcmascriptModuleFacadeModule,
    tree_shake::{side_effect_module::SideEffectsModule, Key},
    AnalyzeEcmascriptModuleResult, EcmascriptAnalyzable, EcmascriptModuleAsset,
    EcmascriptModuleAssetType, EcmascriptModuleContent, EcmascriptParsable,
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
    async fn failsafe_parse(&self) -> Result<Vc<ParseResult>> {
        let parsed = self.full_module.failsafe_parse();
        let split_data = split(self.full_module.ident(), self.full_module.source(), parsed);
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
        analyse_ecmascript_module(*self.full_module, Some(self.part.clone()))
    }

    #[turbo_tasks::function]
    fn module_content_without_analysis(
        &self,
        generate_source_map: Vc<bool>,
    ) -> Vc<EcmascriptModuleContent> {
        self.full_module
            .module_content_without_analysis(generate_source_map)
    }

    #[turbo_tasks::function]
    fn module_content(
        &self,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<EcmascriptModuleContent> {
        self.full_module
            .module_content(module_graph, chunking_context, async_module_info)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartAsset {
    /// Create a new instance of [Vc<EcmascriptModulePartAsset>], whcih consists
    /// of a pointer to the full module and the [ModulePart] pointing the part
    /// of the module.
    #[turbo_tasks::function]
    pub async fn new(
        module: ResolvedVc<EcmascriptModuleAsset>,
        part: ModulePart,
    ) -> Result<Vc<Self>> {
        if matches!(
            part,
            ModulePart::Internal(..)
                | ModulePart::InternalEvaluation(..)
                | ModulePart::Facade
                | ModulePart::Exports
                | ModulePart::Evaluation
        ) {
            return Ok(EcmascriptModulePartAsset {
                full_module: module,
                part,
            }
            .cell());
        }

        // This is a workaround to avoid creating duplicate assets for internal parts.
        let split_result = split_module(*module).await?;
        let part_id = get_part_id(&split_result, &part).await?;

        Ok(EcmascriptModulePartAsset {
            full_module: module,
            part: ModulePart::internal(part_id),
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn select_part(
        module: Vc<EcmascriptModuleAsset>,
        part: ModulePart,
    ) -> Result<Vc<Box<dyn Module>>> {
        let SplitResult::Ok { entrypoints, .. } = &*split_module(module).await? else {
            return Ok(Vc::upcast(module));
        };

        // We follow reexports here
        if let ModulePart::Export(export) = part {
            // If a local binding or reexport with the same name exists, we stop here.
            // Side effects of the barrel file are preserved.
            if entrypoints.contains_key(&Key::Export(export.clone())) {
                return Ok(Vc::upcast(EcmascriptModulePartAsset::new(
                    module,
                    ModulePart::Export(export),
                )));
            }

            let side_effect_free_packages = module.asset_context().side_effect_free_packages();

            // Exclude local bindings by using exports module part.
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
                return Ok(*ResolvedVc::upcast(final_module));
            }

            let side_effects_module = SideEffectsModule::new(
                module,
                ModulePart::Export(export),
                *final_module,
                side_effects.iter().map(|v| **v).collect(),
            );

            return Ok(Vc::upcast(side_effects_module));
        }

        Ok(Vc::upcast(EcmascriptModulePartAsset::new(
            module,
            part.clone(),
        )))
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
        let split_data = split_module(*self.full_module).await?;

        let analyze = analyze(*self.full_module, self.part.clone()).await?;

        let deps = match &*split_data {
            SplitResult::Ok { deps, .. } => deps,
            SplitResult::Failed { .. } => return Ok(*analyze.references),
        };

        let part_dep = |part: ModulePart| -> Vc<Box<dyn ModuleReference>> {
            Vc::upcast(SingleModuleReference::new(
                Vc::upcast(EcmascriptModulePartAsset::new(*self.full_module, part)),
                Vc::cell("ecmascript module part".into()),
            ))
        };

        let mut references = analyze.references.await?.to_vec();

        // Facade depends on evaluation and re-exports
        if self.part == ModulePart::Facade {
            references.push(part_dep(ModulePart::evaluation()).to_resolved().await?);
            references.push(part_dep(ModulePart::exports()).to_resolved().await?);
            return Ok(Vc::cell(references));
        }

        let deps = {
            let part_id = get_part_id(&split_data, &self.part)
                .await
                .with_context(|| format!("part {:?} is not found in the module", self.part))?;

            match deps.get(&part_id) {
                Some(v) => &**v,
                None => &[],
            }
        };

        references.extend(
            deps.iter()
                .filter_map(|part_id| {
                    Some(part_dep(match part_id {
                        // This is an internal part that is not for evaluation, so we don't need to
                        // force-add it.
                        PartId::Internal(.., false) => return None,
                        PartId::Internal(part_id, true) => {
                            ModulePart::internal_evaluation(*part_id)
                        }
                        PartId::Export(name) => ModulePart::export(name.clone()),
                        _ => unreachable!(
                            "PartId other than Internal and Export should not be used here"
                        ),
                    }))
                })
                .map(|v| async move { v.to_resolved().await })
                .try_join()
                .await?,
        );

        Ok(Vc::cell(references))
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
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(
            EcmascriptModulePartChunkItem {
                module: self,
                module_graph,
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
    analyse_ecmascript_module(module, Some(part))
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for EcmascriptModulePartAsset {}

#[turbo_tasks::function]
async fn only_effects(
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    if let Some(module) = Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(module).await? {
        let module = EcmascriptModulePartAsset::new(module, ModulePart::evaluation());
        return Ok(Vc::upcast(module));
    }

    Ok(module)
}
