use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{ChunkData, ChunkItem, ChunkType, ChunkingContext, ChunksData},
    ident::AssetIdent,
    module::Module,
    output::OutputAssets,
};

use super::chunk_asset::ManifestAsyncModule;
use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkType,
        data::EcmascriptChunkData,
    },
    runtime_functions::TURBOPACK_EXPORT_VALUE,
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
    async fn chunks_data(&self) -> Result<Vc<ChunksData>> {
        Ok(ChunkData::from_assets(
            self.chunking_context.output_root().owned().await?,
            *self.manifest.chunk_group().await?.assets,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ManifestChunkItem {
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
                {TURBOPACK_EXPORT_VALUE}({:#});
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
    fn references(&self) -> Vc<OutputAssets> {
        self.manifest.chunk_group().all_assets()
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
        *ResolvedVc::upcast(self.manifest)
    }
}
