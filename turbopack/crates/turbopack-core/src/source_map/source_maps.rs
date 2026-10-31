use std::future::Future;

use bincode::{Decode, Encode};
use turbo_tasks::NonLocalValue;
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher};

use crate::source_map::SourceMapType;

/// Source maps associated with the same generated code.
#[derive(Clone, Debug, Default, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub enum SourceMaps<T: NonLocalValue> {
    #[default]
    None,
    Full(T),
    Shallow(T),
    Both {
        full: T,
        shallow: T,
    },
    Shared(T),
}

impl<T: NonLocalValue + DeterministicHash> DeterministicHash for SourceMaps<T> {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        std::mem::discriminant(self).deterministic_hash(state);
        match self {
            Self::None => {}
            Self::Full(map) | Self::Shallow(map) | Self::Shared(map) => {
                map.deterministic_hash(state);
            }
            Self::Both { full, shallow } => {
                full.deterministic_hash(state);
                shallow.deterministic_hash(state);
            }
        }
    }
}

impl<T: NonLocalValue> SourceMaps<T> {
    pub fn new(full: Option<T>, shallow: Option<T>) -> Self {
        match (full, shallow) {
            (Some(full), Some(shallow)) => Self::Both { full, shallow },
            (Some(full), None) => Self::Full(full),
            (None, Some(shallow)) => Self::Shallow(shallow),
            (None, None) => Self::None,
        }
    }

    pub fn get(&self, ty: SourceMapType) -> Option<&T> {
        match (self, ty) {
            (Self::Shared(map), _)
            | (Self::Full(map), SourceMapType::Full)
            | (Self::Shallow(map), SourceMapType::Shallow) => Some(map),
            (Self::Both { full, .. }, SourceMapType::Full) => Some(full),
            (Self::Both { shallow, .. }, SourceMapType::Shallow) => Some(shallow),
            _ => None,
        }
    }

    pub fn map<U: NonLocalValue>(self, mut f: impl FnMut(T) -> U) -> SourceMaps<U> {
        match self {
            Self::None => SourceMaps::None,
            Self::Full(map) => SourceMaps::Full(f(map)),
            Self::Shallow(map) => SourceMaps::Shallow(f(map)),
            Self::Both { full, shallow } => SourceMaps::Both {
                full: f(full),
                shallow: f(shallow),
            },
            Self::Shared(map) => SourceMaps::Shared(f(map)),
        }
    }

    pub fn try_map<U: NonLocalValue, E>(
        self,
        mut f: impl FnMut(T) -> Result<U, E>,
    ) -> Result<SourceMaps<U>, E> {
        Ok(match self {
            Self::None => SourceMaps::None,
            Self::Full(map) => SourceMaps::Full(f(map)?),
            Self::Shallow(map) => SourceMaps::Shallow(f(map)?),
            Self::Both { full, shallow } => SourceMaps::Both {
                full: f(full)?,
                shallow: f(shallow)?,
            },
            Self::Shared(map) => SourceMaps::Shared(f(map)?),
        })
    }

    pub async fn try_map_async<U: NonLocalValue, E, F>(
        self,
        mut f: impl FnMut(T) -> F,
    ) -> Result<SourceMaps<U>, E>
    where
        F: Future<Output = Result<U, E>>,
    {
        Ok(match self {
            Self::None => SourceMaps::None,
            Self::Full(map) => SourceMaps::Full(f(map).await?),
            Self::Shallow(map) => SourceMaps::Shallow(f(map).await?),
            Self::Both { full, shallow } => SourceMaps::Both {
                full: f(full).await?,
                shallow: f(shallow).await?,
            },
            Self::Shared(map) => SourceMaps::Shared(f(map).await?),
        })
    }
}
