use std::hash::{Hash, Hasher};

use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};
use turbo_tasks::{NonLocalValue, OperationValue, TaskInput, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;

#[derive(
    Clone,
    PartialEq,
    Eq,
    Debug,
    TraceRawVcs,
    Serialize,
    Deserialize,
    NonLocalValue,
    OperationValue,
    Encode,
    Decode,
)]
pub struct WebpackLoaderItem {
    pub loader: turbo_rcstr::RcStr,
    #[serde(default)]
    #[bincode(with = "turbo_bincode::serde_self_describing")]
    pub options: serde_json::Map<String, serde_json::Value>,
}

impl Hash for WebpackLoaderItem {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.loader.hash(state);
        // serde_json::Map doesn't implement Hash, so hash the canonical JSON string.
        // serde_json::Map preserves insertion order, and our maps are built
        // deterministically from AST traversal, so this is stable.
        let options_str = serde_json::to_string(&self.options).unwrap_or_default();
        options_str.hash(state);
    }
}

impl TaskInput for WebpackLoaderItem {
    fn is_transient(&self) -> bool {
        false
    }
}

/// Like `WebpackLoaderItem`, but with the loader path already resolved to a `FileSystemPath`.
#[derive(Clone, PartialEq, Eq, Debug, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub struct ResolvedWebpackLoaderItem {
    pub loader: FileSystemPath,
    #[bincode(with = "turbo_bincode::serde_self_describing")]
    pub options: serde_json::Map<String, serde_json::Value>,
}

impl Hash for ResolvedWebpackLoaderItem {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.loader.hash(state);
        let options_str = serde_json::to_string(&self.options).unwrap_or_default();
        options_str.hash(state);
    }
}

impl TaskInput for ResolvedWebpackLoaderItem {
    fn is_transient(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone)]
#[turbo_tasks::value(shared, transparent)]
pub struct WebpackLoaderItems(pub Vec<WebpackLoaderItem>);
