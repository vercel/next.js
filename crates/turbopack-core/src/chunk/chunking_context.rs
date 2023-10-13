use anyhow::Result;
use turbo_tasks::{Upcast, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{availability_info::AvailabilityInfo, ChunkableModule, EvaluatableAssets};
use crate::{
    chunk::{ChunkItem, ModuleId},
    environment::Environment,
    ident::AssetIdent,
    module::Module,
    output::{OutputAsset, OutputAssets},
};

/// A context for the chunking that influences the way chunks are created
#[turbo_tasks::value_trait]
pub trait ChunkingContext {
    fn context_path(self: Vc<Self>) -> Vc<FileSystemPath>;
    fn output_root(self: Vc<Self>) -> Vc<FileSystemPath>;

    // TODO remove this, a chunking context should not be bound to a specific
    // environment since this can change due to transitions in the module graph
    fn environment(self: Vc<Self>) -> Vc<Environment>;

    // TODO(alexkirsz) Remove this from the chunking context. This should be at the
    // discretion of chunking context implementors. However, we currently use this
    // in a couple of places in `turbopack-css`, so we need to remove that
    // dependency first.
    fn chunk_path(self: Vc<Self>, ident: Vc<AssetIdent>, extension: String) -> Vc<FileSystemPath>;

    // TODO(alexkirsz) Remove this from the chunking context.
    /// Reference Source Map Assets for chunks
    fn reference_chunk_source_maps(self: Vc<Self>, chunk: Vc<Box<dyn OutputAsset>>) -> Vc<bool>;

    fn can_be_in_same_chunk(
        self: Vc<Self>,
        asset_a: Vc<Box<dyn Module>>,
        asset_b: Vc<Box<dyn Module>>,
    ) -> Vc<bool>;

    /// Returns a URL (relative or absolute, depending on the asset prefix) to
    /// the static asset based on its `ident`.
    fn asset_url(self: Vc<Self>, ident: Vc<AssetIdent>) -> Result<Vc<String>>;

    fn asset_path(
        self: Vc<Self>,
        content_hash: String,
        original_asset_ident: Vc<AssetIdent>,
    ) -> Vc<FileSystemPath>;

    fn is_hot_module_replacement_enabled(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    fn layer(self: Vc<Self>) -> Vc<String> {
        Vc::cell("".to_string())
    }

    fn with_layer(self: Vc<Self>, layer: String) -> Vc<Self>;

    fn async_loader_chunk_item(
        &self,
        module: Vc<Box<dyn ChunkableModule>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn ChunkItem>>;
    fn async_loader_chunk_item_id(&self, module: Vc<Box<dyn ChunkableModule>>) -> Vc<ModuleId>;

    fn chunk_group(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<OutputAssets>;

    fn evaluated_chunk_group(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        evaluatable_assets: Vc<EvaluatableAssets>,
    ) -> Vc<OutputAssets>;

    async fn chunk_item_id_from_ident(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
    ) -> Result<Vc<ModuleId>> {
        let layer = self.layer();
        let ident = if !layer.await?.is_empty() {
            ident.with_modifier(layer)
        } else {
            ident
        };
        Ok(ModuleId::String(ident.to_string().await?.clone_value()).cell())
    }

    fn chunk_item_id(self: Vc<Self>, chunk_item: Vc<Box<dyn ChunkItem>>) -> Vc<ModuleId> {
        self.chunk_item_id_from_ident(chunk_item.asset_ident())
    }
}

pub trait ChunkingContextExt {
    fn root_chunk_group(self: Vc<Self>, module: Vc<Box<dyn ChunkableModule>>) -> Vc<OutputAssets>
    where
        Self: Send;
}

impl<T: ChunkingContext + Send + Upcast<Box<dyn ChunkingContext>>> ChunkingContextExt for T {
    fn root_chunk_group(self: Vc<Self>, module: Vc<Box<dyn ChunkableModule>>) -> Vc<OutputAssets> {
        self.chunk_group(module, Value::new(AvailabilityInfo::Root))
    }
}
