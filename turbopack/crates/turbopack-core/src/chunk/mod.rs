pub mod availability_info;
pub mod available_modules;
pub mod chunk_group;
pub(crate) mod chunk_item_batch;
pub mod chunking;
pub(crate) mod chunking_context;
pub(crate) mod containment_tree;
pub(crate) mod data;
pub(crate) mod evaluate;
pub mod module_id_strategies;
pub mod optimize;

use std::fmt::Display;

use anyhow::Result;
use auto_hash_map::AutoSet;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, NonLocalValue, ResolvedVc, TaskInput, Upcast, ValueToString, Vc,
    debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbo_tasks_hash::DeterministicHash;

pub use self::{
    chunk_item_batch::{
        ChunkItemBatchGroup, ChunkItemBatchWithAsyncModuleInfo,
        ChunkItemOrBatchWithAsyncModuleInfo, batch_info,
    },
    chunking_context::{
        ChunkGroupResult, ChunkGroupType, ChunkingConfig, ChunkingConfigs, ChunkingContext,
        ChunkingContextExt, EntryChunkGroupResult, MangleType, MinifyType, SourceMapsType,
    },
    data::{ChunkData, ChunkDataOption, ChunksData},
    evaluate::{EvaluatableAsset, EvaluatableAssetExt, EvaluatableAssets},
};
use crate::{
    asset::Asset,
    chunk::availability_info::AvailabilityInfo,
    ident::AssetIdent,
    module::Module,
    module_graph::{
        ModuleGraph,
        module_batch::{ChunkableModuleOrBatch, ModuleBatchGroup},
    },
    output::OutputAssets,
    reference::ModuleReference,
    resolve::ExportUsage,
};

/// A module id, which can be a number or string
#[turbo_tasks::value(shared, operation)]
#[derive(Debug, Clone, Hash, Ord, PartialOrd, DeterministicHash)]
#[serde(untagged)]
pub enum ModuleId {
    Number(u64),
    String(RcStr),
}

impl Display for ModuleId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModuleId::Number(i) => write!(f, "{i}"),
            ModuleId::String(s) => write!(f, "{s}"),
        }
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ModuleId {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.to_string().into())
    }
}

impl ModuleId {
    pub fn parse(id: &str) -> Result<ModuleId> {
        Ok(match id.parse::<u64>() {
            Ok(i) => ModuleId::Number(i),
            Err(_) => ModuleId::String(id.into()),
        })
    }
}

/// A list of module ids.
#[turbo_tasks::value(transparent, shared)]
pub struct ModuleIds(Vec<ResolvedVc<ModuleId>>);

/// A [Module] that can be converted into a [Chunk].
#[turbo_tasks::value_trait]
pub trait ChunkableModule: Module + Asset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: Vc<Self>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn ChunkItem>>;
}

#[turbo_tasks::value(transparent)]
pub struct ChunkableModules(Vec<ResolvedVc<Box<dyn ChunkableModule>>>);

#[turbo_tasks::value_impl]
impl ChunkableModules {
    #[turbo_tasks::function]
    pub fn interned(modules: Vec<ResolvedVc<Box<dyn ChunkableModule>>>) -> Vc<Self> {
        Vc::cell(modules)
    }
}

/// A [Module] that can be merged with other [Module]s (to perform scope hoisting)
// TODO currently this is only used for ecmascript modules, and with the current API cannot be used
// with other module types (as a MergeableModule cannot prevent itself from being merged with other
// module types)
#[turbo_tasks::value_trait]
pub trait MergeableModule: Module + Asset {
    /// Even though MergeableModule is implemented, this allows a dynamic condition to determine
    /// mergeability
    #[turbo_tasks::function]
    fn is_mergeable(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(true)
    }

    /// Create a new module representing the merged content of the given `modules`.
    ///
    /// Group entry points are not referenced by any other module in the group. This list is needed
    /// because the merged module is created by recursively inlining modules when they are imported,
    /// but this process has to start somewhere (= with these entry points).
    #[turbo_tasks::function]
    fn merge(
        self: Vc<Self>,
        modules: Vc<MergeableModulesExposed>,
        entry_points: Vc<MergeableModules>,
    ) -> Vc<Box<dyn ChunkableModule>>;
}
#[turbo_tasks::value(transparent)]
pub struct MergeableModules(Vec<ResolvedVc<Box<dyn MergeableModule>>>);

#[turbo_tasks::value_impl]
impl MergeableModules {
    #[turbo_tasks::function]
    pub fn interned(modules: Vec<ResolvedVc<Box<dyn MergeableModule>>>) -> Vc<Self> {
        Vc::cell(modules)
    }
}

