use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use bitfield::bitfield;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc, trace::TraceRawVcs};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use crate::{
    module::{Module, Modules},
    module_graph::{
        ModuleGraph,
        chunk_group_info::{ChunkGroup, ChunkGroupInfo, RoaringBitmapWrapper},
        module_batch::ChunkableModuleOrBatch,
    },
};

bitfield! {
    #[turbo_tasks::task_input]
    #[derive(Clone, Copy, Default, TraceRawVcs, PartialEq, Eq, Hash, Encode, Decode)]
    pub struct AvailabilityFlags(u8);
    impl Debug;
    pub is_in_async_module, set_is_in_async_module: 0;
}

/// A linked list of chunk groups whose content is already available.
///
/// Only the chunk group identities are retained; whether an individual module is available is
/// derived from the chunk group membership bitmaps in
/// [`ChunkGroupInfo`](crate::module_graph::chunk_group_info::ChunkGroupInfo).
#[turbo_tasks::value]
struct AvailableChunkGroups {
    parent: Option<ResolvedVc<AvailableChunkGroups>>,
    chunk_group: ChunkGroup,
}

#[turbo_tasks::value_impl]
impl AvailableChunkGroups {
    #[turbo_tasks::function]
    pub fn new(chunk_group: ChunkGroup) -> Vc<Self> {
        Self {
            parent: None,
            chunk_group,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn with_chunk_group(
        self: ResolvedVc<Self>,
        chunk_group: ChunkGroup,
    ) -> Vc<AvailableChunkGroups> {
        AvailableChunkGroups {
            parent: Some(self),
            chunk_group,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn hash(&self) -> Result<Vc<u64>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        if let Some(parent) = self.parent {
            hasher.write_value(parent.hash().await?);
        } else {
            hasher.write_value(0u64);
        }

        match &self.chunk_group {
            ChunkGroup::Entry(_) => hasher.write_value(0u8),
            ChunkGroup::Async(_) => hasher.write_value(1u8),
            ChunkGroup::Isolated(_) => hasher.write_value(2u8),
            ChunkGroup::IsolatedMerged {
                parent, merge_tag, ..
            } => {
                hasher.write_value(3u8);
                hasher.write_value(*parent);
                hasher.write_value(merge_tag);
            }
            ChunkGroup::Shared(_) => hasher.write_value(4u8),
            ChunkGroup::SharedMultiple(_) => hasher.write_value(5u8),
            ChunkGroup::SharedMerged {
                parent, merge_tag, ..
            } => {
                hasher.write_value(6u8);
                hasher.write_value(*parent);
                hasher.write_value(merge_tag);
            }
            ChunkGroup::Collected(_) => hasher.write_value(7u8),
        }
        for module in self.chunk_group.entries() {
            hasher.write_value(module.ident().to_string().owned().await?);
        }

        Ok(Vc::cell(hasher.finish()))
    }
}

#[turbo_tasks::task_input]
#[derive(Eq, PartialEq, Hash, Clone, Copy, Debug, TraceRawVcs, Encode, Decode)]
pub struct AvailabilityInfo {
    flags: AvailabilityFlags,
    /// Chunk groups whose contents are already available.
    available_chunk_groups: Option<ResolvedVc<AvailableChunkGroups>>,
    /// The root ChunkGroup::Entry
    entry_group: Option<ResolvedVc<Modules>>,
}

impl AvailabilityInfo {
    pub fn root() -> Self {
        Self {
            flags: AvailabilityFlags::default(),
            available_chunk_groups: None,
            entry_group: None,
        }
    }

    pub async fn with_chunk_group(self, chunk_group: ChunkGroup) -> Result<Self> {
        Ok(Self {
            flags: self.flags,
            available_chunk_groups: Some(
                if let Some(available_chunk_groups) = self.available_chunk_groups {
                    available_chunk_groups
                        .with_chunk_group(chunk_group)
                        .to_resolved()
                        .await?
                } else {
                    AvailableChunkGroups::new(chunk_group).to_resolved().await?
                },
            ),
            entry_group: self.entry_group,
        })
    }

    /// The set of available chunk groups as indices into
    /// [`ChunkGroupInfo::chunk_groups`](crate::module_graph::chunk_group_info::ChunkGroupInfo::chunk_groups).
    pub async fn bitmap(&self, chunk_group_info: &ChunkGroupInfo) -> Result<RoaringBitmapWrapper> {
        let mut bitmap = RoaringBitmapWrapper::default();
        let mut current = self.available_chunk_groups;
        while let Some(available_chunk_groups) = current {
            let available_chunk_groups = available_chunk_groups.await?;
            let index = chunk_group_info
                .chunk_groups
                .get_index_of(&available_chunk_groups.chunk_group)
                .context("Available chunk group is missing from chunk group info")?;
            bitmap.insert(index as u32);
            current = available_chunk_groups.parent;
        }
        Ok(bitmap)
    }

    /// Whether the module or module batch is already part of one of the available chunk groups.
    pub async fn is_available(
        &self,
        module_graph: ResolvedVc<ModuleGraph>,
        item: ChunkableModuleOrBatch,
    ) -> Result<bool> {
        if self.available_chunk_groups.is_none() {
            return Ok(false);
        }
        let chunk_group_info = module_graph.chunk_group_info().await?;
        let available_chunk_groups = self.bitmap(&chunk_group_info).await?;
        Ok(match item {
            ChunkableModuleOrBatch::Module(module) => chunk_group_info
                .module_chunk_groups
                .await?
                .get(&ResolvedVc::upcast(module))
                .is_some_and(|groups| !groups.is_disjoint(&available_chunk_groups)),
            ChunkableModuleOrBatch::Batch(batch) => batch
                .await?
                .chunk_groups
                .as_ref()
                .is_some_and(|groups| !groups.is_disjoint(&available_chunk_groups)),
            ChunkableModuleOrBatch::None(_) => false,
        })
    }

    pub fn in_async_module(self) -> Self {
        let mut flags = self.flags;
        flags.set_is_in_async_module(true);
        Self {
            flags,
            available_chunk_groups: self.available_chunk_groups,
            entry_group: self.entry_group,
        }
    }

    pub fn is_in_async_module(&self) -> bool {
        self.flags.is_in_async_module()
    }

    pub fn with_entry_group(self, entry_group: ResolvedVc<Modules>) -> Self {
        Self {
            flags: self.flags,
            available_chunk_groups: self.available_chunk_groups,
            entry_group: Some(entry_group),
        }
    }

    pub fn entry_group(&self) -> Option<ResolvedVc<Modules>> {
        self.entry_group
    }

    pub async fn ident(&self) -> Result<Option<RcStr>> {
        Ok(
            if let Some(available_chunk_groups) = self.available_chunk_groups {
                Some(available_chunk_groups.hash().await?.to_string().into())
            } else {
                None
            },
        )
    }
}
