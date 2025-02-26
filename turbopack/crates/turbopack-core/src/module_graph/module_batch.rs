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
    Debug, Copy, Clone, Hash, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue,
)]
pub enum ModuleOrBatch {
    Module(ResolvedVc<Box<dyn Module>>),
    Batch(ResolvedVc<ModuleBatch>),
    None,
}

impl ModuleOrBatch {
    pub fn try_to_chunkable_module(self) -> Option<ChunkableModuleOrBatch> {
        match self {
            ModuleOrBatch::Module(module) => {
                ResolvedVc::try_downcast(module).map(ChunkableModuleOrBatch::Module)
            }
            ModuleOrBatch::Batch(batch) => Some(ChunkableModuleOrBatch::Batch(batch)),
            ModuleOrBatch::None => Some(ChunkableModuleOrBatch::None),
        }
    }
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
