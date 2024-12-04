use serde::{Deserialize, Serialize};
use turbopack_node::route_matcher::{Params, RouteMatcherRef};

#[derive(Debug, Serialize, Deserialize, Eq, PartialEq)]
pub struct AllMatch;

impl RouteMatcherRef for AllMatch {
    fn matches(&self, _path: &str) -> bool {
        true
    }

    fn params(&self, _path: &str) -> Params {
        Params(Some(Default::default()))
    }
}
