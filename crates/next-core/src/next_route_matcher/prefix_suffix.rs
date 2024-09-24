use serde::{Deserialize, Serialize};
use turbopack_node::route_matcher::{Params, RouteMatcherRef};

/// A composite route matcher that matches a path if it has a given prefix and
/// suffix.
#[derive(Debug, Serialize, Deserialize, Eq, PartialEq)]
pub struct PrefixSuffixMatcher<T>
where
    T: RouteMatcherRef,
{
    prefix: String,
    suffix: String,
    inner: T,
}

impl<T> PrefixSuffixMatcher<T>
where
    T: RouteMatcherRef,
{
    /// Creates a new [PrefixSuffixMatcher].
    pub fn new(prefix: String, suffix: String, inner: T) -> Self {
        Self {
            prefix,
            suffix,
            inner,
        }
    }

    fn strip_prefix_and_suffix<'b>(&self, path: &'b str) -> Option<&'b str> {
        path.strip_prefix(self.prefix.as_str())?
            .strip_suffix(self.suffix.as_str())
    }
}

impl<T> RouteMatcherRef for PrefixSuffixMatcher<T>
where
    T: RouteMatcherRef,
{
    fn matches(&self, path: &str) -> bool {
        if let Some(path) = self.strip_prefix_and_suffix(path) {
            self.inner.matches(path)
        } else {
            false
        }
    }

    fn params(&self, path: &str) -> Params {
        if let Some(path) = self.strip_prefix_and_suffix(path) {
            self.inner.params(path)
        } else {
            Params(None)
        }
    }
}
