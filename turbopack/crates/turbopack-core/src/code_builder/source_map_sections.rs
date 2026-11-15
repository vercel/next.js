use std::sync::Arc;

use anyhow::{Result, ensure};
use bincode::{Decode, Encode};
use turbo_tasks::NonLocalValue;
use turbo_tasks_hash::DeterministicHash;

use crate::{
    code_builder::{Mapping, SectionMap},
    source_map::{SourceMapGenerationOptions, SourceMapType, SourceMaps},
};

/// Every mapped section must supply the variants selected at construction.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, NonLocalValue, DeterministicHash)]
pub(super) struct Mappings {
    pub(super) mappings: Arc<Vec<Mapping>>,
    available: SourceMapGenerationOptions,
}

impl Mappings {
    pub(super) fn new(available: SourceMapGenerationOptions) -> Self {
        Self {
            mappings: Arc::default(),
            available,
        }
    }

    pub(super) fn push(&mut self, offset: usize, maps: SourceMaps<SectionMap>) -> Result<()> {
        if matches!(maps, SourceMaps::None) {
            self.push_synthetic(offset);
            return Ok(());
        }
        ensure!(
            !self.available.full || maps.get(SourceMapType::Full).is_some(),
            "Mapped code must supply a full source map"
        );
        ensure!(
            !self.available.shallow || maps.get(SourceMapType::Shallow).is_some(),
            "Mapped code must supply a shallow source map"
        );
        Arc::make_mut(&mut self.mappings).push((offset, maps));
        Ok(())
    }

    pub(super) fn push_synthetic(&mut self, offset: usize) {
        if matches!(self.mappings.last(), None | Some((_, SourceMaps::None))) {
            return;
        }
        Arc::make_mut(&mut self.mappings).push((offset, SourceMaps::None));
    }

    pub(super) fn append(&mut self, offset: usize, other: &Self) -> Result<()> {
        if other.has_source_map() {
            ensure!(
                !self.available.full || other.available.full,
                "Appended code must supply a full source map"
            );
            ensure!(
                !self.available.shallow || other.available.shallow,
                "Appended code must supply a shallow source map"
            );
        }
        if other.mappings.first().is_none_or(|(index, _)| *index > 0) {
            // Synthetic prefixes must end the previous section's mappings.
            self.push_synthetic(offset);
        }
        Arc::make_mut(&mut self.mappings).extend(
            other
                .mappings
                .iter()
                .map(|(index, map)| (index + offset, map.clone())),
        );
        Ok(())
    }

    pub(super) fn has_source_map(&self) -> bool {
        !self.mappings.is_empty()
    }

    pub(super) fn is_complete(&self, ty: SourceMapType) -> bool {
        match ty {
            SourceMapType::Full => self.available.full,
            SourceMapType::Shallow => self.available.shallow,
        }
    }

    pub(super) fn is_shared(&self) -> bool {
        self.mappings
            .iter()
            .all(|(_, maps)| matches!(maps, SourceMaps::None | SourceMaps::Shared(_)))
    }
}
