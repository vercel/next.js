use anyhow::Result;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, Upcast, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::DeterministicHash;

use super::{ChunkableModule, EvaluatableAssets, availability_info::AvailabilityInfo};
use crate::{
    asset::Asset,
    chunk::{ChunkItem, ChunkType, ModuleId},
    environment::Environment,
    ident::AssetIdent,
    module::Module,
    module_graph::{
        ModuleGraph, chunk_group_info::ChunkGroup, export_usage::ModuleExportUsage,
        module_batches::BatchingConfig,
    },
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
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
#[serde(rename_all = "kebab-case")]
pub enum MangleType {
    OptimalSize,
    Deterministic,
}

#[turbo_tasks::value(shared)]
#[derive(Debug, TaskInput, Clone, Copy, Hash, DeterministicHash)]
pub enum MinifyType {
    // TODO instead of adding a new property here,
    // refactor that to Minify(MinifyOptions) to allow defaults on MinifyOptions
    Minify { mangle: Option<MangleType> },
    NoMinify,
}

impl Default for MinifyType {
    fn default() -> Self {
        Self::Minify {
            mangle: Some(MangleType::OptimalSize),
        }
    }
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Default, TaskInput, Clone, Copy, Hash, DeterministicHash)]
pub enum SourceMapsType {
    /// Extracts source maps from input files and writes source maps for output files.
    #[default]
    Full,
    /// Ignores the existence of source maps and does not write source maps for output files.
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
#[derive(Clone, Copy)]
pub struct ChunkGroupResult {
    pub assets: ResolvedVc<OutputAssets>,
    pub referenced_assets: ResolvedVc<OutputAssets>,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value(shared)]
pub struct EntryChunkGroupResult {
    pub asset: ResolvedVc<Box<dyn OutputAsset>>,
    pub availability_info: AvailabilityInfo,
}

#[derive(
    Default,
    Debug,
    Clone,
    PartialEq,
    Eq,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    TaskInput,
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
    #[turbo_tasks::function]
    fn name(self: Vc<Self>) -> Vc<RcStr>;
    #[turbo_tasks::function]
    fn should_use_file_source_map_uris(self: Vc<Self>) -> Vc<bool>;
    /// The root path of the project
    #[turbo_tasks::function]
    fn root_path(self: Vc<Self>) -> Vc<FileSystemPath>;
    /// The output root path in the output filesystem
    #[turbo_tasks::function]
    fn output_root(self: Vc<Self>) -> Vc<FileSystemPath>;
    /// A relative path how to reach the root path from the output root. This is used to compute
    /// original paths at runtime relative to the output files. e. g. import.meta.url needs that.
    #[turbo_tasks::function]
    fn output_root_to_root_path(self: Vc<Self>) -> Vc<RcStr>;

    // TODO remove this, a chunking context should not be bound to a specific
    // environment since this can change due to transitions in the module graph
    #[turbo_tasks::function]
    fn environment(self: Vc<Self>) -> Vc<Environment>;

    /// The path to the folder where all chunks are placed. This can be used to compute relative
    /// paths.
    #[turbo_tasks::function]
    fn chunk_root_path(self: Vc<Self>) -> Vc<FileSystemPath>;

    // TODO(alexkirsz) Remove this from the chunking context. This should be at the
    // discretion of chunking context implementors. However, we currently use this
    // in a couple of places in `turbopack-css`, so we need to remove that
    // dependency first.
    #[turbo_tasks::function]
    fn chunk_path(
        self: Vc<Self>,
        asset: Option<Vc<Box<dyn Asset>>>,
        ident: Vc<AssetIdent>,
        content_hashing_prefix: Option<RcStr>,
        extension: RcStr,
    ) -> Vc<FileSystemPath>;

    /// Reference Source Map Assets for chunks
    #[turbo_tasks::function]
    fn reference_chunk_source_maps(self: Vc<Self>, chunk: Vc<Box<dyn OutputAsset>>) -> Vc<bool>;

    /// Include Source Maps for modules
    #[turbo_tasks::function]
    fn reference_module_source_maps(self: Vc<Self>, module: Vc<Box<dyn Module>>) -> Vc<bool>;

    /// Returns a URL (relative or absolute, depending on the asset prefix) to
    /// the static asset based on its `ident`.
    /// The `tag` is an arbitrary string that can be used to distinguish
    /// different usages of the same asset (e.g. different base paths).
    #[turbo_tasks::function]
    fn asset_url(self: Vc<Self>, ident: FileSystemPath, tag: Option<RcStr>) -> Result<Vc<RcStr>>;

    #[turbo_tasks::function]
    fn asset_path(
        self: Vc<Self>,
        content_hash: RcStr,
        original_asset_ident: Vc<AssetIdent>,
        tag: Option<RcStr>,
    ) -> Vc<FileSystemPath>;

