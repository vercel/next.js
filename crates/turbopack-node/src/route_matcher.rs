use indexmap::IndexMap;
use turbo_tasks::primitives::BoolVc;

#[turbo_tasks::value(transparent)]
pub struct Params(Option<IndexMap<String, String>>);

/// Extracts parameters from a URL path.
#[turbo_tasks::value_trait]
pub trait RouteMatcher {
    /// Returns whether the given path is a match for the route.
    fn matches(&self, path: &str) -> BoolVc;

    /// Returns the parameters extracted from the given path.
    fn params(&self, path: &str) -> ParamsVc;
}
