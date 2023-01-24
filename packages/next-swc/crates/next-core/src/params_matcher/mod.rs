use anyhow::{bail, Result};
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    ValueToString, ValueToStringVc,
};
use turbopack_node::match_params::{MatchParams, MatchParamsVc, ParamsMatchesVc};

use self::path_regex::{PathRegex, PathRegexBuilder};

mod path_regex;

#[turbo_tasks::value]
pub(crate) struct NextParamsMatcher {
    #[turbo_tasks(trace_ignore)]
    path_regex: PathRegex,
    prefix: Option<StringVc>,
    suffix: Option<StringVc>,
}

#[turbo_tasks::value_impl]
impl NextParamsMatcherVc {
    /// Converts a filename within the server root into a regular expression
    /// with named capture groups for every dynamic segment.
    #[turbo_tasks::function]
    pub async fn new(
        pathname: StringVc,
        prefix: Option<StringVc>,
        suffix: Option<StringVc>,
    ) -> Result<Self> {
        let path = pathname.await?;

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

        Ok(Self::cell(NextParamsMatcher {
            path_regex: path_regex.build()?,
            prefix,
            suffix,
        }))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for NextParamsMatcher {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell(self.path_regex.to_string())
    }
}

impl NextParamsMatcher {
    async fn strip_prefix_and_suffix<'a, 'b>(&'a self, path: &'b str) -> Result<Option<&'b str>> {
        let path = match self.prefix {
            Some(prefix) => match path.strip_prefix(prefix.await?.as_str()) {
                Some(path) => path,
                None => return Ok(None),
            },
            None => path,
        };

        let path = match self.suffix {
            Some(suffix) => match path.strip_suffix(suffix.await?.as_str()) {
                Some(path) => path,
                None => return Ok(None),
            },
            None => path,
        };

        Ok(Some(path))
    }
}

#[turbo_tasks::value_impl]
impl MatchParams for NextParamsMatcher {
    #[turbo_tasks::function]
    async fn is_match(&self, path: &str) -> Result<BoolVc> {
        Ok(BoolVc::cell(
            self.strip_prefix_and_suffix(path)
                .await?
                .map_or(false, |path| self.path_regex.is_match(path)),
        ))
    }

    #[turbo_tasks::function]
    async fn get_matches(&self, path: &str) -> Result<ParamsMatchesVc> {
        Ok(ParamsMatchesVc::cell(
            self.strip_prefix_and_suffix(path)
                .await?
                .and_then(|path| self.path_regex.get_matches(path)),
        ))
    }
}
