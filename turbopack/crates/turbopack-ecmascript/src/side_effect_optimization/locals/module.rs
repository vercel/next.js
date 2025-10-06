use std::collections::BTreeMap;

use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::glob::Glob;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, ChunkableModule, ChunkingContext, MergeableModule, MergeableModules,
        MergeableModulesExposed,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    reference::ModuleReferences,
    resolve::ModulePart,
};

use super::chunk_item::EcmascriptModuleLocalsChunkItem;
use crate::{
    AnalyzeEcmascriptModuleResult, EcmascriptAnalyzable, EcmascriptModuleAsset,
    EcmascriptModuleContent, EcmascriptModuleContentOptions, MergedEcmascriptModule,
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    references::{
        async_module::OptionAsyncModule,
        esm::{EsmExport, EsmExports},
    },
};

/// A module derived from an original ecmascript module that only contains the
/// local declarations, but excludes all reexports. These reexports are exposed
/// from [EcmascriptModuleFacadeModule] instead.
#[turbo_tasks::value]
pub struct EcmascriptModuleLocalsModule {
    pub module: ResolvedVc<EcmascriptModuleAsset>,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<EcmascriptModuleAsset>) -> Vc<Self> {
        EcmascriptModuleLocalsModule { module }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.module.ident().with_part(ModulePart::locals())
    }

    #[turbo_tasks::function]
    fn references(&self) -> Result<Vc<ModuleReferences>> {
        let result = self.module.analyze();
        Ok(result.local_references())
    }

    #[turbo_tasks::function]
    async fn is_self_async(self: Vc<Self>) -> Result<Vc<bool>> {
        let analyze = self.await?.module.analyze().await?;
        if let Some(async_module) = *analyze.async_module.await? {
            let is_self_async = async_module.is_self_async(self.references());
            Ok(is_self_async)
        } else {
            Ok(Vc::cell(false))
        }
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.module.content()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptAnalyzable for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    fn analyze(&self) -> Vc<AnalyzeEcmascriptModuleResult> {
        self.module.analyze()
    }

    #[turbo_tasks::function]
    fn module_content_without_analysis(
        &self,
        generate_source_map: bool,
    ) -> Vc<EcmascriptModuleContent> {
        self.module
            .module_content_without_analysis(generate_source_map)
    }

    #[turbo_tasks::function]
    async fn module_content_options(
        self: ResolvedVc<Self>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        async_module_info: Option<ResolvedVc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContentOptions>> {
        let exports = self.get_exports().to_resolved().await?;
        let original_module = self.await?.module;
        let parsed = original_module.await?.parse().await?.to_resolved().await?;

        let analyze = original_module.analyze();
        let analyze_result = analyze.await?;

        let module_type_result = original_module.determine_module_type().await?;
        let generate_source_map = *chunking_context
            .reference_module_source_maps(Vc::upcast(*self))
            .await?;

        Ok(EcmascriptModuleContentOptions {
            parsed: Some(parsed),
            module: ResolvedVc::upcast(self),
            specified_module_type: module_type_result.module_type,
            chunking_context,
            references: analyze.local_references().to_resolved().await?,
            esm_references: analyze_result.esm_local_references,
            part_references: vec![],
            code_generation: analyze_result.code_generation,
            async_module: analyze_result.async_module,
            generate_source_map,
            original_source_map: analyze_result.source_map,
            exports,
            async_module_info,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    async fn get_exports(&self) -> Result<Vc<EcmascriptExports>> {
        let EcmascriptExports::EsmExports(exports) = *self.module.get_exports().await? else {
            bail!("EcmascriptModuleLocalsModule must only be used on modules with EsmExports");
        };
        let esm_exports = exports.await?;
        let mut exports = BTreeMap::new();

        for (name, export) in &esm_exports.exports {
            match export {
                EsmExport::ImportedBinding(..) | EsmExport::ImportedNamespace(..) => {
                    // not included in locals module
                }
                EsmExport::LocalBinding(local_name, mutable) => {
                    exports.insert(
                        name.clone(),
                        EsmExport::LocalBinding(local_name.clone(), *mutable),
                    );
                }
                EsmExport::Error => {
                    exports.insert(name.clone(), EsmExport::Error);
                }
            }
        }

        let exports = EsmExports {
            exports,
            star_exports: vec![],
        }
        .resolved_cell();
        Ok(EcmascriptExports::EsmExports(exports).cell())
    }

    #[turbo_tasks::function]
    fn is_marked_as_side_effect_free(&self, side_effect_free_packages: Vc<Glob>) -> Vc<bool> {
        self.module
            .is_marked_as_side_effect_free(side_effect_free_packages)
    }

    #[turbo_tasks::function]
    fn get_async_module(&self) -> Vc<OptionAsyncModule> {
        self.module.get_async_module()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(
            EcmascriptModuleLocalsChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl MergeableModule for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    async fn merge(
        &self,
        modules: Vc<MergeableModulesExposed>,
        entry_points: Vc<MergeableModules>,
    ) -> Result<Vc<Box<dyn ChunkableModule>>> {
        Ok(Vc::upcast(
            *MergedEcmascriptModule::new(modules, entry_points, self.module.await?.options).await?,
        ))
    }
}