/// Whether a given module needs to be exposed (depending on how it is imported by other modules)
#[derive(
    Copy,
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    TaskInput,
    Hash,
)]
pub enum MergeableModuleExposure {
    // This module is only used from within the current group, and only individual exports are
    // used (and no namespace object is required).
    None,
    // This module is only used from within the current group, and but the namespace object is
    // needed.
    Internal,
    // The exports of this module are read from outside this group (necessitating a namespace
    // object anyway).
    External,
}

#[turbo_tasks::value(transparent)]
pub struct MergeableModulesExposed(
    Vec<(
        ResolvedVc<Box<dyn MergeableModule>>,
        MergeableModuleExposure,
    )>,
);

#[turbo_tasks::value_impl]
impl MergeableModulesExposed {
    #[turbo_tasks::function]
    pub fn interned(
        modules: Vec<(
            ResolvedVc<Box<dyn MergeableModule>>,
            MergeableModuleExposure,
        )>,
    ) -> Vc<Self> {
        Vc::cell(modules)
    }
}

#[turbo_tasks::value(transparent)]
pub struct Chunks(Vec<ResolvedVc<Box<dyn Chunk>>>);

#[turbo_tasks::value_impl]
impl Chunks {
    /// Creates a new empty [Vc<Chunks>].
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(vec![])
    }
}

/// A [Chunk] group chunk items together into something that will become an [OutputAsset].
/// It usually contains multiple chunk items.
// TODO This could be simplified to and merged with [OutputChunk]
#[turbo_tasks::value_trait]
pub trait Chunk {
    #[turbo_tasks::function]
    fn ident(self: Vc<Self>) -> Vc<AssetIdent>;
    #[turbo_tasks::function]
    fn chunking_context(self: Vc<Self>) -> Vc<Box<dyn ChunkingContext>>;
    // fn path(self: Vc<Self>) -> Vc<FileSystemPath> {
    //     self.ident().path()
    // }

    /// Other [OutputAsset]s referenced from this [Chunk].
    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        OutputAssets::empty()
    }

    #[turbo_tasks::function]
    fn chunk_items(self: Vc<Self>) -> Vc<ChunkItems> {
        ChunkItems(vec![]).cell()
    }
}

/// Aggregated information about a chunk content that can be used by the runtime
/// code to optimize chunk loading.
#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct OutputChunkRuntimeInfo {
    pub included_ids: Option<ResolvedVc<ModuleIds>>,
    pub excluded_ids: Option<ResolvedVc<ModuleIds>>,
    /// List of paths of chunks containing individual modules that are part of
    /// this chunk. This is useful for selectively loading modules from a chunk
    /// without loading the whole chunk.
    pub module_chunks: Option<ResolvedVc<OutputAssets>>,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_impl]
impl OutputChunkRuntimeInfo {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Self::default().cell()
    }
}

#[turbo_tasks::value_trait]
pub trait OutputChunk: Asset {
    #[turbo_tasks::function]
    fn runtime_info(self: Vc<Self>) -> Vc<OutputChunkRuntimeInfo>;
}

/// Specifies how a chunk interacts with other chunks when building a chunk
/// group
#[derive(
    Debug,
    Clone,
    Hash,
    TraceRawVcs,
    Serialize,
    Deserialize,
    Eq,
    PartialEq,
    ValueDebugFormat,
    NonLocalValue,
)]
pub enum ChunkingType {
    /// The referenced module is placed in the same chunk group and is loaded in parallel.
    Parallel {
        /// Whether the parent module becomes an async module when the referenced module is async.
        /// This should happen for e.g. ESM imports, but not for CommonJS requires.
        inherit_async: bool,
        /// Whether the referenced module is executed always immediately before the parent module
        /// (corresponding to ESM import semantics).
        hoisted: bool,
    },
    /// An async loader is placed into the referencing chunk and loads the
    /// separate chunk group in which the module is placed.
    Async,
    /// Create a new chunk group in a separate context, merging references with the same tag into a
    /// single chunk group. It does not inherit the available modules from the parent.
    // TODO this is currently skipped in chunking
    Isolated {
        _ty: ChunkGroupType,
        merge_tag: Option<RcStr>,
    },
    /// Create a new chunk group in a separate context, merging references with the same tag into a
    /// single chunk group. It provides available modules to the current chunk group. It's assumed
    /// to be loaded before the current chunk group.
    Shared {
        inherit_async: bool,
        merge_tag: Option<RcStr>,
    },
    // Module not placed in chunk group, but its references are still followed.
    Traced,
}

