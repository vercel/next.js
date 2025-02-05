pub mod availability_info;
pub mod available_modules;
pub mod chunk_group;
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
    debug::ValueDebugFormat, trace::TraceRawVcs, FxIndexMap, FxIndexSet, NonLocalValue, ResolvedVc,
    TaskInput, Upcast, ValueToString, Vc,
};
use turbo_tasks_hash::DeterministicHash;

pub use self::{
    chunking_context::{
        ChunkGroupResult, ChunkGroupType, ChunkingConfig, ChunkingConfigs, ChunkingContext,
        ChunkingContextExt, EntryChunkGroupResult, MinifyType, SourceMapsType,
    },
    data::{ChunkData, ChunkDataOption, ChunksData},
    evaluate::{EvaluatableAsset, EvaluatableAssetExt, EvaluatableAssets},
};
use crate::{
    asset::Asset, ident::AssetIdent, module::Module, module_graph::ModuleGraph,
    output::OutputAssets, reference::ModuleReference,
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
            ModuleId::Number(i) => write!(f, "{}", i),
            ModuleId::String(s) => write!(f, "{}", s),
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
    fn ident(self: Vc<Self>) -> Vc<AssetIdent>;
    fn chunking_context(self: Vc<Self>) -> Vc<Box<dyn ChunkingContext>>;
    // fn path(self: Vc<Self>) -> Vc<FileSystemPath> {
    //     self.ident().path()
    // }

    /// Other [OutputAsset]s referenced from this [Chunk].
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        OutputAssets::empty()
    }

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

#[turbo_tasks::value_trait]
pub trait OutputChunk: Asset {
    fn runtime_info(self: Vc<Self>) -> Vc<OutputChunkRuntimeInfo>;
}

/// Specifies how a chunk interacts with other chunks when building a chunk
/// group
#[derive(
    Debug,
    Default,
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
    /// Module is placed in the same chunk group and is loaded in parallel. It
    /// doesn't become an async module when the referenced module is async.
    #[default]
    Parallel,
    /// Module is placed in the same chunk group and is loaded in parallel. It
    /// becomes an async module when the referenced module is async.
    ParallelInheritAsync,
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
    /// Module not placed in chunk group, but its references are still followed and placed into the
    /// chunk group.
    Passthrough,
    // Module not placed in chunk group, but its references are still followed.
    Traced,
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
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::default()))
    }
}

type AsyncInfo =
    FxIndexMap<ResolvedVc<Box<dyn ChunkableModule>>, Vec<ResolvedVc<Box<dyn ChunkableModule>>>>;

#[derive(Default)]
pub struct ChunkGroupContent {
    pub chunkable_modules: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
    pub async_modules: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
    pub traced_modules: FxIndexSet<ResolvedVc<Box<dyn Module>>>,
    pub passthrough_modules: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
    /// A map from local module to all children from which the async module
    /// status is inherited
    pub forward_edges_inherit_async: AsyncInfo,
    /// A map from local module to all parents that inherit the async module
    /// status
    pub local_back_edges_inherit_async: AsyncInfo,
    /// A map from already available async modules to all local parents that
    /// inherit the async module status
    pub available_async_modules_back_edges_inherit_async: AsyncInfo,
}

#[turbo_tasks::value_trait]
pub trait ChunkItem {
    /// The [AssetIdent] of the [Module] that this [ChunkItem] was created from.
    /// For most chunk types this must uniquely identify the chunk item at
    /// runtime as it's the source of the module id used at runtime.
    fn asset_ident(self: Vc<Self>) -> Vc<AssetIdent>;
    /// A [AssetIdent] that uniquely identifies the content of this [ChunkItem].
    /// It is unusally identical to [ChunkItem::asset_ident] but can be
    /// different when the chunk item content depends on available modules e. g.
    /// for chunk loaders.
    fn content_ident(self: Vc<Self>) -> Vc<AssetIdent> {
        self.asset_ident()
    }
    /// A [ChunkItem] can reference OutputAssets, unlike [Module]s referencing other [Module]s.
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        OutputAssets::empty()
    }

    /// The type of chunk this item should be assembled into.
    fn ty(self: Vc<Self>) -> Vc<Box<dyn ChunkType>>;

    /// A temporary method to retrieve the module associated with this
    /// ChunkItem. TODO: Remove this as part of the chunk refactoring.
    fn module(self: Vc<Self>) -> Vc<Box<dyn Module>>;

    fn chunking_context(self: Vc<Self>) -> Vc<Box<dyn ChunkingContext>>;
}

#[turbo_tasks::value_trait]
pub trait ChunkType: ValueToString {
    /// Whether the source (reference) order of items needs to be retained during chunking.
    fn must_keep_item_order(self: Vc<Self>) -> Vc<bool>;

    /// Create a new chunk for the given chunk items
    fn chunk(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_items: Vec<ChunkItemWithAsyncModuleInfo>,
        referenced_output_assets: Vc<OutputAssets>,
    ) -> Vc<Box<dyn Chunk>>;

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
    pub referenced_async_modules: AutoSet<ResolvedVc<Box<dyn ChunkableModule>>>,
}

#[turbo_tasks::value_impl]
impl AsyncModuleInfo {
    #[turbo_tasks::function]
    pub async fn new(
        referenced_async_modules: Vec<ResolvedVc<Box<dyn ChunkableModule>>>,
    ) -> Result<Vc<Self>> {
        Ok(Self {
            referenced_async_modules: referenced_async_modules.into_iter().collect(),
        }
        .cell())
    }
}

#[derive(
    Copy,
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    Hash,
    TraceRawVcs,
    TaskInput,
    NonLocalValue,
)]
pub enum ChunkItemTy {
    /// The ChunkItem should be included as content in the chunk.
    Included,
    /// The ChunkItem should be used to trace references but should not included in the chunk.
    Passthrough,
}

#[derive(
    Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash, TraceRawVcs, TaskInput, NonLocalValue,
)]
// #[turbo_tasks::value]
pub struct ChunkItemWithAsyncModuleInfo {
    pub ty: ChunkItemTy,
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
        let chunk_item = Vc::upcast(self);
        chunk_item.chunking_context().chunk_item_id(chunk_item)
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
