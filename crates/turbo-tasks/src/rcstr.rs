use std::{
    borrow::{Borrow, Cow},
    ffi::OsStr,
    fmt::{Debug, Display},
    ops::Deref,
    path::{Path, PathBuf},
    sync::Arc,
};

use serde::{Deserialize, Serialize};
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher};

use crate::debug::{ValueDebugFormat, ValueDebugFormatString};

/// This type exists to allow swapping out the underlying string type easily.
//
// If you want to change the underlying string type to `Arc<str>`, please ensure that you profile
// performance. The current implementation offers very cheap `String -> RcStr -> String`, meaning we
// only pay for the allocation for `Arc` when we pass `format!("").into()` to a function.
#[derive(Clone, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct RcStr(Arc<String>);

impl RcStr {
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }

    /// This implementation is more efficient than `.to_string()`
    pub fn into_owned(self) -> String {
        match Arc::try_unwrap(self.0) {
            Ok(v) => v,
            Err(arc) => arc.to_string(),
        }
    }

    pub fn map(self, f: impl FnOnce(String) -> String) -> Self {
        RcStr(Arc::new(f(self.into_owned())))
    }
}

impl DeterministicHash for RcStr {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        state.write_usize(self.len());
        state.write_bytes(self.as_bytes());
    }
}

impl Deref for RcStr {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        self.0.as_str()
    }
}

impl Borrow<str> for RcStr {
    fn borrow(&self) -> &str {
        self.0.as_str()
    }
}

impl From<Arc<String>> for RcStr {
    fn from(s: Arc<String>) -> Self {
        RcStr(s)
    }
}

impl From<String> for RcStr {
    fn from(s: String) -> Self {
        RcStr(Arc::new(s))
    }
}

impl From<&'_ str> for RcStr {
    fn from(s: &str) -> Self {
        RcStr(Arc::new(s.to_string()))
    }
}

impl From<Cow<'_, str>> for RcStr {
    fn from(s: Cow<str>) -> Self {
        RcStr(Arc::new(s.into_owned()))
    }
}

/// Mimic `&str`
impl AsRef<Path> for RcStr {
    fn as_ref(&self) -> &Path {
        (*self.0).as_ref()
    }
}

/// Mimic `&str`
impl AsRef<OsStr> for RcStr {
    fn as_ref(&self) -> &OsStr {
        (*self.0).as_ref()
    }
}

/// Mimic `&str`
impl AsRef<[u8]> for RcStr {
    fn as_ref(&self) -> &[u8] {
        (*self.0).as_ref()
    }
}

impl PartialEq<str> for RcStr {
    fn eq(&self, other: &str) -> bool {
        self.0.as_str() == other
    }
}

impl PartialEq<&'_ str> for RcStr {
    fn eq(&self, other: &&str) -> bool {
        self.0.as_str() == *other
    }
}

impl PartialEq<String> for RcStr {
    fn eq(&self, other: &String) -> bool {
        self.as_str() == other.as_str()
    }
}

impl Debug for RcStr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Debug::fmt(&self.0, f)
    }
}

impl Display for RcStr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&self.0, f)
    }
}

impl From<RcStr> for String {
    fn from(s: RcStr) -> Self {
        s.into_owned()
    }
}

impl From<RcStr> for PathBuf {
    fn from(s: RcStr) -> Self {
        String::from(s).into()
    }
}

impl ValueDebugFormat for RcStr {
    fn value_debug_format(&self, _: usize) -> ValueDebugFormatString {
        ValueDebugFormatString::Sync(self.to_string())
    }
}
