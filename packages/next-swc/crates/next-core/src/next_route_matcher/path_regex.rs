use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use turbopack_binding::{
    turbo::tasks::primitives::Regex,
    turbopack::node::route_matcher::{Param, Params, RouteMatcherRef},
};

/// A regular expression that matches a path, with named capture groups for the
/// dynamic parts of the path.
#[derive(Debug, Serialize, Deserialize, Eq, PartialEq)]
pub struct PathRegex {
    regex: Regex,
    named_params: Vec<NamedParam>,
}

#[derive(Debug, Serialize, Deserialize, Eq, PartialEq)]
struct NamedParam {
    name: String,
    kind: NamedParamKind,
}

#[derive(Debug, Serialize, Deserialize, Eq, PartialEq)]
enum NamedParamKind {
    Single,
    Multi,
}

impl std::fmt::Display for PathRegex {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.regex.as_str())
    }
}

impl RouteMatcherRef for PathRegex {
    fn matches(&self, path: &str) -> bool {
        self.regex.is_match(path)
    }

    fn params(&self, path: &str) -> Params {
        Params(self.regex.captures(path).map(|capture| {
            self.named_params
                .iter()
                .enumerate()
                .filter_map(|(idx, param)| {
                    if param.name.is_empty() {
                        return None;
                    }
                    let value = capture.get(idx + 1)?;
                    Some((
                        param.name.to_string(),
                        match param.kind {
                            NamedParamKind::Single => Param::Single(value.as_str().to_string()),
                            NamedParamKind::Multi => Param::Multi(
                                value
                                    .as_str()
                                    .split('/')
                                    .map(|segment| segment.to_string())
                                    .collect(),
                            ),
                        },
                    ))
                })
                .collect()
        }))
    }
}

/// Builder for [PathRegex].
pub struct PathRegexBuilder {
    regex_str: String,
    named_params: Vec<NamedParam>,
}

impl PathRegexBuilder {
    /// Creates a new [PathRegexBuilder].
    pub fn new() -> Self {
        Self {
            regex_str: "^".to_string(),
            named_params: Default::default(),
        }
    }

    fn include_slash(&self) -> bool {
        self.regex_str.len() > 1
    }

    fn push_str(&mut self, str: &str) {
        self.regex_str.push_str(str);
    }

    /// Pushes an optional catch all segment to the regex.
    pub fn push_optional_catch_all<N, R>(&mut self, name: N, rem: R)
    where
        N: Into<String>,
        R: AsRef<str>,
    {
        self.push_str(if self.include_slash() {
            "(?:/([^?]+))?"
        } else {
            "([^?]+)?"
        });
        self.push_str(&regex::escape(rem.as_ref()));
        self.named_params.push(NamedParam {
            name: name.into(),
            kind: NamedParamKind::Multi,
        });
    }

    /// Pushes a catch all segment to the regex.
    pub fn push_catch_all<N, R>(&mut self, name: N, rem: R)
    where
        N: Into<String>,
        R: AsRef<str>,
    {
        if self.include_slash() {
            self.push_str("/");
        }
        self.push_str("([^?]+)");
        self.push_str(&regex::escape(rem.as_ref()));
        self.named_params.push(NamedParam {
            name: name.into(),
            kind: NamedParamKind::Multi,
        });
    }

    /// Pushes a dynamic segment to the regex.
    pub fn push_dynamic_segment<N, R>(&mut self, name: N, rem: R)
    where
        N: Into<String>,
        R: AsRef<str>,
    {
        if self.include_slash() {
            self.push_str("/");
        }
        self.push_str("([^?/]+)");
        self.push_str(&regex::escape(rem.as_ref()));
        self.named_params.push(NamedParam {
            name: name.into(),
            kind: NamedParamKind::Single,
        });
    }

    /// Pushes a static segment to the regex.
    pub fn push_static_segment<S>(&mut self, segment: S)
    where
        S: AsRef<str>,
    {
        if self.include_slash() {
            self.push_str("/");
        }
        self.push_str(&regex::escape(segment.as_ref()));
    }

    /// Builds and returns the [PathRegex].
    pub fn build(mut self) -> Result<PathRegex> {
        self.regex_str += "$";
        Ok(PathRegex {
            regex: Regex(regex::Regex::new(&self.regex_str).with_context(|| "invalid path regex")?),
            named_params: self.named_params,
        })
    }
}

impl Default for PathRegexBuilder {
    fn default() -> Self {
        Self::new()
    }
}
