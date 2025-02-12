use anyhow::Result;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, ResolvedVc, TaskInput, Upcast, Value, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::DeterministicHash;

use super::{availability_info::AvailabilityInfo, ChunkableModule, EvaluatableAssets};
use crate::{
    chunk::{ChunkItem, ChunkType, ChunkableModules, ModuleId},
    environment::Environment,
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssets},
};

#[derive(
    Debug,
    TaskInput,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    DeterministicHash,
    NonLocalValue,
)]
pub enum MinifyType {
    Minify { mangle: bool },
    NoMinify,
}

impl Default for MinifyType {
    fn default() -> Self {
        Self::Minify { mangle: true }
    }
}

#[derive(
    Debug,
    Default,
    TaskInput,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    DeterministicHash,
    NonLocalValue,
)]
pub enum SourceMapsType {
    /// Extracts source maps from input files and writes source maps for output files.
    #[default]
    Full,
    /// Ignores the existance of source maps and does not write source maps for output files.
    None,
}

#[derive(
    Debug,
    TaskInput,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    DeterministicHash,
    NonLocalValue,
)]
pub enum ChunkGroupType {
    Entry,
    Evaluated,
}

#[turbo_tasks::value(shared)]
pub struct ChunkGroupResult {
    pub assets: ResolvedVc<OutputAssets>,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value(shared)]
pub struct EntryChunkGroupResult {
    pub asset: ResolvedVc<Box<dyn OutputAsset>>,
    pub availability_info: AvailabilityInfo,
}

#[derive(
    Default, Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs, NonLocalValue,
)]
pub struct ChunkingConfig {
    /// Try to avoid creating more than 1 chunk smaller than this size.
    /// It merges multiple small chunks into bigger ones to avoid that.
    pub min_chunk_size: usize,

    /// Try to avoid creating more than this number of chunks per group.
    /// It merges multiple chunks into bigger ones to avoid that.
    pub max_chunk_count_per_group: usize,

    /// Never merges chunks bigger than this size with other chunks.
    /// This makes sure that code in big chunks is not duplicated in multiple chunks.
    pub max_merge_chunk_size: usize,

    #[allow(dead_code)]
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value(transparent)]
pub struct ChunkingConfigs(FxHashMap<ResolvedVc<Box<dyn ChunkType>>, ChunkingConfig>);

/// A context for the chunking that influences the way chunks are created
#[turbo_tasks::value_trait]
pub trait ChunkingContext {
    fn name(self: Vc<Self>) -> Vc<RcStr>;
    fn should_use_file_source_map_uris(self: Vc<Self>) -> Vc<bool>;
    // The root path of the project
    fn root_path(self: Vc<Self>) -> Vc<FileSystemPath>;
    // The output root path in the output filesystem
    fn output_root(self: Vc<Self>) -> Vc<FileSystemPath>;
    // A relative path how to reach the root path from the output root. This is used to compute
    // original paths at runtime relative to the output files. e. g. import.meta.url needs that.
    fn output_root_to_root_path(self: Vc<Self>) -> Vc<RcStr>;

    // TODO remove this, a chunking context should not be bound to a specific
    // environment since this can change due to transitions in the module graph
    fn environment(self: Vc<Self>) -> Vc<Environment>;

    // TODO(alexkirsz) Remove this from the chunking context. This should be at the
    // discretion of chunking context implementors. However, we currently use this
    // in a couple of places in `turbopack-css`, so we need to remove that
    // dependency first.
    fn chunk_path(self: Vc<Self>, ident: Vc<AssetIdent>, extension: RcStr) -> Vc<FileSystemPath>;

    /// Reference Source Map Assets for chunks
    fn reference_chunk_source_maps(self: Vc<Self>, chunk: Vc<Box<dyn OutputAsset>>) -> Vc<bool>;

    /// Include Source Maps for modules
    fn reference_module_source_maps(self: Vc<Self>, module: Vc<Box<dyn Module>>) -> Vc<bool>;

    /// Returns a URL (relative or absolute, depending on the asset prefix) to
    /// the static asset based on its `ident`.
    fn asset_url(self: Vc<Self>, ident: Vc<FileSystemPath>) -> Result<Vc<RcStr>>;

    fn asset_path(
        self: Vc<Self>,
        content_hash: RcStr,
        original_asset_ident: Vc<AssetIdent>,
    ) -> Vc<FileSystemPath>;

