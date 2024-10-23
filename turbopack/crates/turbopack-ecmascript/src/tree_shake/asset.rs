use anyhow::Result;
use turbo_tasks::{RcStr, Value, Vc};
use turbo_tasks_fs::glob::Glob;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, EvaluatableAsset},
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReferences, SingleModuleReference},
    resolve::{origin::ResolveOrigin, ModulePart},
};

use super::{
    chunk_item::EcmascriptModulePartChunkItem, part_of_module, split, split_module, SplitResult,
};
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    parse::ParseResult,
    references::{
        analyse_ecmascript_module, esm::FoundExportType, follow_reexports, FollowExportsResult,
    },
    side_effect_optimization::facade::module::EcmascriptModuleFacadeModule,
    tree_shake::{chunk_item::SideEffectsModuleChunkItem, Key},
    AnalyzeEcmascriptModuleResult, EcmascriptAnalyzable, EcmascriptModuleAsset,
    EcmascriptModuleAssetType, EcmascriptModuleContent, EcmascriptParsable,
};

/// A reference to part of an ES module.
///
/// This type is used for an advanced tree shkaing.
#[turbo_tasks::value]
pub struct EcmascriptModulePartAsset {
    pub full_module: Vc<EcmascriptModuleAsset>,
    pub part: Vc<ModulePart>,
}

