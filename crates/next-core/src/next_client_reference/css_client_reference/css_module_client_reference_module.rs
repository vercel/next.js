use std::collections::BTreeMap;

use anyhow::{bail, Result};
use indoc::formatdoc;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::css::chunk::CssChunkPlaceable;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkItemExt, ChunkType, ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences, SingleChunkableModuleReference},
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    references::esm::{EsmExport, EsmExports},
    utils::StringifyJs,
};

use crate::next_client_reference::css_client_reference::css_client_reference_reference::CssClientReference;

/// A [`CssModuleClientReferenceModule`] is a marker module used to indicate which
/// client reference should appear in the client reference manifest.
#[turbo_tasks::value]
pub struct CssModuleClientReferenceModule {
    /// The CSS module (in the client context)
    pub client_module: ResolvedVc<Box<dyn CssChunkPlaceable>>,
    /// The Ecmascript CSS Module module (in the parent context)
    pub module_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[turbo_tasks::function]
fn reference_modifier() -> Vc<RcStr> {
    Vc::cell("css module client reference".into())
}

#[turbo_tasks::value_impl]
impl CssModuleClientReferenceModule {
    /// Create a new [`CssModuleClientReferenceModule`] from the given source CSS
    /// module.
    #[turbo_tasks::function]
    pub fn new(
        client_module: ResolvedVc<Box<dyn CssChunkPlaceable>>,
        module_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    ) -> Vc<CssModuleClientReferenceModule> {
        CssModuleClientReferenceModule {
            client_module,
            module_module,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn inner_module_reference(&self) -> Vc<Box<dyn ModuleReference>> {
        Vc::upcast(SingleChunkableModuleReference::new(
            Vc::upcast(*self.module_module),
            reference_modifier(),
        ))
    }
}

#[turbo_tasks::function]
fn css_client_reference_modifier() -> Vc<RcStr> {
    Vc::cell("css module client reference module".into())
}

#[turbo_tasks::value_impl]
impl Module for CssModuleClientReferenceModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.module_module
            .ident()
            .with_modifier(css_client_reference_modifier())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let CssModuleClientReferenceModule { client_module, .. } = &*self.await?;

        Ok(Vc::cell(vec![
            self.inner_module_reference().to_resolved().await?,
            ResolvedVc::upcast(
                CssClientReference::new(*ResolvedVc::upcast(*client_module))
                    .to_resolved()
                    .await?,
            ),
        ]))
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssModuleClientReferenceModule {
    #[turbo_tasks::function]
    fn content(&self) -> Result<Vc<AssetContent>> {
        bail!("CSS module client reference module has no content")
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for CssModuleClientReferenceModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(
            CssModuleClientReferenceChunkItem {
                module_graph,
                chunking_context,
                inner: self,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for CssModuleClientReferenceModule {
    #[turbo_tasks::function]
    async fn get_exports(self: Vc<Self>) -> Result<Vc<EcmascriptExports>> {
        let module_reference = self.inner_module_reference().to_resolved().await?;

        let mut exports = BTreeMap::new();
        exports.insert(
            "default".into(),
            EsmExport::ImportedBinding(module_reference, "default".into(), false),
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
struct CssModuleClientReferenceChunkItem {
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    inner: ResolvedVc<CssModuleClientReferenceModule>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for CssModuleClientReferenceChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let inner = self.inner.await?;

        let module_id = inner
            .module_module
            .as_chunk_item(*self.module_graph, Vc::upcast(*self.chunking_context))
            .id()
            .await?;
        Ok(EcmascriptChunkItemContent {
            inner_code: formatdoc!(
                r#"
                    __turbopack_export_namespace__(__turbopack_import__({}));
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
impl ChunkItem for CssModuleClientReferenceChunkItem {
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
