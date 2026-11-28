use std::hash::Hash;

use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, OperationValue, OrderedJsonMap, TaskInput};
use turbo_tasks_fs::FileSystemPath;

/// Parse inline requests before splitting loader queries. The boolean suppresses configured
/// loaders; without pre/post loaders, `!`, `!!`, and `-!` have the same effect.
/// Match-resource requests (`!=!`) are not handled here.
pub fn parse_inline_loader_request(request: &str) -> Option<(bool, Vec<&str>, &str)> {
    if request.starts_with("data:") || request.starts_with("//") || request.contains("!=!") {
        return None;
    }
    if request
        .split(['!', '?', '#'])
        .next()
        .unwrap_or_default()
        .contains("://")
    {
        return None;
    }
    let (skip, rest) = if let Some(rest) = request.strip_prefix("!!") {
        (true, rest)
    } else if let Some(rest) = request.strip_prefix("-!") {
        (true, rest)
    } else if let Some(rest) = request.strip_prefix('!') {
        (true, rest)
    } else {
        (false, request)
    };
    if !skip && !rest.contains('!') {
        return None;
    }
    let mut segments = rest.split('!');
    let resource = segments.next_back().unwrap_or_default();
    Some((skip, segments.filter(|s| !s.is_empty()).collect(), resource))
}

#[derive(
    Clone,
    PartialEq,
    Eq,
    Hash,
    Debug,
    Serialize,
    Deserialize,
    NonLocalValue,
    OperationValue,
    Encode,
    Decode,
)]
pub struct WebpackLoaderItem {
    pub loader: RcStr,
    /// Ordered: the options are passed to the loader, where key order is observable.
    #[serde(default)]
    pub options: OrderedJsonMap,
}

impl TaskInput for WebpackLoaderItem {
    fn is_transient(&self) -> bool {
        false
    }
}

/// Like `WebpackLoaderItem`, but with the loader path already resolved to a `FileSystemPath`.
#[derive(Clone, PartialEq, Eq, Hash, Debug, NonLocalValue, Encode, Decode)]
pub struct ResolvedWebpackLoaderItem {
    pub loader: FileSystemPath,
    pub options: OrderedJsonMap,
}

impl TaskInput for ResolvedWebpackLoaderItem {
    fn is_transient(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone)]
#[turbo_tasks::value(shared, transparent)]
pub struct WebpackLoaderItems(pub Vec<WebpackLoaderItem>);

impl std::fmt::Display for WebpackLoaderItems {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut iter = self.0.iter();

        if let Some(first) = iter.next() {
            write!(f, "{}", first.loader)?;
            for remaining in iter {
                write!(f, ", {}", remaining.loader)?;
            }
        }

        Ok(())
    }
}
