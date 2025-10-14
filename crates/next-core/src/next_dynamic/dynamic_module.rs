use std::collections::BTreeMap;

use anyhow::{Result, bail};
use indoc::formatdoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkingContext, ModuleChunkItemIdExt},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    reference::{ModuleReferences, SingleChunkableModuleReference},
    resolve::ExportUsage,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
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
}

#[turbo_tasks::value_impl]
impl Asset for NextDynamicEntryModule {
    #[turbo_tasks::function]
    fn content(&self) -> Result<Vc<AssetContent>> {
        bail!("Next.js Server Component module has no content")
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
        Vc::upcast(
            NextDynamicEntryChunkItem {
                chunking_context,
                module_graph,
                inner: self,
            }
            .cell(),
        )
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
}

#[turbo_tasks::value]
struct NextDynamicEntryChunkItem {
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
    inner: ResolvedVc<NextDynamicEntryModule>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for NextDynamicEntryChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let inner = self.inner.await?;

        let module_id = inner.module.chunk_item_id(*self.chunking_context).await?;
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

#[turbo_tasks::value_impl]
impl ChunkItem for NextDynamicEntryChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    fn ty(&self) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(Vc::<EcmascriptChunkType>::default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(*self.inner)
    }
}
