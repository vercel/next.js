use anyhow::Result;
use roaring::RoaringBitmap;
use turbo_tasks::{ResolvedVc, Vc};

use crate::module_graph::{
    chunk_group_info::{ChunkGroupInfo, RoaringBitmapWrapper},
    module_batch::ChunkableModuleOrBatch,
};

/// Allows to gather information about which assets are already available.
#[turbo_tasks::value]
pub struct AvailableChunkGroups {
    chunk_groups: RoaringBitmapWrapper,
}

#[turbo_tasks::value_impl]
impl AvailableChunkGroups {
    #[turbo_tasks::function]
    pub async fn new(chunk_group: u32) -> Result<Vc<Self>> {
        Ok(AvailableChunkGroups {
            chunk_groups: RoaringBitmapWrapper::new(
                RoaringBitmap::from_sorted_iter(std::iter::once(chunk_group)).unwrap(),
            ),
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn with_chunk_group(&self, chunk_group: u32) -> Result<Vc<Self>> {
        let mut chunk_groups = self.chunk_groups.clone();
        chunk_groups.insert(chunk_group);
        Ok(AvailableChunkGroups { chunk_groups }.cell())
    }

    #[turbo_tasks::function]
    pub async fn hash(&self, chunk_group_info: Vc<ChunkGroupInfo>) -> Result<Vc<u64>> {
        Ok(Vc::cell(
            chunk_group_info
                .await?
                .hash_chunk_groups(&self.chunk_groups)
                .await?,
        ))
    }

    #[turbo_tasks::function]
    pub async fn is_available(
        &self,
        chunk_group_info: Vc<ChunkGroupInfo>,
        module_or_batch: ChunkableModuleOrBatch,
    ) -> Result<Vc<bool>> {
        Ok(Vc::cell(match module_or_batch {
            ChunkableModuleOrBatch::Module(module) => {
                let chunk_group_info = chunk_group_info.await?;
                let chunk_groups = chunk_group_info.get_individual(ResolvedVc::upcast(module))?;
                is_chunk_group_available(&self.chunk_groups, chunk_groups)
            }
            ChunkableModuleOrBatch::Batch(batch) => {
                let batch = batch.await?;
                let chunk_groups = batch.chunk_groups.as_ref().unwrap();
                is_chunk_group_available(&self.chunk_groups, chunk_groups)
            }
        }))
    }
}

impl AvailableChunkGroups {
    pub async fn is_available_individual(
        &self,
        chunk_group_info: &ChunkGroupInfo,
        module_or_batch: ChunkableModuleOrBatch,
    ) -> Result<bool> {
        Ok(match module_or_batch {
            ChunkableModuleOrBatch::Module(module) => {
                let chunk_groups = chunk_group_info.get_individual(ResolvedVc::upcast(module))?;
                is_chunk_group_available(&self.chunk_groups, chunk_groups)
            }
            ChunkableModuleOrBatch::Batch(batch) => {
                let batch = batch.await?;
                let chunk_groups = batch.chunk_groups.as_ref().unwrap();
                is_chunk_group_available(&self.chunk_groups, chunk_groups)
            }
        })
    }
}

fn is_chunk_group_available(
    available_chunk_groups: &RoaringBitmapWrapper,
    module_chunk_groups: &RoaringBitmapWrapper,
) -> bool {
    // `self.chunk_groups` is the union of all parent chunk groups (i.e. a single chunking path
    // leading to this module)
    //
    // `module_chunk_groups` is the union of all chunk groups of the module (i.e. the union of
    // all paths leading to this module)
    //
    // The module is available, if there is at least one parent chunk group (bit is set in
    // `self.chunk_groups`) that contains the module (bit is set in `module`)
    !available_chunk_groups.is_disjoint(module_chunk_groups)
}
