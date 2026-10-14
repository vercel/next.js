use std::future::Future;

use bincode::{Decode, Encode};
use turbo_tasks::NonLocalValue;

/// Full and partial maps associated with the same generated code.
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub struct SourceMaps<T: NonLocalValue> {
    pub full: Option<T>,
    pub partial: Option<T>,
}

impl<T: NonLocalValue> Default for SourceMaps<T> {
    fn default() -> Self {
        Self {
            full: None,
            partial: None,
        }
    }
}

impl<T: NonLocalValue> SourceMaps<T> {
    pub fn try_map<U: NonLocalValue, E>(
        self,
        mut f: impl FnMut(T) -> Result<U, E>,
    ) -> Result<SourceMaps<U>, E> {
        Ok(SourceMaps {
            full: self.full.map(&mut f).transpose()?,
            partial: self.partial.map(f).transpose()?,
        })
    }

    pub async fn try_map_async<U: NonLocalValue, E, F>(
        self,
        mut f: impl FnMut(T) -> F,
    ) -> Result<SourceMaps<U>, E>
    where
        F: Future<Output = Result<U, E>>,
    {
        Ok(SourceMaps {
            full: match self.full {
                Some(map) => Some(f(map).await?),
                None => None,
            },
            partial: match self.partial {
                Some(map) => Some(f(map).await?),
                None => None,
            },
        })
    }
}
