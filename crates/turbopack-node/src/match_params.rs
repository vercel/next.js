use indexmap::IndexMap;
use turbo_tasks::{primitives::BoolVc, ValueToString, ValueToStringVc};

#[turbo_tasks::value(transparent)]
pub struct ParamsMatches(Option<IndexMap<String, String>>);

/// Extracts parameters from a URL path.
#[turbo_tasks::value_trait]
pub trait MatchParams: ValueToString {
    /// Returns whether the given path is a match.
    fn is_match(&self, path: &str) -> BoolVc;

    /// Returns the parameters extracted from the given path.
    fn get_matches(&self, path: &str) -> ParamsMatchesVc;
}
