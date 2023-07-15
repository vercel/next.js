use serde::{Deserialize, Serialize};
use turbo_tasks::Vc;
use turbopack_binding::turbopack::node::route_matcher::{Params, RouteMatcher};

#[derive(Debug, Serialize, Deserialize, Eq, PartialEq)]
pub struct AllMatch;

impl RouteMatcher for AllMatch {
    fn matches(&self, _path: &str) -> Vc<bool> {
        Vc::cell(true)
    }

    fn params(&self, _path: &str) -> Vc<Params> {
        Vc::cell(Some(Default::default()))
    }
}
