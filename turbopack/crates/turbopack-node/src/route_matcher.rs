use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, Vc};

#[turbo_tasks::value]
#[derive(Debug, Clone)]
#[serde(untagged)]
pub enum Param {
    Single(RcStr),
    Multi(Vec<RcStr>),
}

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct Params(pub Option<FxIndexMap<RcStr, Param>>);

/// Extracts parameters from a URL path.
pub trait RouteMatcherRef {
    /// Returns whether the given path is a match for the route.
    fn matches(&self, path: &str) -> bool;

    /// Returns the parameters extracted from the given path.
    fn params(&self, path: &str) -> Params;
}

/// Extracts parameters from a URL path (Vc version)
#[turbo_tasks::value_trait]
pub trait RouteMatcher {
    /// Returns whether the given path is a match for the route.
    fn matches(self: Vc<Self>, path: RcStr) -> Vc<bool>;

    /// Returns the parameters extracted from the given path.
    fn params(self: Vc<Self>, path: RcStr) -> Vc<Params>;
}
