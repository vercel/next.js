use anyhow::{bail, Result};
use indoc::formatdoc;
use turbo_tasks::{debug::ValueDebug, RcStr, TryJoinIterExt, Value, Vc};
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, ChunkData, ChunkItem, ChunkType, ChunkingContext,
        ChunkingContextExt, ChunksData, EvaluatableAsset, EvaluatableAssets,
    },
    ident::AssetIdent,
    module::Module,
    output::OutputAssets,
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
    pub(super) async fn chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
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

        let Some(evaluatable) =
            Vc::try_resolve_downcast::<Box<dyn EvaluatableAsset>>(module.inner).await?
        else {
            bail!("not evaluatable");
        };

        println!(
            "IsolatedLoaderChunkItem entry_chunk_group_asset {:?}",
            module.inner.ident().dbg().await?
        );
        Ok(this.chunking_context.evaluated_chunk_group_assets(
            AssetIdent::from_path(
                this.chunking_context
                    .chunk_path(module.inner.ident(), ".js".into()),
            ), // .with_modifier("isolated".into().cell())
            EvaluatableAssets::empty().with_entry(evaluatable),
            Value::new(AvailabilityInfo::Root),
        ))
    }

    #[turbo_tasks::function]
    async fn chunks_data(self: Vc<Self>) -> Result<Vc<ChunksData>> {
        let this = self.await?;
        Ok(ChunkData::from_assets(
            this.chunking_context.output_root(),
            self.chunks(),
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
        let chunks_data = self.chunks_data().await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let code = formatdoc! {
            r#"
                let chunks = {chunks:#};
                let bootstrap = `importScripts(${{chunks.map(c => (`"${{location.origin}}/_next/${{(c)}}"`)).join(", ")}});`;
                let blob = new Blob([bootstrap], {{ type: "text/javascript" }});
                let blobUrl = URL.createObjectURL(blob);
                __turbopack_export_value__(blobUrl);
            "#,
            // TODO this should use getChunkRelativeUrl from runtime-base.ts
            chunks = StringifyJs(&chunks_data),
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
    Vc::cell("isolated chunk".into())
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
        let chunks = self.chunks();

        Ok(Vc::cell(
            chunks
                .await?
                .iter()
                .copied()
                .map(|chunk| {
                    Vc::upcast(SingleOutputAssetReference::new(
                        chunk,
                        chunk_reference_description(),
                    ))
                })
                .collect(),
        ))
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
