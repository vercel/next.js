use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{ChunkData, ChunkItem, ChunkType, ChunkingContext, ChunksData},
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReferences, SingleOutputAssetReference},
};

use super::chunk_asset::ManifestAsyncModule;
use crate::{
    chunk::{
        data::EcmascriptChunkData, EcmascriptChunkItem, EcmascriptChunkItemContent,
        EcmascriptChunkType,
    },
    utils::StringifyJs,
};

/// The ManifestChunkItem generates a __turbopack_load__ call for every chunk
/// necessary to load the real asset. Once all the loads resolve, it is safe to
/// __turbopack_import__ the actual module that was dynamically imported.
#[turbo_tasks::value(shared)]
pub(super) struct ManifestChunkItem {
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub manifest: ResolvedVc<ManifestAsyncModule>,
}

#[turbo_tasks::value_impl]
impl ManifestChunkItem {
    #[turbo_tasks::function]
    fn chunks_data(&self) -> Vc<ChunksData> {
        ChunkData::from_assets(self.chunking_context.output_root(), self.manifest.chunks())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ManifestChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
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
                __turbopack_export_value__({:#});
            "#,
            StringifyJs(&chunks_data)
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ManifestChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.manifest.ident()
    }

    #[turbo_tasks::function]
    fn content_ident(&self) -> Vc<AssetIdent> {
        self.manifest.content_ident()
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let this = self.await?;
        let mut references = this.manifest.references().await?.clone_value();

        let key = Vc::cell("chunk data reference".into());

        for chunk_data in &*self.chunks_data().await? {
            references.extend(
                chunk_data
                    .references()
                    .await?
                    .iter()
                    .map(|&output_asset| async move {
                        Ok(ResolvedVc::upcast(
                            SingleOutputAssetReference::new(*output_asset, key)
                                .to_resolved()
                                .await?,
                        ))
                    })
                    .try_join()
                    .await?,
            );
        }

        Ok(Vc::cell(references))
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *ResolvedVc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.manifest)
    }
}
