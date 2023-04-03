use anyhow::{bail, Result};
use turbo_binding::{
    turbo::tasks::primitives::{BoolVc, StringVc},
    turbopack::node::route_matcher::{ParamsVc, RouteMatcher, RouteMatcherVc},
};

use self::{
    all::AllMatch,
    path_regex::{PathRegex, PathRegexBuilder},
    prefix_suffix::PrefixSuffixMatcher,
};

mod all;
mod path_regex;
mod prefix_suffix;

/// A route matcher that matches a path against an exact route.
#[turbo_tasks::value]
pub(crate) struct NextExactMatcher {
    path: StringVc,
}

#[turbo_tasks::value_impl]
impl NextExactMatcherVc {
    #[turbo_tasks::function]
    pub async fn new(path: StringVc) -> Result<Self> {
        Ok(Self::cell(NextExactMatcher { path }))
    }
}

#[turbo_tasks::value_impl]
impl RouteMatcher for NextExactMatcher {
    #[turbo_tasks::function]
    async fn matches(&self, path: &str) -> Result<BoolVc> {
        Ok(BoolVc::cell(path == *self.path.await?))
    }

    #[turbo_tasks::function]
    async fn params(&self, path: &str) -> Result<ParamsVc> {
        Ok(ParamsVc::cell(if path == *self.path.await? {
            Some(Default::default())
        } else {
            None
        }))
    }
}

/// A route matcher that matches a path against a route regex.
#[turbo_tasks::value]
pub(crate) struct NextParamsMatcher {
    #[turbo_tasks(trace_ignore)]
    matcher: PathRegex,
}

#[turbo_tasks::value_impl]
impl NextParamsMatcherVc {
    #[turbo_tasks::function]
    pub async fn new(path: StringVc) -> Result<Self> {
        Ok(Self::cell(NextParamsMatcher {
            matcher: build_path_regex(path.await?.as_str())?,
        }))
    }
}

#[turbo_tasks::value_impl]
impl RouteMatcher for NextParamsMatcher {
    #[turbo_tasks::function]
    fn matches(&self, path: &str) -> BoolVc {
        self.matcher.matches(path)
    }

    #[turbo_tasks::function]
    fn params(&self, path: &str) -> ParamsVc {
        self.matcher.params(path)
    }
}

/// A route matcher that strips a prefix and a suffix from a path before
/// matching it against a route regex.
#[turbo_tasks::value]
pub(crate) struct NextPrefixSuffixParamsMatcher {
    #[turbo_tasks(trace_ignore)]
    matcher: PrefixSuffixMatcher<PathRegex>,
}

#[turbo_tasks::value_impl]
impl NextPrefixSuffixParamsMatcherVc {
    /// Converts a filename within the server root into a regular expression
    /// with named capture groups for every dynamic segment.
    #[turbo_tasks::function]
    pub async fn new(path: StringVc, prefix: &str, suffix: &str) -> Result<Self> {
        Ok(Self::cell(NextPrefixSuffixParamsMatcher {
            matcher: PrefixSuffixMatcher::new(
                prefix.to_string(),
                suffix.to_string(),
                build_path_regex(path.await?.as_str())?,
            ),
        }))
    }
}

#[turbo_tasks::value_impl]
impl RouteMatcher for NextPrefixSuffixParamsMatcher {
    #[turbo_tasks::function]
    fn matches(&self, path: &str) -> BoolVc {
        self.matcher.matches(path)
    }

    #[turbo_tasks::function]
    fn params(&self, path: &str) -> ParamsVc {
        self.matcher.params(path)
    }
}

/// A route matcher that matches against all paths.
#[turbo_tasks::value]
pub(crate) struct NextFallbackMatcher {
    #[turbo_tasks(trace_ignore)]
    matcher: AllMatch,
}

#[turbo_tasks::value_impl]
impl NextFallbackMatcherVc {
    #[turbo_tasks::function]
    pub fn new() -> Self {
        Self::cell(NextFallbackMatcher { matcher: AllMatch })
    }
}

#[turbo_tasks::value_impl]
impl RouteMatcher for NextFallbackMatcher {
    #[turbo_tasks::function]
    fn matches(&self, path: &str) -> BoolVc {
        self.matcher.matches(path)
    }

    #[turbo_tasks::function]
    fn params(&self, path: &str) -> ParamsVc {
        self.matcher.params(path)
    }
}

/// Converts a filename within the server root into a regular expression
/// with named capture groups for every dynamic segment.
fn build_path_regex(path: &str) -> Result<PathRegex> {
    let mut path_regex = PathRegexBuilder::new();
    for segment in path.split('/') {
        if let Some(segment) = segment.strip_prefix('[') {
            if let Some(segment) = segment.strip_prefix("[...") {
                if let Some((placeholder, rem)) = segment.split_once("]]") {
                    path_regex.push_optional_catch_all(placeholder, rem);
                } else {
                    bail!(
                        "path ({}) contains '[[' without matching ']]' at '[[...{}'",
                        path,
                        segment
                    );
                }
            } else if let Some(segment) = segment.strip_prefix("...") {
                if let Some((placeholder, rem)) = segment.split_once(']') {
                    path_regex.push_catch_all(placeholder, rem);
                } else {
                    bail!(
                        "path ({}) contains '[' without matching ']' at '[...{}'",
                        path,
                        segment
                    );
                }
            } else if let Some((placeholder, rem)) = segment.split_once(']') {
                path_regex.push_dynamic_segment(placeholder, rem);
            } else {
                bail!(
                    "path ({}) contains '[' without matching ']' at '[{}'",
                    path,
                    segment
                );
            }
        } else {
            path_regex.push_static_segment(segment);
        }
    }
    path_regex.build()
}