#[turbo_tasks::value_impl]
impl EcmascriptParsable for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn failsafe_parse(&self) -> Result<Vc<ParseResult>> {
        let parsed = self.full_module.failsafe_parse();
        let split_data = split(self.full_module.ident(), self.full_module.source(), parsed);
        Ok(part_of_module(split_data, self.part))
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
        let part = self.part;
        analyse_ecmascript_module(self.full_module, Some(part))
    }

    #[turbo_tasks::function]
    fn module_content_without_analysis(&self) -> Vc<EcmascriptModuleContent> {
        self.full_module.module_content_without_analysis()
    }

    #[turbo_tasks::function]
    fn module_content(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<EcmascriptModuleContent> {
        self.full_module
            .module_content(chunking_context, async_module_info)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartAsset {
    /// Create a new instance of [Vc<EcmascriptModulePartAsset>], whcih consists
    /// of a pointer to the full module and the [ModulePart] pointing the part
    /// of the module.
    #[turbo_tasks::function]
    pub fn new(module: Vc<EcmascriptModuleAsset>, part: Vc<ModulePart>) -> Vc<Self> {
        EcmascriptModulePartAsset {
            full_module: module,
            part,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn select_part(
        module: Vc<EcmascriptModuleAsset>,
        part: Vc<ModulePart>,
    ) -> Result<Vc<Box<dyn Module>>> {
        let SplitResult::Ok { entrypoints, .. } = &*split_module(module).await? else {
            return Ok(Vc::upcast(module));
        };

        // We follow reexports here
        if let ModulePart::Export(export) = &*part.await? {
            let export_name = export.await?.clone_value();

            // If a local binding or reexport with the same name exists, we stop here.
            // Side effects of the barrel file are preserved.
            if entrypoints.contains_key(&Key::Export(export_name.clone())) {
                return Ok(Vc::upcast(EcmascriptModulePartAsset::new(module, part)));
            }

            let side_effect_free_packages = module.asset_context().side_effect_free_packages();

            // Exclude local bindings by using exports module part.
            let source_module = Vc::upcast(module);

            let FollowExportsWithSideEffectsResult {
                side_effects,
                result,
            } = &*follow_reexports_with_side_effects(
                source_module,
                export_name.clone(),
                side_effect_free_packages,
            )
            .await?;

            let FollowExportsResult {
                module: final_module,
                export_name: new_export,
                ..
            } = &*result.await?;

            let final_module = if let Some(new_export) = new_export {
                if *new_export == export_name {
                    *final_module
                } else {
                    Vc::upcast(EcmascriptModuleFacadeModule::new(
                        *final_module,
                        ModulePart::renamed_export(new_export.clone(), export_name.clone()),
                    ))
                }
            } else {
                Vc::upcast(EcmascriptModuleFacadeModule::new(
                    *final_module,
                    ModulePart::renamed_namespace(export_name.clone()),
                ))
            };

            let side_effects = side_effects.await?.to_vec();
            if side_effects.is_empty() {
                return Ok(Vc::upcast(final_module));
            }

            return Ok(Vc::upcast(
                SideEffectsModule {
                    binding: final_module,
                    side_effects: Vc::cell(side_effects),
                }
                .cell(),
            ));
        }

        Ok(Vc::upcast(EcmascriptModulePartAsset::new(module, part)))
    }

    #[turbo_tasks::function]
    pub async fn is_async_module(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;
        let result = analyze(this.full_module, this.part);

        if let Some(async_module) = *result.await?.async_module.await? {
            Ok(async_module.is_self_async(self.references()))
        } else {
            Ok(Vc::cell(false))
        }
    }
}

#[turbo_tasks::value]
pub(super) struct SideEffectsModule {
    pub binding: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    pub side_effects: Vc<SideEffects>,
}

#[turbo_tasks::value_impl]
impl Module for SideEffectsModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = self.binding.ident().await?.clone_value();

        ident.add_modifier(Vc::cell(RcStr::from("side effects")));

        for (i, side_effect) in self.side_effects.await?.iter().enumerate() {
            ident.add_asset(
                Vc::cell(RcStr::from(format!("side effect {}", i))),
                side_effect.ident(),
            );
        }

        Ok(AssetIdent::new(Value::new(ident)))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let mut references = vec![];

        for &side_effect in self.side_effects.await?.iter() {
            references.push(Vc::upcast(SingleModuleReference::new(
                Vc::upcast(side_effect),
                Vc::cell(RcStr::from("side effect")),
            )));
        }

        references.push(Vc::upcast(SingleModuleReference::new(
            Vc::upcast(self.binding),
            Vc::cell(RcStr::from("target binding")),
        )));

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for SideEffectsModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        unreachable!("SideEffectsModule has no content")
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for SideEffectsModule {
    #[turbo_tasks::function]
    async fn get_exports(&self) -> Vc<EcmascriptExports> {
        self.binding.get_exports()
    }

    #[turbo_tasks::function]
    async fn is_marked_as_side_effect_free(self: Vc<Self>, _: Vc<Glob>) -> Vc<bool> {
        Vc::cell(false)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for SideEffectsModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        Ok(Vc::upcast(
            SideEffectsModuleChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for SideEffectsModule {}

#[turbo_tasks::value]
struct FollowExportsWithSideEffectsResult {
    side_effects: Vc<SideEffects>,
    result: Vc<FollowExportsResult>,
}

#[turbo_tasks::value(transparent)]
pub(super) struct SideEffects(pub Vec<Vc<Box<dyn EcmascriptChunkPlaceable>>>);

#[turbo_tasks::function]
async fn follow_reexports_with_side_effects(
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
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
            side_effects.push(only_effects(current_module));
        }

        // We ignore the side effect of the entry module here, because we need to proceed.
        let result = follow_reexports(
            current_module,
            current_export_name.clone(),
            side_effect_free_packages,
            true,
        );

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
        side_effects: Vc::cell(side_effects),
        result,
    }
    .cell())
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.full_module.ident().with_part(self.part)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let analyze = analyze(self.full_module, self.part).await?;

        Ok(analyze.references)
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
        Ok(self.analyze().await?.exports)
    }

    #[turbo_tasks::function]
    async fn is_marked_as_side_effect_free(
        self: Vc<Self>,
        side_effect_free_packages: Vc<Glob>,
    ) -> Result<Vc<bool>> {
        let this = self.await?;

        match *this.part.await? {
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
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
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
        analyze(self.full_module, self.part)
    }
}

#[turbo_tasks::function]
fn analyze(
    module: Vc<EcmascriptModuleAsset>,
    part: Vc<ModulePart>,
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
        let module = EcmascriptModulePartAsset::select_part(module, ModulePart::evaluation());
        if let Some(module) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module).await?
        {
            return Ok(module);
        }
    }

    Ok(module)
}
