use anyhow::Result;
use turbo_tasks::{RcStr, Value, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, ChunkableModule, ChunkingContext, ChunkingContextExt,
    },
    ident::AssetIdent,
    module::Module,
    output::OutputAssets,
    reference::{ModuleReferences, SingleOutputAssetReference},
};

use super::chunk_item::ManifestChunkItem;
use crate::chunk::{EcmascriptChunkPlaceable, EcmascriptExports};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("manifest chunk".into())
}

/// The manifest module is deferred until requested by the manifest loader
/// item when the dynamic `import()` expression is reached. Its responsibility
/// is to generate a Promise that will resolve only after all the necessary
/// chunks needed by the dynamic import are loaded by the client.
///
/// Splitting the dynamic import into a quickly generate-able manifest loader
/// item and a slow-to-generate manifest chunk allows for faster incremental
/// compilation. The traversal won't be performed until the dynamic import is
/// actually reached, instead of eagerly as part of the chunk that the dynamic
/// import appears in.
#[turbo_tasks::value(shared)]
pub struct ManifestAsyncModule {
    pub inner: Vc<Box<dyn ChunkableModule>>,
    pub chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value_impl]
impl ManifestAsyncModule {
    #[turbo_tasks::function]
    pub fn new(
        module: Vc<Box<dyn ChunkableModule>>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Self> {
        Self::cell(ManifestAsyncModule {
            inner: module,
            chunking_context,
            availability_info: availability_info.into_value(),
        })
    }

    #[turbo_tasks::function]
    pub(super) async fn chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        Ok(this
            .chunking_context
            .chunk_group_assets(Vc::upcast(this.inner), Value::new(this.availability_info)))
    }

    #[turbo_tasks::function]
    pub async fn manifest_chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        if let Some(chunk_items) = this.availability_info.available_chunk_items() {
            if chunk_items
                .get(
                    this.inner
                        .as_chunk_item(Vc::upcast(this.chunking_context))
                        .resolve()
                        .await?,
                )
                .await?
                .is_some()
            {
                return Ok(Vc::cell(vec![]));
            }
        }
        Ok(this
            .chunking_context
            .chunk_group_assets(Vc::upcast(self), Value::new(this.availability_info)))
    }

    #[turbo_tasks::function]
    pub fn module_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    pub async fn content_ident(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = self.inner.ident();
        if let Some(available_modules) = self.availability_info.available_chunk_items() {
            ident =
                ident.with_modifier(Vc::cell(available_modules.hash().await?.to_string().into()));
        }
        Ok(ident)
    }
}

#[turbo_tasks::function]
fn manifest_chunk_reference_description() -> Vc<RcStr> {
    Vc::cell("manifest chunk".into())
}

#[turbo_tasks::value_impl]
impl Module for ManifestAsyncModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.inner.ident().with_modifier(modifier())
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
                        manifest_chunk_reference_description(),
                    ))
                })
                .collect(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ManifestAsyncModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        todo!()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ManifestAsyncModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        Ok(Vc::upcast(
            ManifestChunkItem {
                chunking_context,
                manifest: self,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ManifestAsyncModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }
}
