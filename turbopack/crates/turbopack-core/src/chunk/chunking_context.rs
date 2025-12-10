use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, Upcast, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::DeterministicHash;

use crate::{
    asset::Asset,
    chunk::{
        ChunkItem, ChunkType, ChunkableModule, EvaluatableAssets, ModuleId,
        availability_info::AvailabilityInfo,
    },
    environment::Environment,
    ident::AssetIdent,
    module::Module,
    module_graph::{
        ModuleGraph, binding_usage_info::ModuleExportUsage, chunk_group_info::ChunkGroup,
        module_batches::BatchingConfig,
    },
    output::{
        ExpandOutputAssetsInput, OutputAsset, OutputAssets, OutputAssetsReferences,
        OutputAssetsWithReferenced, expand_output_assets,
    },
    reference::ModuleReference,
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
    Encode,
    Decode,
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
    /// Ignores existing input source maps, but writes source maps for output files.
    Partial,
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
    Encode,
    Decode,
)]
pub enum ChunkGroupType {
    Entry,
    Evaluated,
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct ChunkGroupResult {
    pub assets: ResolvedVc<OutputAssets>,
    pub referenced_assets: ResolvedVc<OutputAssets>,
    pub references: ResolvedVc<OutputAssetsReferences>,
    pub availability_info: AvailabilityInfo,
}

impl ChunkGroupResult {
    pub fn empty() -> Vc<Self> {
        ChunkGroupResult {
            assets: ResolvedVc::cell(vec![]),
            referenced_assets: ResolvedVc::cell(vec![]),
            references: ResolvedVc::cell(vec![]),
            availability_info: AvailabilityInfo::root(),
        }
        .cell()
    }

