use std::collections::BTreeMap;

use anyhow::Result;
use indoc::formatdoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, ModuleChunkItemIdExt},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReferences, SingleChunkableModuleReference},
    resolve::ExportUsage,
    source::OptionSource,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    references::esm::{EsmExport, EsmExports},
    runtime_functions::{TURBOPACK_EXPORT_NAMESPACE, TURBOPACK_IMPORT},
    utils::StringifyJs,
};

/// A [`NextDynamicEntryModule`] is a marker asset used to indicate which
/// dynamic assets should appear in the dynamic manifest.
#[turbo_tasks::value(shared)]
pub struct NextDynamicEntryModule {
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl NextDynamicEntryModule {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>) -> Vc<Self> {
        NextDynamicEntryModule { module }.cell()
    }
}

fn dynamic_ref_description() -> RcStr {
    rcstr!("next/dynamic reference")
}

#[turbo_tasks::value_impl]
impl Module for NextDynamicEntryModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.module
            .ident()
            .with_modifier(rcstr!("next/dynamic entry"))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![ResolvedVc::upcast(
            SingleChunkableModuleReference::new(
                Vc::upcast(*self.module),
                dynamic_ref_description(),
                ExportUsage::all(),
            )
            .to_resolved()
            .await?,
        )]))
    }
    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        // This just exports another import
        ModuleSideEffects::ModuleEvaluationIsSideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for NextDynamicEntryModule {
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
impl EcmascriptChunkPlaceable for NextDynamicEntryModule {
    #[turbo_tasks::function]
    async fn get_exports(&self) -> Result<Vc<EcmascriptExports>> {
        let module_reference = ResolvedVc::upcast(
            SingleChunkableModuleReference::new(
                Vc::upcast(*self.module),
                dynamic_ref_description(),
                ExportUsage::all(),
            )
            .to_resolved()
            .await?,
        );

        let mut exports = BTreeMap::new();
        let default = rcstr!("default");
        exports.insert(
            default.clone(),
            EsmExport::ImportedBinding(module_reference, default, false),
        );

        Ok(EcmascriptExports::EsmExports(
            EsmExports {
                exports,
                star_exports: vec![module_reference],
            }
            .resolved_cell(),
        )
        .cell())
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let module_id = self.module.chunk_item_id(chunking_context).await?;
        Ok(EcmascriptChunkItemContent {
            inner_code: formatdoc!(
                r#"
                    {TURBOPACK_EXPORT_NAMESPACE}({TURBOPACK_IMPORT}({}));
                "#,
                StringifyJs(&module_id),
            )
            .into(),
            ..Default::default()
        }
        .cell())
    }
}
