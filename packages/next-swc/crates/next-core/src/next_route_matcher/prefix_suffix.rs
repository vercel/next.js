use serde::{Deserialize, Serialize};
use turbo_tasks::Vc;
use turbopack_binding::turbopack::node::route_matcher::{Params, RouteMatcher};

/// A composite route matcher that matches a path if it has a given prefix and
/// suffix.
#[derive(Debug, Serialize, Deserialize, Eq, PartialEq)]
pub struct PrefixSuffixMatcher<T>
where
    T: RouteMatcher,
{
    prefix: String,
    suffix: String,
    inner: T,
}

impl<T> PrefixSuffixMatcher<T>
where
    T: RouteMatcher,
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

impl<T> RouteMatcher for PrefixSuffixMatcher<T>
where
    T: RouteMatcher,
{
    fn matches(&self, path: &str) -> Vc<bool> {
        if let Some(path) = self.strip_prefix_and_suffix(path) {
            self.inner.matches(path)
        } else {
            Vc::cell(false)
        }
    }

    fn params(&self, path: &str) -> Vc<Params> {
        if let Some(path) = self.strip_prefix_and_suffix(path) {
            self.inner.params(path)
        } else {
            Vc::cell(None)
        }
    }
}