    pub fn empty_resolved() -> ResolvedVc<Self> {
        ChunkGroupResult {
            assets: ResolvedVc::cell(vec![]),
            referenced_assets: ResolvedVc::cell(vec![]),
            references: ResolvedVc::cell(vec![]),
            availability_info: AvailabilityInfo::root(),
        }
        .resolved_cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkGroupResult {
    #[turbo_tasks::function]
    pub async fn output_assets_with_referenced(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        Ok(OutputAssetsWithReferenced {
            assets: self.assets,
            referenced_assets: self.referenced_assets,
            references: self.references,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn concatenate(&self, next: Vc<Self>) -> Result<Vc<Self>> {
        let next = next.await?;
        Ok(ChunkGroupResult {
            assets: self.assets.concatenate(*next.assets).to_resolved().await?,
            referenced_assets: self
                .referenced_assets
                .concatenate(*next.referenced_assets)
                .to_resolved()
                .await?,
            references: self
                .references
                .concatenate(*next.references)
                .to_resolved()
                .await?,
            availability_info: next.availability_info,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn all_assets(&self) -> Result<Vc<OutputAssets>> {
        Ok(Vc::cell(
            expand_output_assets(
                self.assets
                    .await?
                    .into_iter()
                    .chain(self.referenced_assets.await?.into_iter())
                    .copied()
                    .map(ExpandOutputAssetsInput::Asset)
                    .chain(
                        self.references
                            .await?
                            .into_iter()
                            .copied()
                            .map(ExpandOutputAssetsInput::Reference),
                    ),
                false,
            )
            .await?,
        ))
    }

    /// Returns only primary asset entries. Doesn't expand OutputAssets. Doesn't return referenced
    /// assets.
    #[turbo_tasks::function]
    pub fn primary_assets(&self) -> Vc<OutputAssets> {
        *self.assets
    }

    #[turbo_tasks::function]
    pub async fn referenced_assets(&self) -> Result<Vc<OutputAssets>> {
        Ok(Vc::cell(
            expand_output_assets(
                self.referenced_assets
                    .await?
                    .into_iter()
                    .copied()
                    .map(ExpandOutputAssetsInput::Asset)
                    .chain(
                        self.references
                            .await?
                            .into_iter()
                            .copied()
                            .map(ExpandOutputAssetsInput::Reference),
                    ),
                false,
            )
            .await?,
        ))
    }
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
    Encode,
    Decode,
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

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Copy, Hash, TaskInput, Default)]
pub enum SourceMapSourceType {
    AbsoluteFileUri,
    RelativeUri,
    #[default]
    TurbopackUri,
}

/// A context for the chunking that influences the way chunks are created
#[turbo_tasks::value_trait]
pub trait ChunkingContext {
    #[turbo_tasks::function]
    fn name(self: Vc<Self>) -> Vc<RcStr>;
    #[turbo_tasks::function]
    fn source_map_source_type(self: Vc<Self>) -> Vc<SourceMapSourceType>;
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

    /// Whether async modules should create an new availability boundary and therefore nested async
    /// modules include less modules. Enabling this will lead to better optimized async chunks,
    /// but it will require to compute all possible paths in the application, which might lead to
    /// many combinations.
    #[turbo_tasks::function]
    fn is_nested_async_availability_enabled(self: Vc<Self>) -> Vc<bool> {
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
    fn should_use_absolute_url_references(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
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

    #[turbo_tasks::function]
    async fn is_reference_unused(
        self: Vc<Self>,
        reference: Vc<Box<dyn ModuleReference>>,
    ) -> Result<Vc<bool>>;

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

    /// Computes the relative path from the chunk output root to the project root.
    ///
    /// This is used to compute relative paths for source maps in certain configurations.
    fn relative_path_from_chunk_root_to_project_root(self: Vc<Self>) -> Vc<RcStr>
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
        self.chunk_group(ident, chunk_group, module_graph, AvailabilityInfo::root())
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
            AvailabilityInfo::root(),
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
            AvailabilityInfo::root(),
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

    fn relative_path_from_chunk_root_to_project_root(self: Vc<Self>) -> Vc<RcStr> {
        relative_path_from_chunk_root_to_project_root(Vc::upcast_non_strict(self))
    }
}

#[turbo_tasks::function]
async fn relative_path_from_chunk_root_to_project_root(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<RcStr>> {
    // Example,
    //   project root: /project/root
    //   output root: /project/root/dist
    //   chunk root path: /project/root/dist/ssr/chunks
    //   output_root_to_chunk_root: ../
    //
    // Example2,
    //   project root: /project/root
    //   output root: /project/out
    //   chunk root path: /project/out/ssr/chunks
    //   output_root_to_chunk_root: ../root
    //
    // From that we want to return  ../../../root to get from a path in `chunks` to a path in the
    // project root.

    let chunk_root_path = chunking_context.chunk_root_path().await?;
    let output_root = chunking_context.output_root().await?;
    let chunk_to_output_root = chunk_root_path.get_relative_path_to(&output_root);
    let Some(chunk_to_output_root) = chunk_to_output_root else {
        bail!(
            "expected chunk_root_path: {chunk_root_path} to be inside of output_root: \
             {output_root}",
            chunk_root_path = chunk_root_path.value_to_string().await?,
            output_root = output_root.value_to_string().await?
        );
    };
    let output_root_to_chunk_root_path = chunking_context.output_root_to_root_path().await?;

    // Note we cannot use `normalize_path` here since it rejects paths that start with `../`
    Ok(Vc::cell(
        format!(
            "{}/{}",
            chunk_to_output_root, output_root_to_chunk_root_path
        )
        .into(),
    ))
}

#[turbo_tasks::function]
fn root_chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    ident: Vc<AssetIdent>,
    chunk_group: ChunkGroup,
    module_graph: Vc<ModuleGraph>,
) -> Vc<OutputAssetsWithReferenced> {
    chunking_context
        .root_chunk_group(ident, chunk_group, module_graph)
        .output_assets_with_referenced()
}

#[turbo_tasks::function]
fn evaluated_chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    ident: Vc<AssetIdent>,
    chunk_group: ChunkGroup,
    module_graph: Vc<ModuleGraph>,
    availability_info: AvailabilityInfo,
) -> Vc<OutputAssetsWithReferenced> {
    chunking_context
        .evaluated_chunk_group(ident, chunk_group, module_graph, availability_info)
        .output_assets_with_referenced()
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
fn chunk_group_assets(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    ident: Vc<AssetIdent>,
    chunk_group: ChunkGroup,
    module_graph: Vc<ModuleGraph>,
    availability_info: AvailabilityInfo,
) -> Vc<OutputAssetsWithReferenced> {
    chunking_context
        .chunk_group(ident, chunk_group, module_graph, availability_info)
        .output_assets_with_referenced()
}
