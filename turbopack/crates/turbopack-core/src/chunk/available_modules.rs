use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_tasks::{
    FxIndexSet, NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, ValueToString, Vc,
    trace::TraceRawVcs, turbofmt,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use crate::{
    chunk::ChunkableModule,
    module::Module,
    module_graph::module_batch::{ChunkableModuleOrBatch, IdentStrings, ModuleBatch},
};

#[derive(
    Debug, Copy, Clone, Hash, PartialEq, Eq, TraceRawVcs, NonLocalValue, TaskInput, Encode, Decode,
)]
pub enum AvailableModuleItem {
    Module(ResolvedVc<Box<dyn ChunkableModule>>),
    Batch(ResolvedVc<ModuleBatch>),
    AsyncLoader(ResolvedVc<Box<dyn ChunkableModule>>),
}

impl AvailableModuleItem {
    pub async fn ident_strings(&self) -> Result<IdentStrings> {
        Ok(match self {
            AvailableModuleItem::Module(module) => {
                IdentStrings::Single(module.ident().to_string().owned().await?)
            }
            AvailableModuleItem::Batch(batch) => {
                IdentStrings::Multiple(batch.ident_strings().await?)
            }
            AvailableModuleItem::AsyncLoader(module) => {
                IdentStrings::Single(turbofmt!("async loader {}", module.ident()).await?)
            }
        })
    }
}

impl From<ChunkableModuleOrBatch> for AvailableModuleItem {
    fn from(value: ChunkableModuleOrBatch) -> Self {
        match value {
            ChunkableModuleOrBatch::Module(module) => AvailableModuleItem::Module(module),
            ChunkableModuleOrBatch::Batch(batch) => AvailableModuleItem::Batch(batch),
            ChunkableModuleOrBatch::None(id) => {
                panic!("Cannot create AvailableModuleItem from None({})", id)
            }
        }
    }
}

/// A flat set of modules/items that are already available in the current chunk
/// group context and therefore do not need to be included again.
#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct AvailableModulesSet(
    #[bincode(with = "turbo_bincode::indexset")] FxIndexSet<AvailableModuleItem>,
);

#[turbo_tasks::value_impl]
impl AvailableModulesSet {
    /// Returns a new set that is the union of `self` and `extra`.
    #[turbo_tasks::function]
    pub async fn with_modules(
        self: ResolvedVc<Self>,
        extra: Vc<AvailableModulesSet>,
    ) -> Result<Vc<Self>> {
        let base = self.await?;
        let extra = extra.await?;
        let mut merged = (*base).clone();
        merged.extend(extra.iter().copied());
        Ok(Vc::cell(merged))
    }

    /// Returns a stable hash of the set contents, suitable for use in asset
    /// identifiers.
    #[turbo_tasks::function]
    pub async fn hash(self: Vc<Self>) -> Result<Vc<u64>> {
        let set = self.await?;
        let mut hasher = Xxh3Hash64Hasher::new();
        let item_idents = set
            .iter()
            .map(async |&module| module.ident_strings().await)
            .try_join()
            .await?;
        for idents in item_idents {
            match idents {
                IdentStrings::Single(ident) => hasher.write_value(ident),
                IdentStrings::Multiple(idents) => {
                    for ident in idents {
                        hasher.write_value(ident);
                    }
                }
                IdentStrings::None => {}
            }
        }
        Ok(Vc::cell(hasher.finish()))
    }
}

impl AvailableModulesSet {
    /// Returns true if this set contains the given item.
    pub fn contains(&self, item: &AvailableModuleItem) -> bool {
        self.0.contains(item)
    }
}
