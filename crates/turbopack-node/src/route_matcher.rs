use indexmap::IndexMap;
use turbo_tasks::primitives::BoolVc;

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
#[serde(untagged)]
pub enum Param {
    Single(String),
    Multi(Vec<String>),
}

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct Params(Option<IndexMap<String, Param>>);

/// Extracts parameters from a URL path.
#[turbo_tasks::value_trait]
pub trait RouteMatcher {
    /// Returns whether the given path is a match for the route.
    fn matches(&self, path: &str) -> BoolVc;

    /// Returns the parameters extracted from the given path.
    fn params(&self, path: &str) -> ParamsVc;
}