impl Display for ChunkingType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChunkingType::Parallel {
                inherit_async,
                hoisted,
            } => {
                write!(
                    f,
                    "Parallel(inherit_async: {inherit_async}, hoisted: {hoisted})",
                )
            }
            ChunkingType::Async => write!(f, "Async"),
            ChunkingType::Isolated {
                _ty,
                merge_tag: Some(merge_tag),
            } => {
                write!(f, "Isolated(merge_tag: {merge_tag})")
            }
            ChunkingType::Isolated {
                _ty,
                merge_tag: None,
            } => {
                write!(f, "Isolated")
            }
            ChunkingType::Shared {
                inherit_async,
                merge_tag: Some(merge_tag),
            } => {
                write!(
                    f,
                    "Shared(inherit_async: {inherit_async}, merge_tag: {merge_tag})"
                )
            }
            ChunkingType::Shared {
                inherit_async,
                merge_tag: None,
            } => {
                write!(f, "Shared(inherit_async: {inherit_async})")
            }
            ChunkingType::Traced => write!(f, "Traced"),
        }
    }
}

impl ChunkingType {
    pub fn is_inherit_async(&self) -> bool {
        matches!(
            self,
            ChunkingType::Parallel {
                inherit_async: true,
                ..
            } | ChunkingType::Shared {
                inherit_async: true,
                ..
            }
        )
    }

    pub fn is_parallel(&self) -> bool {
        matches!(self, ChunkingType::Parallel { .. })
    }

    pub fn is_merged(&self) -> bool {
        matches!(
            self,
            ChunkingType::Isolated {
                merge_tag: Some(_),
                ..
            } | ChunkingType::Shared {
                merge_tag: Some(_),
                ..
            }
        )
    }

    pub fn without_inherit_async(&self) -> Self {
        match self {
            ChunkingType::Parallel { hoisted, .. } => ChunkingType::Parallel {
                hoisted: *hoisted,
                inherit_async: false,
            },
            ChunkingType::Async => ChunkingType::Async,
            ChunkingType::Isolated { _ty, merge_tag } => ChunkingType::Isolated {
                _ty: *_ty,
                merge_tag: merge_tag.clone(),
            },
            ChunkingType::Shared {
                inherit_async: _,
                merge_tag,
            } => ChunkingType::Shared {
                inherit_async: false,
                merge_tag: merge_tag.clone(),
            },
            ChunkingType::Traced => ChunkingType::Traced,
        }
    }
}

#[turbo_tasks::value(transparent)]
pub struct ChunkingTypeOption(Option<ChunkingType>);

/// A [ModuleReference] implementing this trait and returning Some(_) for
/// [ChunkableModuleReference::chunking_type] are considered as potentially
/// chunkable references. When all [Module]s of such a reference implement
/// [ChunkableModule] they are placed in [Chunk]s during chunking.
/// They are even potentially placed in the same [Chunk] when a chunk type
/// specific interface is implemented.
#[turbo_tasks::value_trait]
pub trait ChunkableModuleReference: ModuleReference + ValueToString {
    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        }))
    }

    #[turbo_tasks::function]
    fn export_usage(self: Vc<Self>) -> Vc<ExportUsage> {
        ExportUsage::all()
    }
}

pub struct ChunkGroupContent {
    pub chunkable_items: Vec<ChunkableModuleOrBatch>,
    pub batch_groups: Vec<ResolvedVc<ModuleBatchGroup>>,
    pub async_modules: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
    pub traced_modules: FxIndexSet<ResolvedVc<Box<dyn Module>>>,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value_trait]
pub trait ChunkItem {
    /// The [AssetIdent] of the [Module] that this [ChunkItem] was created from.
    /// For most chunk types this must uniquely identify the chunk item at
    /// runtime as it's the source of the module id used at runtime.
    #[turbo_tasks::function]
    fn asset_ident(self: Vc<Self>) -> Vc<AssetIdent>;
    /// A [AssetIdent] that uniquely identifies the content of this [ChunkItem].
    /// It is usually identical to [ChunkItem::asset_ident] but can be
    /// different when the chunk item content depends on available modules e. g.
    /// for chunk loaders.
    #[turbo_tasks::function]
    fn content_ident(self: Vc<Self>) -> Vc<AssetIdent> {
        self.asset_ident()
    }
    /// A [ChunkItem] can reference OutputAssets, unlike [Module]s referencing other [Module]s.
    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        OutputAssets::empty()
    }

    /// The type of chunk this item should be assembled into.
    #[turbo_tasks::function]
    fn ty(self: Vc<Self>) -> Vc<Box<dyn ChunkType>>;

    /// A temporary method to retrieve the module associated with this
    /// ChunkItem. TODO: Remove this as part of the chunk refactoring.
    #[turbo_tasks::function]
    fn module(self: Vc<Self>) -> Vc<Box<dyn Module>>;

    #[turbo_tasks::function]
    fn chunking_context(self: Vc<Self>) -> Vc<Box<dyn ChunkingContext>>;
}