    #[turbo_tasks::function]
    fn is_hot_module_replacement_enabled(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    #[turbo_tasks::function]
    fn chunking_configs(self: Vc<Self>) -> Vc<ChunkingConfigs> {
        Vc::cell(Default::default())
    }

    #[turbo_tasks::function]
    fn batching_config(self: Vc<Self>) -> Vc<BatchingConfig> {
        BatchingConfig::new(BatchingConfig {
            ..Default::default()
        })
    }

    /// Whether `ChunkingType::Traced` are used to create corresponding output assets for each
    /// traced module.
    #[turbo_tasks::function]
    fn is_tracing_enabled(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    /// Whether to use `MergeableModule` to merge modules if possible.
    #[turbo_tasks::function]
    fn is_module_merging_enabled(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    /// Whether to include information about the content of the chunk into the runtime, to allow
    /// more incremental loading of individual chunk items.
    #[turbo_tasks::function]
    fn is_dynamic_chunk_content_loading_enabled(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    #[turbo_tasks::function]
    fn minify_type(self: Vc<Self>) -> Vc<MinifyType> {
        MinifyType::NoMinify.cell()
    }

    #[turbo_tasks::function]
    fn async_loader_chunk_item(
        &self,
        module: Vc<Box<dyn ChunkableModule>>,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Vc<Box<dyn ChunkItem>>;
    #[turbo_tasks::function]
    fn async_loader_chunk_item_id(&self, module: Vc<Box<dyn ChunkableModule>>) -> Vc<ModuleId>;

    #[turbo_tasks::function]
    fn chunk_group(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Vc<ChunkGroupResult>;

    #[turbo_tasks::function]
    fn evaluated_chunk_group(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Vc<ChunkGroupResult>;

    /// Generates an output chunk that:
    /// * loads the given extra_chunks in addition to the generated chunks; and
    /// * evaluates the given assets; and
    /// * exports the result of evaluating the last module as a CommonJS default export.
    #[turbo_tasks::function]
    fn entry_chunk_group(
        self: Vc<Self>,
        path: FileSystemPath,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        extra_referenced_assets: Vc<OutputAssets>,
        availability_info: AvailabilityInfo,
    ) -> Result<Vc<EntryChunkGroupResult>>;

    #[turbo_tasks::function]
    async fn chunk_item_id_from_ident(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
    ) -> Result<Vc<ModuleId>>;

    #[turbo_tasks::function]
    fn chunk_item_id(self: Vc<Self>, module: Vc<Box<dyn ChunkItem>>) -> Vc<ModuleId> {
        self.chunk_item_id_from_ident(module.asset_ident())
    }
    #[turbo_tasks::function]
    fn chunk_item_id_from_module(self: Vc<Self>, module: Vc<Box<dyn Module>>) -> Vc<ModuleId> {
        self.chunk_item_id_from_ident(module.ident())
    }

    #[turbo_tasks::function]
    async fn module_export_usage(
        self: Vc<Self>,
        module: Vc<Box<dyn Module>>,
    ) -> Result<Vc<ModuleExportUsage>>;

    /// Returns whether debug IDs are enabled for this chunking context.
    #[turbo_tasks::function]
    fn debug_ids_enabled(self: Vc<Self>) -> Vc<bool>;
}

pub trait ChunkingContextExt {
    fn root_chunk_group(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<ChunkGroupResult>
    where
        Self: Send;

    fn root_chunk_group_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssetsWithReferenced>
    where
        Self: Send;

    fn evaluated_chunk_group_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Vc<OutputAssetsWithReferenced>
    where
        Self: Send;

    fn entry_chunk_group_asset(
        self: Vc<Self>,
        path: FileSystemPath,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        extra_referenced_assets: Vc<OutputAssets>,
        availability_info: AvailabilityInfo,
    ) -> Vc<Box<dyn OutputAsset>>
    where
        Self: Send;

    fn root_entry_chunk_group(
        self: Vc<Self>,
        path: FileSystemPath,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        extra_referenced_assets: Vc<OutputAssets>,
    ) -> Vc<EntryChunkGroupResult>
    where
        Self: Send;

    fn root_entry_chunk_group_asset(
        self: Vc<Self>,
        path: FileSystemPath,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        extra_referenced_assets: Vc<OutputAssets>,
    ) -> Vc<Box<dyn OutputAsset>>
    where
        Self: Send;

    fn chunk_group_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Vc<OutputAssetsWithReferenced>
    where
        Self: Send;
}

impl<T: ChunkingContext + Send + Upcast<Box<dyn ChunkingContext>>> ChunkingContextExt for T {
    fn root_chunk_group(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<ChunkGroupResult> {
        self.chunk_group(ident, chunk_group, module_graph, AvailabilityInfo::Root)
    }

    fn root_chunk_group_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssetsWithReferenced> {
        root_chunk_group_assets(
            Vc::upcast_non_strict(self),
            ident,
            chunk_group,
            module_graph,
        )
    }

    fn evaluated_chunk_group_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Vc<OutputAssetsWithReferenced> {
        evaluated_chunk_group_assets(
            Vc::upcast_non_strict(self),
            ident,
            chunk_group,
            module_graph,
            availability_info,
        )
    }

    fn entry_chunk_group_asset(
        self: Vc<Self>,
        path: FileSystemPath,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        extra_referenced_assets: Vc<OutputAssets>,
        availability_info: AvailabilityInfo,
    ) -> Vc<Box<dyn OutputAsset>> {
        entry_chunk_group_asset(
            Vc::upcast_non_strict(self),
            path,
            evaluatable_assets,
            module_graph,
            extra_chunks,
            extra_referenced_assets,
            availability_info,
        )
    }

    fn root_entry_chunk_group(
        self: Vc<Self>,
        path: FileSystemPath,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        extra_referenced_assets: Vc<OutputAssets>,
    ) -> Vc<EntryChunkGroupResult> {
        self.entry_chunk_group(
            path,
            evaluatable_assets,
            module_graph,
            extra_chunks,
            extra_referenced_assets,
            AvailabilityInfo::Root,
        )
    }

    fn root_entry_chunk_group_asset(
        self: Vc<Self>,
        path: FileSystemPath,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
        extra_chunks: Vc<OutputAssets>,
        extra_referenced_assets: Vc<OutputAssets>,
    ) -> Vc<Box<dyn OutputAsset>> {
        entry_chunk_group_asset(
            Vc::upcast_non_strict(self),
            path,
            evaluatable_assets,
            module_graph,
            extra_chunks,
            extra_referenced_assets,
            AvailabilityInfo::Root,
        )
    }

    fn chunk_group_assets(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        chunk_group: ChunkGroup,
        module_graph: Vc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Vc<OutputAssetsWithReferenced> {
        chunk_group_assets(
            Vc::upcast_non_strict(self),
            ident,
            chunk_group,
            module_graph,
            availability_info,
        )
    }
}

#[turbo_tasks::function]
async fn root_chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    ident: Vc<AssetIdent>,
    chunk_group: ChunkGroup,
    module_graph: Vc<ModuleGraph>,
) -> Result<Vc<OutputAssetsWithReferenced>> {
    let root_chunk_group = chunking_context
        .root_chunk_group(ident, chunk_group, module_graph)
        .await?;
    Ok(OutputAssetsWithReferenced {
        assets: root_chunk_group.assets,
        referenced_assets: root_chunk_group.referenced_assets,
    }
    .cell())
}

#[turbo_tasks::function]
async fn evaluated_chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    ident: Vc<AssetIdent>,
    chunk_group: ChunkGroup,
    module_graph: Vc<ModuleGraph>,
    availability_info: AvailabilityInfo,
) -> Result<Vc<OutputAssetsWithReferenced>> {
    let evaluated_chunk_group = chunking_context
        .evaluated_chunk_group(ident, chunk_group, module_graph, availability_info)
        .await?;
    Ok(OutputAssetsWithReferenced {
        assets: evaluated_chunk_group.assets,
        referenced_assets: evaluated_chunk_group.referenced_assets,
    }
    .cell())
}

#[turbo_tasks::function]
async fn entry_chunk_group_asset(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    path: FileSystemPath,
    evaluatable_assets: Vc<EvaluatableAssets>,
    module_graph: Vc<ModuleGraph>,
    extra_chunks: Vc<OutputAssets>,
    extra_referenced_assets: Vc<OutputAssets>,
    availability_info: AvailabilityInfo,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    Ok(*chunking_context
        .entry_chunk_group(
            path,
            evaluatable_assets,
            module_graph,
            extra_chunks,
            extra_referenced_assets,
            availability_info,
        )
        .await?
        .asset)
}

#[turbo_tasks::function]
async fn chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    ident: Vc<AssetIdent>,
    chunk_group: ChunkGroup,
    module_graph: Vc<ModuleGraph>,
    availability_info: AvailabilityInfo,
) -> Result<Vc<OutputAssetsWithReferenced>> {
    let chunk_group = chunking_context
        .chunk_group(ident, chunk_group, module_graph, availability_info)
        .await?;
    Ok(OutputAssetsWithReferenced {
        assets: chunk_group.assets,
        referenced_assets: chunk_group.referenced_assets,
    }
    .cell())
}
