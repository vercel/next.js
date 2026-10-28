use std::future::Future;

use bincode::{Decode, Encode};
use turbo_tasks::NonLocalValue;

use crate::source_map::SourceMapType;

/// Source maps associated with the same generated code.
#[derive(Clone, Debug, Default, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub enum SourceMaps<T: NonLocalValue> {
    #[default]
    None,
    Full(T),
    Partial(T),
    Both {
        full: T,
        partial: T,
    },
    Shared(T),
}

impl<T: NonLocalValue> SourceMaps<T> {
    pub fn new(full: Option<T>, partial: Option<T>) -> Self {
        match (full, partial) {
            (Some(full), Some(partial)) => Self::Both { full, partial },
            (Some(full), None) => Self::Full(full),
            (None, Some(partial)) => Self::Partial(partial),
            (None, None) => Self::None,
        }
    }

    pub fn get(&self, ty: SourceMapType) -> Option<&T> {
        match (self, ty) {
            (Self::Shared(map), _)
            | (Self::Full(map), SourceMapType::Full)
            | (Self::Partial(map), SourceMapType::Partial) => Some(map),
            (Self::Both { full, .. }, SourceMapType::Full) => Some(full),
            (Self::Both { partial, .. }, SourceMapType::Partial) => Some(partial),
            _ => None,
        }
    }

    pub fn map<U: NonLocalValue>(self, mut f: impl FnMut(T) -> U) -> SourceMaps<U> {
        match self {
            Self::None => SourceMaps::None,
            Self::Full(map) => SourceMaps::Full(f(map)),
            Self::Partial(map) => SourceMaps::Partial(f(map)),
            Self::Both { full, partial } => SourceMaps::Both {
                full: f(full),
                partial: f(partial),
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
            Self::Partial(map) => SourceMaps::Partial(f(map)?),
            Self::Both { full, partial } => SourceMaps::Both {
                full: f(full)?,
                partial: f(partial)?,
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
            Self::Partial(map) => SourceMaps::Partial(f(map).await?),
            Self::Both { full, partial } => SourceMaps::Both {
                full: f(full).await?,
                partial: f(partial).await?,
            },
            Self::Shared(map) => SourceMaps::Shared(f(map).await?),
        })
    }
}
