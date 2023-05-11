use serde::{Deserialize, Serialize};
use turbo_binding::{
    turbo::tasks::primitives::BoolVc,
    turbopack::node::route_matcher::{ParamsVc, RouteMatcher},
};

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
    fn matches(&self, path: &str) -> BoolVc {
        if let Some(path) = self.strip_prefix_and_suffix(path) {
            self.inner.matches(path)
        } else {
            BoolVc::cell(false)
        }
    }

    fn params(&self, path: &str) -> ParamsVc {
        if let Some(path) = self.strip_prefix_and_suffix(path) {
            self.inner.params(path)
        } else {
            ParamsVc::cell(None)
        }
    }
}