    fn is_hot_module_replacement_enabled(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    fn chunking_configs(self: Vc<Self>) -> Vc<ChunkingConfigs> {
        Vc::cell(Default::default())
    }

    fn is_smart_chunk_enabled(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    fn is_tracing_enabled(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    fn async_loader_chunk_item(
        &self,
        module: Vc<Box<dyn ChunkableModule>>,
        module_graph: Vc<ModuleGraph>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn ChunkItem>>;
    fn async_loader_chunk_item_id(&self, module: Vc<Box<dyn ChunkableModule>>) -> Vc<ModuleId>;

    fn chunk_group(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        module: Vc<Box<dyn ChunkableModule>>,
        module_graph: Vc<ModuleGraph>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<ChunkGroupResult>;

    fn chunk_group_multiple(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        modules: Vc<ChunkableModules>,
        module_graph: Vc<ModuleGraph>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<ChunkGroupResult>;

    fn evaluated_chunk_group(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<ChunkGroupResult>;

    /// Generates an output chunk that:
    /// * loads the given extra_chunks in addition to the generated chunks; and
    /// * evaluates the given assets; and
    /// * exports the result of evaluating the given module as a CommonJS default export.
    fn entry_chunk_group(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        module: Vc<Box<dyn Module>>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<EntryChunkGroupResult>>;

    async fn chunk_item_id_from_ident(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
    ) -> Result<Vc<ModuleId>>;

    fn chunk_item_id(self: Vc<Self>, chunk_item: Vc<Box<dyn ChunkItem>>) -> Vc<ModuleId> {
        self.chunk_item_id_from_ident(chunk_item.asset_ident())
    }
}

pub trait ChunkingContextExt {
    fn root_chunk_group(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<ChunkGroupResult>
    where
        Self: Send;

    fn root_chunk_group_assets(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssets>
    where
        Self: Send;

    fn evaluated_chunk_group_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<OutputAssets>
    where
        Self: Send;

    fn entry_chunk_group_asset(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        module: Vc<Box<dyn Module>>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn OutputAsset>>
    where
        Self: Send;

    fn root_entry_chunk_group(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        module: Vc<Box<dyn Module>>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        evaluatable_assets: Vc<EvaluatableAssets>,
    ) -> Vc<EntryChunkGroupResult>
    where
        Self: Send;

    fn root_entry_chunk_group_asset(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        module: Vc<Box<dyn Module>>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        evaluatable_assets: Vc<EvaluatableAssets>,
    ) -> Vc<Box<dyn OutputAsset>>
    where
        Self: Send;

    fn chunk_group_assets(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        module_graph: Vc<ModuleGraph>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<OutputAssets>
    where
        Self: Send;
}

impl<T: ChunkingContext + Send + Upcast<Box<dyn ChunkingContext>>> ChunkingContextExt for T {
    fn root_chunk_group(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<ChunkGroupResult> {
        self.chunk_group(
            module.ident(),
            module,
            module_graph,
            Value::new(AvailabilityInfo::Root),
        )
    }

    fn root_chunk_group_assets(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssets> {
        root_chunk_group_assets(Vc::upcast(self), module, module_graph)
    }

    fn evaluated_chunk_group_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<OutputAssets> {
        evaluated_chunk_group_assets(
            Vc::upcast(self),
            ident,
            evaluatable_assets,
            module_graph,
            availability_info,
        )
    }

    fn entry_chunk_group_asset(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        module: Vc<Box<dyn Module>>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn OutputAsset>> {
        entry_chunk_group_asset(
            path,
            Vc::upcast(self),
            module,
            evaluatable_assets,
            module_graph,
            extra_chunks,
            availability_info,
        )
    }

    fn root_entry_chunk_group(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        module: Vc<Box<dyn Module>>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        evaluatable_assets: Vc<EvaluatableAssets>,
    ) -> Vc<EntryChunkGroupResult> {
        self.entry_chunk_group(
            path,
            module,
            evaluatable_assets,
            module_graph,
            extra_chunks,
            Value::new(AvailabilityInfo::Root),
        )
    }

    fn root_entry_chunk_group_asset(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        module: Vc<Box<dyn Module>>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        evaluatable_assets: Vc<EvaluatableAssets>,
    ) -> Vc<Box<dyn OutputAsset>> {
        entry_chunk_group_asset(
            path,
            Vc::upcast(self),
            module,
            evaluatable_assets,
            module_graph,
            extra_chunks,
            Value::new(AvailabilityInfo::Root),
        )
    }

    fn chunk_group_assets(
        self: Vc<Self>,
        module: Vc<Box<dyn ChunkableModule>>,
        module_graph: Vc<ModuleGraph>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<OutputAssets> {
        chunk_group_assets(Vc::upcast(self), module, module_graph, availability_info)
    }
}

#[turbo_tasks::function]
async fn root_chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    module: Vc<Box<dyn ChunkableModule>>,
    module_graph: Vc<ModuleGraph>,
) -> Result<Vc<OutputAssets>> {
    Ok(*chunking_context
        .root_chunk_group(module, module_graph)
        .await?
        .assets)
}

#[turbo_tasks::function]
async fn evaluated_chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    ident: Vc<AssetIdent>,
    evaluatable_assets: Vc<EvaluatableAssets>,
    module_graph: Vc<ModuleGraph>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<OutputAssets>> {
    Ok(*chunking_context
        .evaluated_chunk_group(ident, evaluatable_assets, module_graph, availability_info)
        .await?
        .assets)
}

#[turbo_tasks::function]
async fn entry_chunk_group_asset(
    path: Vc<FileSystemPath>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    module: Vc<Box<dyn Module>>,
    evaluatable_assets: Vc<EvaluatableAssets>,
    module_graph: Vc<ModuleGraph>,
    extra_chunks: Vc<OutputAssets>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    Ok(*chunking_context
        .entry_chunk_group(
            path,
            module,
            evaluatable_assets,
            module_graph,
            extra_chunks,
            availability_info,
        )
        .await?
        .asset)
}

#[turbo_tasks::function]
async fn chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    module: Vc<Box<dyn ChunkableModule>>,
    module_graph: Vc<ModuleGraph>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<OutputAssets>> {
    Ok(*chunking_context
        .chunk_group(module.ident(), module, module_graph, availability_info)
        .await?
        .assets)
}
