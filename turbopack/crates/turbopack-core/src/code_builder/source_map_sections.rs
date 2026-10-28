use std::sync::Arc;

use bincode::{Decode, Encode};
use turbo_tasks::NonLocalValue;
use turbo_tasks_hash::DeterministicHash;

use crate::{
    code_builder::{Mapping, SectionMap},
    source_map::{SourceMapGenerationOptions, SourceMapType, SourceMaps},
};

/// Tracks sections and whether every mapped section supplied this source map variant.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, NonLocalValue, DeterministicHash)]
pub(super) struct Mappings {
    pub(super) mappings: Arc<Vec<Mapping>>,
    available: SourceMapGenerationOptions,
}

impl Default for Mappings {
    fn default() -> Self {
        Self {
            mappings: Arc::default(),
            available: SourceMapGenerationOptions {
                full: true,
                partial: true,
            },
        }
    }
}

impl Mappings {
    pub(super) fn push(&mut self, offset: usize, maps: SourceMaps<SectionMap>) {
        if matches!(maps, SourceMaps::None) {
            if matches!(self.mappings.last(), None | Some((_, SourceMaps::None))) {
                return;
            }
        } else {
            // Synthetic sections impose no completeness constraint.
            self.available.full &= maps.get(SourceMapType::Full).is_some();
            self.available.partial &= maps.get(SourceMapType::Partial).is_some();
        }
        Arc::make_mut(&mut self.mappings).push((offset, maps));
    }

    pub(super) fn append(&mut self, offset: usize, other: &Self) {
        self.available.full &= other.available.full;
        self.available.partial &= other.available.partial;
        if other.mappings.first().is_none_or(|(index, _)| *index > 0) {
            // Synthetic prefixes must end the previous section's mappings.
            self.push(offset, SourceMaps::None);
        }
        Arc::make_mut(&mut self.mappings).extend(
            other
                .mappings
                .iter()
                .map(|(index, map)| (index + offset, map.clone())),
        );
    }

    pub(super) fn has_source_map(&self) -> bool {
        !self.mappings.is_empty()
    }

    pub(super) fn is_complete(&self, ty: SourceMapType) -> bool {
        match ty {
            SourceMapType::Full => self.available.full,
            SourceMapType::Partial => self.available.partial,
        }
    }

    pub(super) fn is_shared(&self) -> bool {
        self.mappings
            .iter()
            .all(|(_, maps)| matches!(maps, SourceMaps::None | SourceMaps::Shared(_)))
    }
}
