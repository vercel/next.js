use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_tasks::{
    FxIndexSet, JoinIterExt, OperationVc, ResolvedVc, ValueToString, Vc, trace::TraceRawVcs,
    turbofmt,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use crate::{
    chunk::ChunkableModule,
    module::Module,
    module_graph::module_batch::{ChunkableModuleOrBatch, IdentStrings, ModuleBatch},
};

#[turbo_tasks::task_input]
#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
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

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct AvailableModulesSet(
    #[bincode(with = "turbo_bincode::indexset")] FxIndexSet<AvailableModuleItem>,
);

#[turbo_tasks::value_impl]
impl AvailableModulesSet {
    /// Returns a new set holding everything in `self` plus everything in `extra`.
    ///
    /// The sets are merged eagerly rather than chained: a flat set keeps `contains` O(1) and lets
    /// two contexts with equal availability share one cell, which a chain cannot do because its
    /// identity includes the shape of the chain rather than just its contents.
    #[turbo_tasks::function]
    pub async fn with_modules(
        self: ResolvedVc<Self>,
        extra: OperationVc<AvailableModulesSet>,
    ) -> Result<Vc<Self>> {
        let base = self.await?;
        let extra = extra.connect().await?;
        if extra.is_empty() {
            return Ok(*self);
        }
        let mut merged = (*base).clone();
        merged.extend(extra.iter().copied());
        Ok(Vc::cell(merged))
    }

    #[turbo_tasks::function]
    pub async fn hash(&self) -> Result<Vc<u64>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        let item_idents = self
            .0
            .iter()
            .map(async |&module| module.ident_strings().await)
            .join()
            .await;
        for idents in item_idents {
            match idents? {
                IdentStrings::Single(ident) => hasher.write_value(ident),
                IdentStrings::Multiple(idents) => {
                    for ident in &idents {
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
    pub fn contains(&self, item: &AvailableModuleItem) -> bool {
        self.0.contains(item)
    }
}