#[turbo_tasks::value_trait]
pub trait ChunkType: ValueToString {
    /// Whether the source (reference) order of items needs to be retained during chunking.
    #[turbo_tasks::function]
    fn is_style(self: Vc<Self>) -> Vc<bool>;

    /// Create a new chunk for the given chunk items
    #[turbo_tasks::function]
    fn chunk(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_items: Vec<ChunkItemOrBatchWithAsyncModuleInfo>,
        batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
    ) -> Vc<Box<dyn Chunk>>;

    #[turbo_tasks::function]
    fn chunk_item_size(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_item: Vc<Box<dyn ChunkItem>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<usize>;
}

pub fn round_chunk_item_size(size: usize) -> usize {
    let a = size.next_power_of_two();
    size & (a | (a >> 1) | (a >> 2))
}

#[turbo_tasks::value(transparent)]
pub struct ChunkItems(pub Vec<ResolvedVc<Box<dyn ChunkItem>>>);

#[turbo_tasks::value]
pub struct AsyncModuleInfo {
    pub referenced_async_modules: AutoSet<ResolvedVc<Box<dyn Module>>>,
}

#[turbo_tasks::value_impl]
impl AsyncModuleInfo {
    #[turbo_tasks::function]
    pub fn new(referenced_async_modules: Vec<ResolvedVc<Box<dyn Module>>>) -> Result<Vc<Self>> {
        Ok(Self {
            referenced_async_modules: referenced_async_modules.into_iter().collect(),
        }
        .cell())
    }
}

#[derive(
    Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash, TraceRawVcs, TaskInput, NonLocalValue,
)]
pub struct ChunkItemWithAsyncModuleInfo {
    pub chunk_item: ResolvedVc<Box<dyn ChunkItem>>,
    pub module: Option<ResolvedVc<Box<dyn ChunkableModule>>>,
    pub async_info: Option<ResolvedVc<AsyncModuleInfo>>,
}

#[turbo_tasks::value(transparent)]
pub struct ChunkItemsWithAsyncModuleInfo(Vec<ChunkItemWithAsyncModuleInfo>);

pub trait ChunkItemExt {
    /// Returns the module id of this chunk item.
    fn id(self: Vc<Self>) -> Vc<ModuleId>;
}

impl<T> ChunkItemExt for T
where
    T: Upcast<Box<dyn ChunkItem>>,
{
    /// Returns the module id of this chunk item.
    fn id(self: Vc<Self>) -> Vc<ModuleId> {
        let chunk_item = Vc::upcast_non_strict(self);
        chunk_item.chunking_context().chunk_item_id(chunk_item)
    }
}

pub trait ModuleChunkItemIdExt {
    /// Returns the chunk item id of this module.
    fn chunk_item_id(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<ModuleId>;
}
impl<T> ModuleChunkItemIdExt for T
where
    T: Upcast<Box<dyn Module>>,
{
    fn chunk_item_id(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<ModuleId> {
        chunking_context.chunk_item_id_from_module(Vc::upcast_non_strict(self))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_round_chunk_item_size() {
        assert_eq!(round_chunk_item_size(0), 0);
        assert_eq!(round_chunk_item_size(1), 1);
        assert_eq!(round_chunk_item_size(2), 2);
        assert_eq!(round_chunk_item_size(3), 3);
        assert_eq!(round_chunk_item_size(4), 4);
        assert_eq!(round_chunk_item_size(5), 4);
        assert_eq!(round_chunk_item_size(6), 6);
        assert_eq!(round_chunk_item_size(7), 6);
        assert_eq!(round_chunk_item_size(8), 8);
        assert_eq!(round_chunk_item_size(49000), 32_768);
        assert_eq!(round_chunk_item_size(50000), 49_152);

        assert_eq!(changes_in_range(0..1000), 19);
        assert_eq!(changes_in_range(1000..2000), 2);
        assert_eq!(changes_in_range(2000..3000), 1);

        assert_eq!(changes_in_range(3000..10000), 4);

        fn changes_in_range(range: std::ops::Range<usize>) -> usize {
            let len = range.len();
            let mut count = 0;
            for i in range {
                let a = round_chunk_item_size(i);
                assert!(a >= i * 2 / 3);
                assert!(a <= i);
                let b = round_chunk_item_size(i + 1);

                if a == b {
                    count += 1;
                }
            }
            len - count
        }
    }
}
