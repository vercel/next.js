use anyhow::{Result, bail};
use turbo_frozenmap::FrozenMap;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, ChunkableModule, ChunkingContext, EvaluatableAsset, MergeableModule,
        MergeableModules, MergeableModulesExposed,
    },
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::ModuleReferences,
    resolve::{ExportUsage, ModulePart},
    source::OptionSource,
};

use crate::{
    AnalyzeEcmascriptModuleResult, EcmascriptAnalyzable, EcmascriptAnalyzableExt,
    EcmascriptModuleContent, EcmascriptModuleContentOptions, EcmascriptOptions,
    MergedEcmascriptModule, SpecifiedModuleType,
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    code_gen::CodeGens,
    references::{
        async_module::{AsyncModule, OptionAsyncModule},
        esm::{EsmExport, EsmExports, base::EsmAssetReferences},
    },
    side_effect_optimization::reference::EcmascriptModulePartReference,
};

/// A module derived from an original ecmascript module that reexports a single export or the whole
/// namespace object under a different name.
#[turbo_tasks::value]
pub struct EcmascriptModuleRenameModule {
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    /// The part of the module that this facade represents.
    /// ModulePart::Facade | ModulePart::RenamedExport |
    /// ModulePart::RenamedNamespace
    part: ModulePart,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleRenameModule {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        part: ModulePart,
    ) -> Vc<Self> {
        assert!(
            matches!(
                part,
                ModulePart::RenamedExport { .. } | ModulePart::RenamedNamespace { .. }
            ),
            "{part:?} is unexpected for EcmascriptModuleRenameModule"
        );
        EcmascriptModuleRenameModule { module, part }.cell()
    }

    #[turbo_tasks::function]
    pub async fn async_module(&self) -> Result<Vc<AsyncModule>> {
        let (import_externals, has_top_level_await) =
            if let Some(async_module) = *self.module.get_async_module().await? {
                (
                    async_module.await?.import_externals,
                    async_module.await?.has_top_level_await,
                )
            } else {
                (false, false)
            };
        Ok(AsyncModule {
            has_top_level_await,
            import_externals,
        }
        .cell())
    }
}

impl EcmascriptModuleRenameModule {
    pub async fn module_reference(&self) -> Result<ResolvedVc<EcmascriptModulePartReference>> {
        match &self.part {
            ModulePart::RenamedNamespace { .. } => {
                EcmascriptModulePartReference::new_normal(
                    *self.module,
                    self.part.clone(),
                    ExportUsage::all(),
                )
                .to_resolved()
                .await
            }
            ModulePart::RenamedExport {
                original_export, ..
            } => {
                EcmascriptModulePartReference::new_normal(
                    *self.module,
                    self.part.clone(),
                    ExportUsage::named(original_export.clone()),
                )
                .to_resolved()
                .await
            }
            _ => {
                bail!("Unexpected ModulePart for EcmascriptModuleRenameModule");
            }
        }
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModuleRenameModule {
    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .module
            .ident()
            .owned()
            .await?
            .with_part(self.part.clone())
            .into_vc())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let reference = self.await?.module_reference().await?;
        Ok(Vc::cell(vec![ResolvedVc::upcast(reference)]))
    }

    #[turbo_tasks::function]
    async fn is_self_async(self: Vc<Self>) -> Result<Vc<bool>> {
        let async_module = self.async_module();
        let references = self.references();
        let is_self_async = async_module
            .to_resolved()
            .await?
            .is_self_async(*references.to_resolved().await?)
            .to_resolved()
            .await?;
        Ok(*is_self_async)
    }

    #[turbo_tasks::function]
    fn side_effects(&self) -> Vc<ModuleSideEffects> {
        // This just re-exports another import
        ModuleSideEffects::ModuleEvaluationIsSideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptModuleRenameModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        let f = File::from("");

        AssetContent::file(FileContent::Content(f).cell())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptAnalyzable for EcmascriptModuleRenameModule {
    #[turbo_tasks::function]
    fn analyze(&self) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        bail!("EcmascriptModuleRenameModule::analyze shouldn't be called");
    }

    #[turbo_tasks::function]
    fn module_content_without_analysis(
        &self,
        _generate_source_map: bool,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        bail!("EcmascriptModuleRenameModule::module_content_without_analysis shouldn't be called");
    }

    #[turbo_tasks::function]
    async fn module_content_options(
        self: ResolvedVc<Self>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        async_module_info: Option<ResolvedVc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContentOptions>> {
        let reference = self.await?.module_reference().await?;

        Ok(EcmascriptModuleContentOptions {
            parsed: None,
            module: ResolvedVc::upcast(self),
            specified_module_type: SpecifiedModuleType::EcmaScript,
            chunking_context,
            references: self.references().to_resolved().await?,
            part_references: vec![reference],
            esm_references: EsmAssetReferences::empty().to_resolved().await?,
            code_generation: CodeGens::empty().to_resolved().await?,
            async_module: ResolvedVc::cell(Some(self.async_module().to_resolved().await?)),
            // The facade module cannot generate source maps, because the inserted references
            // contain spans from the original module, but the facade module itself doesn't have the
            // original module's swc_common::SourceMap in `parsed`.
            generate_source_map: false,
            original_source_map: None,
            exports: self.get_exports().to_resolved().await?,
            async_module_info,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModuleRenameModule {
    #[turbo_tasks::function]
    async fn get_exports(&self) -> Result<Vc<EcmascriptExports>> {
        let reference = self.module_reference().await?;

        let export = match &self.part {
            ModulePart::RenamedExport {
                original_export,
                export,
            } => (
                export.clone(),
                EsmExport::ImportedBinding(
                    ResolvedVc::upcast(reference),
                    original_export.clone(),
                    false,
                ),
            ),
            ModulePart::RenamedNamespace { export } => (
                export.clone(),
                EsmExport::ImportedNamespace(ResolvedVc::upcast(reference)),
            ),
            _ => bail!("Unexpected ModulePart for EcmascriptModuleRenameModule"),
        };

        let exports = EsmExports {
            exports: FrozenMap::from_unique_sorted_box(Box::new([export])),
            star_exports: Vec::new(),
        }
        .resolved_cell();
        Ok(EcmascriptExports::EsmExports(exports).cell())
    }

    #[turbo_tasks::function]
    async fn get_async_module(self: Vc<Self>) -> Result<Vc<OptionAsyncModule>> {
        Ok(Vc::cell(Some(self.async_module().to_resolved().await?)))
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let async_module_options = self.get_async_module().module_options(async_module_info);
        let content = self.module_content(chunking_context, async_module_info);
        Ok(EcmascriptChunkItemContent::new(
            content,
            chunking_context,
            async_module_options,
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModuleRenameModule {
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
impl EvaluatableAsset for EcmascriptModuleRenameModule {}

#[turbo_tasks::value_impl]
impl MergeableModule for EcmascriptModuleRenameModule {
    #[turbo_tasks::function]
    async fn merge(
        self: Vc<Self>,
        modules: Vc<MergeableModulesExposed>,
        entry_points: Vc<MergeableModules>,
    ) -> Result<Vc<Box<dyn ChunkableModule>>> {
        Ok(Vc::upcast(
            *MergedEcmascriptModule::new(
                modules,
                entry_points,
                EcmascriptOptions::default().resolved_cell(),
            )
            .await?,
        ))
    }
}
