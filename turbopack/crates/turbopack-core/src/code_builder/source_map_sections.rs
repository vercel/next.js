use std::sync::Arc;

use bincode::{Decode, Encode};
use turbo_tasks::NonLocalValue;
use turbo_tasks_hash::DeterministicHash;

use crate::{
    code_builder::{Mapping, SectionMap},
    source_map::{SourceMapType, SourceMaps},
};

/// Tracks sections and whether every mapped section supplied this source map variant.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, NonLocalValue, DeterministicHash)]
pub(super) struct Mappings {
    pub(super) mappings: Arc<Vec<Mapping>>,
    pub(super) complete: bool,
}

impl Default for Mappings {
    fn default() -> Self {
        Self {
            mappings: Arc::default(),
            complete: true,
        }
    }
}

impl Mappings {
    fn push(&mut self, offset: usize, map: Option<SectionMap>) {
        if map.is_none() && matches!(self.mappings.last(), None | Some((_, None))) {
            return;
        }
        Arc::make_mut(&mut self.mappings).push((offset, map));
    }

    fn append(&mut self, offset: usize, other: &Self) {
        self.complete &= other.complete;
        if other.mappings.first().is_none_or(|(index, _)| *index > 0) {
            // Synthetic prefixes must end the previous section's mappings.
            self.push(offset, None);
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
}

/// Shares sections until full and partial source map variants diverge.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, NonLocalValue, DeterministicHash)]
pub(super) enum MappingVariants {
    Shared(Mappings),
    Separate { full: Mappings, partial: Mappings },
}

impl Default for MappingVariants {
    fn default() -> Self {
        Self::Shared(Mappings::default())
    }
}

impl MappingVariants {
    pub(super) fn get(&self, ty: SourceMapType) -> &Mappings {
        match (self, ty) {
            (Self::Shared(stream), _) => stream,
            (Self::Separate { full, .. }, SourceMapType::Full) => full,
            (Self::Separate { partial, .. }, SourceMapType::Partial) => partial,
        }
    }

    fn separate(&mut self) -> (&mut Mappings, &mut Mappings) {
        if let Self::Shared(stream) = self {
            *self = Self::Separate {
                full: stream.clone(),
                partial: stream.clone(),
            };
        }
        let Self::Separate { full, partial } = self else {
            unreachable!()
        };
        (full, partial)
    }

    pub(super) fn push(&mut self, offset: usize, maps: SourceMaps<SectionMap>) {
        if let Self::Shared(stream) = self {
            match maps {
                SourceMaps::Shared(map) => {
                    stream.push(offset, Some(map));
                    return;
                }
                SourceMaps::None => {
                    stream.push(offset, None);
                    return;
                }
                _ => {}
            }
        }
        let (full, partial) = self.separate();
        for (ty, stream) in [
            (SourceMapType::Full, full),
            (SourceMapType::Partial, partial),
        ] {
            let map = maps.get(ty);
            // Synthetic sections impose no completeness constraint.
            if maps != SourceMaps::None {
                stream.complete &= map.is_some();
            }
            stream.push(offset, map.cloned());
        }
    }

    pub(super) fn append(&mut self, offset: usize, other: &Self) {
        if let (Self::Shared(stream), Self::Shared(other)) = (&mut *self, other) {
            stream.append(offset, other);
        } else {
            let (full, partial) = self.separate();
            full.append(offset, other.get(SourceMapType::Full));
            partial.append(offset, other.get(SourceMapType::Partial));
        }
    }

    pub(super) fn has_source_map(&self) -> bool {
        self.get(SourceMapType::Full).has_source_map()
            || self.get(SourceMapType::Partial).has_source_map()
    }
}
