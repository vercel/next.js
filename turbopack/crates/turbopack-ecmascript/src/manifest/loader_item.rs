use std::io::Write as _;

use anyhow::{anyhow, Result};
use indoc::writedoc;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{
        ChunkData, ChunkItem, ChunkItemExt, ChunkType, ChunkableModule, ChunkingContext, ChunksData,
    },
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReference, ModuleReferences, SingleOutputAssetReference},
};

use super::chunk_asset::ManifestAsyncModule;
use crate::{
    chunk::{
        data::EcmascriptChunkData, EcmascriptChunkItem, EcmascriptChunkItemContent,
        EcmascriptChunkPlaceable, EcmascriptChunkType,
    },
    utils::StringifyJs,
};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("loader".into())
}

/// The manifest loader item is shipped in the same chunk that uses the dynamic
/// `import()` expression.
///
/// Its responsibility is to load the manifest chunk from the server. The
/// dynamic import has been rewritten to import this manifest loader item,
/// which will load the manifest chunk from the server, which will load all
/// the chunks needed by the dynamic import. Finally, we'll be able to import
/// the module we're trying to dynamically import.
///
/// Splitting the dynamic import into a quickly generate-able manifest loader
/// item and a slow-to-generate manifest chunk allows for faster incremental
/// compilation. The traversal won't be performed until the dynamic import is
/// actually reached, instead of eagerly as part of the chunk that the dynamic
/// import appears in.
#[turbo_tasks::value]
pub struct ManifestLoaderChunkItem {
    manifest: ResolvedVc<ManifestAsyncModule>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ManifestLoaderChunkItem {
    #[turbo_tasks::function]
    pub fn new(
        manifest: ResolvedVc<ManifestAsyncModule>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Self> {
        Self::cell(ManifestLoaderChunkItem {
            manifest,
            chunking_context,
        })
    }

    #[turbo_tasks::function]
    pub fn chunks_data(&self) -> Vc<ChunksData> {
        let chunks = self.manifest.manifest_chunks();
        ChunkData::from_assets(self.chunking_context.output_root(), chunks)
    }

    #[turbo_tasks::function]
    pub fn asset_ident_for(module: Vc<Box<dyn ChunkableModule>>) -> Vc<AssetIdent> {
        module.ident().with_modifier(modifier())
    }
}

#[turbo_tasks::function]
fn manifest_loader_chunk_reference_description() -> Vc<RcStr> {
    Vc::cell("manifest loader chunk".into())
}

#[turbo_tasks::function]
fn chunk_data_reference_description() -> Vc<RcStr> {
    Vc::cell("chunk data reference".into())
}

#[turbo_tasks::value_impl]
impl ChunkItem for ManifestLoaderChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.manifest.module_ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn content_ident(&self) -> Vc<AssetIdent> {
        self.manifest.content_ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let this = self.await?;

        let chunks = this.manifest.manifest_chunks();

        let mut references: Vec<ResolvedVc<Box<dyn ModuleReference>>> = chunks
            .await?
            .iter()
            .map(|&chunk| async move {
                Ok(ResolvedVc::upcast(
                    SingleOutputAssetReference::new(
                        *chunk,
                        manifest_loader_chunk_reference_description(),
                    )
                    .to_resolved()
                    .await?,
                ))
            })
            .try_join()
            .await?;

        for chunk_data in &*self.chunks_data().await? {
            references.extend(
                chunk_data
                    .references()
                    .await?
                    .iter()
                    .map(|&output_asset| async move {
                        Ok(ResolvedVc::upcast(
                            SingleOutputAssetReference::new(
                                *output_asset,
                                chunk_data_reference_description(),
                            )
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

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ManifestLoaderChunkItem {
    #[turbo_tasks::function]
    async fn chunking_context(&self) -> Result<Vc<Box<dyn ChunkingContext>>> {
        Ok(*self.manifest.await?.chunking_context)
    }

    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = &*self.await?;
        let mut code = Vec::new();

        let manifest = this.manifest.await?;

        // We need several items in order for a dynamic import to fully load. First, we
        // need the chunk path of the manifest chunk, relative from the output root. The
        // chunk is a servable file, which will contain the manifest chunk item, which
        // will perform the actual chunk traversal and generate load statements.
        let chunks_server_data = &*self.chunks_data().await?.iter().try_join().await?;

        // We also need the manifest chunk item's id, which points to a CJS module that
        // exports a promise for all of the necessary chunk loads.
        let item_id = &*this
            .manifest
            .as_chunk_item(*ResolvedVc::upcast(manifest.chunking_context))
            .id()
            .await?;

        // Finally, we need the id of the module that we're actually trying to
        // dynamically import.
        let placeable =
            ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(manifest.inner)
                .await?
                .ok_or_else(|| anyhow!("asset is not placeable in ecmascript chunk"))?;
        let dynamic_id = &*placeable
            .as_chunk_item(*ResolvedVc::upcast(manifest.chunking_context))
            .id()
            .await?;

        // This is the code that will be executed when the dynamic import is reached.
        // It will load the manifest chunk, which will load all the chunks needed by
        // the dynamic import, and finally we'll be able to import the module we're
        // trying to dynamically import.
        // This is similar to what happens when the first evaluated chunk is executed
        // on first page load, but it's happening on-demand instead of eagerly.
        writedoc!(
            code,
            r#"
                __turbopack_export_value__((__turbopack_import__) => {{
                    return Promise.all({chunks_server_data}.map((chunk) => __turbopack_load__(chunk))).then(() => {{
                        return __turbopack_require__({item_id});
                    }}).then((chunks) => {{
                        return Promise.all(chunks.map((chunk) => __turbopack_load__(chunk)));
                    }}).then(() => {{
                        return __turbopack_import__({dynamic_id});
                    }});
                }});
            "#,
            chunks_server_data = StringifyJs(
                &chunks_server_data
                    .iter()
                    .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
                    .collect::<Vec<_>>()
            ),
            item_id = StringifyJs(item_id),
            dynamic_id = StringifyJs(dynamic_id),
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .into())
    }
}
