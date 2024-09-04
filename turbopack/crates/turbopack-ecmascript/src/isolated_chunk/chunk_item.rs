use anyhow::{bail, Result};
use indoc::formatdoc;
use turbo_tasks::{debug::ValueDebug, RcStr, Vc};
use turbopack_core::{
    chunk::{
        ChunkData, ChunkDataOption, ChunkItem, ChunkType, ChunkingContext, ChunkingContextExt,
        EvaluatableAssets,
    },
    ident::AssetIdent,
    module::Module,
    output::OutputAsset,
    reference::{ModuleReferences, SingleOutputAssetReference},
};

use super::module::IsolatedLoaderModule;
use crate::{
    chunk::{
        data::EcmascriptChunkData, EcmascriptChunkItem, EcmascriptChunkItemContent,
        EcmascriptChunkType,
    },
    utils::StringifyJs,
};

#[turbo_tasks::value(shared)]
pub struct IsolatedLoaderChunkItem {
    pub module: Vc<IsolatedLoaderModule>,
    pub chunking_context: Vc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl IsolatedLoaderChunkItem {
    #[turbo_tasks::function]
    pub(super) async fn chunk(self: Vc<Self>) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = self.await?;
        let module = this.module.await?;
        // if let Some(chunk_items) = module.availability_info.available_chunk_items() {
        //     if chunk_items
        //         .get(
        //             module
        //                 .inner
        //                 .as_chunk_item(Vc::upcast(this.chunking_context))
        //                 .resolve()
        //                 .await?,
        //         )
        //         .await?
        //         .is_some()
        //     {
        //         return Ok(Vc::cell(vec![]));
        //     }
        // }
        // Ok(this.chunking_context.chunk_group_assets(
        //     Vc::upcast(module.inner),
        //     Value::new(module.availability_info),
        // ));

        println!(
            "IsolatedLoaderChunkItem entry_chunk_group_asset {:?}",
            module.inner.ident().dbg().await?
        );
        Ok(this.chunking_context.root_entry_chunk_group_asset(
            this.chunking_context
                .chunk_path(module.inner.ident(), ".js".into()),
            Vc::upcast(module.inner),
            // TODO .with_entry(evaluatable) ?
            EvaluatableAssets::empty(),
        ))
    }

    #[turbo_tasks::function]
    async fn chunk_data(self: Vc<Self>) -> Result<Vc<ChunkDataOption>> {
        let this = self.await?;
        Ok(ChunkData::from_asset(
            this.chunking_context.output_root(),
            self.chunk(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for IsolatedLoaderChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        self.chunking_context
    }

    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        // TODO unwrap
        let chunk_data = self.chunk_data().await?.unwrap().await?;
        let EcmascriptChunkData::Simple(chunk_data) = EcmascriptChunkData::new(&chunk_data) else {
            // TODO
            bail!("not simple");
        };

        let code = formatdoc! {
            r#"
                __turbopack_export_value__({chunk:#});
            "#,
            chunk = StringifyJs(&format!("./{}", chunk_data)),
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .into())
    }
}

#[turbo_tasks::function]
fn chunk_reference_description() -> Vc<RcStr> {
    Vc::cell("chunk".into())
}

#[turbo_tasks::value_impl]
impl ChunkItem for IsolatedLoaderChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    async fn content_ident(&self) -> Result<Vc<AssetIdent>> {
        // let mut ident = self.module.ident();
        // if let Some(available_chunk_items) =
        //     self.module.await?.availability_info.available_chunk_items()
        // {
        //     ident = ident.with_modifier(Vc::cell(
        //         available_chunk_items.hash().await?.to_string().into(),
        //     ));
        // }
        // Ok(ident)
        Ok(self.module.ident())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let chunk = self.chunk();

        Ok(Vc::cell(vec![Vc::upcast(SingleOutputAssetReference::new(
            chunk,
            chunk_reference_description(),
        ))]))
    }

    #[turbo_tasks::function]
    async fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(self.module)
    }
}
