use anyhow::{Result, bail};
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, glob::Glob, rope::RopeBuilder};
use turbopack::{ModuleAssetContext, module_options::CustomModuleType};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    resolve::ModulePart,
    source::Source,
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptChunkType,
    EcmascriptExports,
};

#[turbo_tasks::value(shared)]
pub struct RawEcmascriptModuleType {}

#[turbo_tasks::value_impl]
impl CustomModuleType for RawEcmascriptModuleType {
    #[turbo_tasks::function]
    fn create_module(
        &self,
        source: Vc<Box<dyn Source>>,
        _module_asset_context: Vc<ModuleAssetContext>,
        _part: Option<ModulePart>,
    ) -> Vc<Box<dyn Module>> {
        Vc::upcast(RawEcmascriptModule::new(source))
    }
}

#[turbo_tasks::value]
pub struct RawEcmascriptModule {
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl RawEcmascriptModule {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>) -> Vc<Self> {
        Self::cell(RawEcmascriptModule { source })
    }
}

#[turbo_tasks::value_impl]
impl Module for RawEcmascriptModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(rcstr!("raw"))
    }
}

#[turbo_tasks::value_impl]
impl Asset for RawEcmascriptModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for RawEcmascriptModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(RawEcmascriptChunkItem::cell(RawEcmascriptChunkItem {
            module: self,
            chunking_context,
        }))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for RawEcmascriptModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::CommonJs.cell()
    }

    #[turbo_tasks::function]
    fn is_marked_as_side_effect_free(&self, _side_effect_free_packages: Vc<Glob>) -> Vc<bool> {
        Vc::cell(false)
    }
}

#[turbo_tasks::value]
struct RawEcmascriptChunkItem {
    module: ResolvedVc<RawEcmascriptModule>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for RawEcmascriptChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(*self.module)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for RawEcmascriptChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let content = self.module.content().file_content().await?;
        let content = match &*content {
            FileContent::Content(file) => file.content(),
            FileContent::NotFound => bail!("RawEcmascriptModule content not found"),
        };
        let mut inner_code = RopeBuilder::default();
        inner_code.concat(content);
        // Add newline in case the raw code had a comment as the last line and no final newline.
        inner_code += "\n";
        Ok(EcmascriptChunkItemContent {
            inner_code: inner_code.build(),
            ..Default::default()
        }
        .into())
    }
}
