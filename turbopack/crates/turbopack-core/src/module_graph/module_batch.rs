use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    trace::TraceRawVcs, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryJoinIterExt,
    ValueToString, Vc,
};

use crate::{
    chunk::ChunkableModule, module::Module, module_graph::chunk_group_info::RoaringBitmapWrapper,
};

#[derive(
    Debug,
    Copy,
    Clone,
    Hash,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    TaskInput,
)]
pub enum ModuleOrBatch {
    Module(ResolvedVc<Box<dyn Module>>),
    Batch(ResolvedVc<ModuleBatch>),
    None,
}

#[derive(
    Debug,
    Copy,
    Clone,
    Hash,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    TaskInput,
)]
pub enum ChunkableModuleOrBatch {
    Module(ResolvedVc<Box<dyn ChunkableModule>>),
    Batch(ResolvedVc<ModuleBatch>),
    None,
}

impl ChunkableModuleOrBatch {
    pub fn from_module_or_batch(module_or_batch: ModuleOrBatch) -> Option<Self> {
        match module_or_batch {
            ModuleOrBatch::Module(module) => ResolvedVc::try_downcast(module).map(Self::Module),
            ModuleOrBatch::Batch(batch) => Some(Self::Batch(batch)),
            ModuleOrBatch::None => Some(Self::None),
        }
    }

    pub async fn ident_strings(self) -> Result<IdentStrings> {
        Ok(match self {
            ChunkableModuleOrBatch::Module(module) => {
                IdentStrings::Single(module.ident().to_string().await?)
            }
            ChunkableModuleOrBatch::Batch(batch) => {
                IdentStrings::Multiple(batch.ident_strings().await?)
            }
            ChunkableModuleOrBatch::None => IdentStrings::None,
        })
    }
}

impl From<ChunkableModuleOrBatch> for ModuleOrBatch {
    fn from(chunkable_module_or_batch: ChunkableModuleOrBatch) -> Self {
        match chunkable_module_or_batch {
            ChunkableModuleOrBatch::Module(module) => Self::Module(ResolvedVc::upcast(module)),
            ChunkableModuleOrBatch::Batch(batch) => Self::Batch(batch),
            ChunkableModuleOrBatch::None => Self::None,
        }
    }
}

pub enum IdentStrings {
    None,
    Single(ReadRef<RcStr>),
    Multiple(ReadRef<Vec<RcStr>>),
}

#[turbo_tasks::value]
pub struct ModuleBatch {
    pub modules: Vec<ResolvedVc<Box<dyn ChunkableModule>>>,
    pub chunk_groups: Option<RoaringBitmapWrapper>,
}

#[turbo_tasks::value_impl]
impl ModuleBatch {
    #[turbo_tasks::function]
    pub fn new(
        modules: Vec<ResolvedVc<Box<dyn ChunkableModule>>>,
        chunk_groups: Option<RoaringBitmapWrapper>,
    ) -> Vc<Self> {
        Self {
            modules,
            chunk_groups,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn ident_strings(&self) -> Result<Vc<Vec<RcStr>>> {
        Ok(Vc::cell(
            self.modules
                .iter()
                .map(|module| module.ident().to_string().owned())
                .try_join()
                .await?,
        ))
    }
}

#[turbo_tasks::value]
pub struct ModuleBatchGroup {
    pub items: Vec<ModuleOrBatch>,
    pub chunk_groups: RoaringBitmapWrapper,
}

#[turbo_tasks::value_impl]
impl ModuleBatchGroup {
    #[turbo_tasks::function]
    pub fn new(items: Vec<ModuleOrBatch>, chunk_groups: RoaringBitmapWrapper) -> Vc<Self> {
        Self {
            items,
            chunk_groups,
        }
        .cell()
    }
}

#[turbo_tasks::value]
pub struct ChunkableModuleBatchGroup {
    pub items: Vec<ChunkableModuleOrBatch>,
    pub chunk_groups: RoaringBitmapWrapper,
}

#[turbo_tasks::value_impl]
impl ChunkableModuleBatchGroup {
    #[turbo_tasks::function]
    pub async fn from_module_batch_group(batch_group: Vc<ModuleBatchGroup>) -> Result<Vc<Self>> {
        let batch_group = batch_group.await?;
        let items = batch_group
            .items
            .iter()
            .filter_map(|batch| match *batch {
                ModuleOrBatch::Module(module) => {
                    ResolvedVc::try_downcast(module).map(ChunkableModuleOrBatch::Module)
                }
                ModuleOrBatch::Batch(batch) => Some(ChunkableModuleOrBatch::Batch(batch)),
                ModuleOrBatch::None => None,
            })
            .collect();
        Ok(Self {
            items,
            chunk_groups: batch_group.chunk_groups.clone(),
        }
        .cell())
    }
}
