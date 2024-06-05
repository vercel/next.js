use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, RcStr, TaskInput, Upcast, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::DeterministicHash;

use super::{availability_info::AvailabilityInfo, ChunkableModule, EvaluatableAssets};
use crate::{
    chunk::{ChunkItem, ModuleId},
    environment::Environment,
    ident::AssetIdent,
    output::{OutputAsset, OutputAssets},
};

#[derive(
    Debug,
    Default,
    TaskInput,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    DeterministicHash,
)]
pub enum MinifyType {
    #[default]
    Minify,
    NoMinify,
}

#[turbo_tasks::value(shared)]
pub struct ChunkGroupResult {
    pub assets: Vc<OutputAssets>,
    pub availability_info: AvailabilityInfo,
}

/// A context for the chunking that influences the way chunks are created
#[turbo_tasks::value_trait]
pub trait ChunkingContext {
    fn name(self: Vc<Self>) -> Vc<RcStr>;
    fn context_path(self: Vc<Self>) -> Vc<FileSystemPath>;
    fn output_root(self: Vc<Self>) -> Vc<FileSystemPath>;

    // TODO remove this, a chunking context should not be bound to a specific
    // environment since this can change due to transitions in the module graph
    fn environment(self: Vc<Self>) -> Vc<Environment>;

    // TODO(alexkirsz) Remove this from the chunking context. This should be at the
    // discretion of chunking context implementors. However, we currently use this
    // in a couple of places in `turbopack-css`, so we need to remove that
    // dependency first.
    fn chunk_path(self: Vc<Self>, ident: Vc<AssetIdent>, extension: RcStr) -> Vc<FileSystemPath>;

    // TODO(alexkirsz) Remove this from the chunking context.
    /// Reference Source Map Assets for chunks
    fn reference_chunk_source_maps(self: Vc<Self>, chunk: Vc<Box<dyn OutputAsset>>) -> Vc<bool>;

    /// Returns a URL (relative or absolute, depending on the asset prefix) to
    /// the static asset based on its `ident`.
    fn asset_url(self: Vc<Self>, ident: Vc<AssetIdent>) -> Result<Vc<RcStr>>;

    fn asset_path(
        self: Vc<Self>,
        content_hash: RcStr,
        original_asset_ident: Vc<AssetIdent>,
    ) -> Vc<FileSystemPath>;

    fn is_hot_module_replacement_enabled(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

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
    ) -> Vc<ChunkGroupResult>;

    fn evaluated_chunk_group(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<ChunkGroupResult>;

    async fn chunk_item_id_from_ident(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
    ) -> Result<Vc<ModuleId>> {
        Ok(ModuleId::String(ident.to_string().await?.clone_value()).cell())
    }

    fn chunk_item_id(self: Vc<Self>, chunk_item: Vc<Box<dyn ChunkItem>>) -> Vc<ModuleId> {
        self.chunk_item_id_from_ident(chunk_item.asset_ident())
    }
}

pub trait ChunkingContextExt {
    fn root_chunk_group(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
    ) -> Vc<ChunkGroupResult>
    where
        Self: Send;

    fn root_chunk_group_assets(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
    ) -> Vc<OutputAssets>
    where
        Self: Send;

    fn evaluated_chunk_group_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<OutputAssets>
    where
        Self: Send;

    fn chunk_group_assets(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<OutputAssets>
    where
        Self: Send;
}

impl<T: ChunkingContext + Send + Upcast<Box<dyn ChunkingContext>>> ChunkingContextExt for T {
    fn root_chunk_group(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
    ) -> Vc<ChunkGroupResult> {
        self.chunk_group(module, Value::new(AvailabilityInfo::Root))
    }

    fn root_chunk_group_assets(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
    ) -> Vc<OutputAssets> {
        root_chunk_group_assets(Vc::upcast(self), module)
    }

    fn evaluated_chunk_group_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<OutputAssets> {
        evaluated_chunk_group_assets(
            Vc::upcast(self),
            ident,
            evaluatable_assets,
            availability_info,
        )
    }

    fn chunk_group_assets(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<OutputAssets> {
        chunk_group_assets(Vc::upcast(self), module, availability_info)
    }
}

#[turbo_tasks::function]
async fn root_chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    module: Vc<Box<dyn ChunkableModule>>,
) -> Result<Vc<OutputAssets>> {
    Ok(chunking_context.root_chunk_group(module).await?.assets)
}

#[turbo_tasks::function]
async fn evaluated_chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    ident: Vc<AssetIdent>,
    evaluatable_assets: Vc<EvaluatableAssets>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<OutputAssets>> {
    Ok(chunking_context
        .evaluated_chunk_group(ident, evaluatable_assets, availability_info)
        .await?
        .assets)
}

#[turbo_tasks::function]
async fn chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    module: Vc<Box<dyn ChunkableModule>>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<OutputAssets>> {
    Ok(chunking_context
        .chunk_group(module, availability_info)
        .await?
        .assets)
}
