use anyhow::{Context, Result};
use indexmap::IndexMap;
use turbo_tasks::{
    primitives::{Regex, StringVc},
    ValueToString, ValueToStringVc,
};

/// A regular expression that matches a path, with named capture groups for the
/// dynamic parts of the path.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct PathRegex {
    regex: Regex,
    named_params: Vec<String>,
}

impl PathRegex {
    /// Returns true if the given path matches the regular expression.
    pub fn is_match(&self, path: &str) -> bool {
        self.regex.is_match(path)
    }

    /// Matches a path with the regular expression and returns a map with the
    /// named captures.
    pub fn get_matches(&self, path: &str) -> Option<IndexMap<String, String>> {
        self.regex.captures(path).map(|capture| {
            self.named_params
                .iter()
                .enumerate()
                .filter_map(|(idx, name)| {
                    let value = capture.get(idx + 1)?;
                    Some((name.to_string(), value.as_str().to_string()))
                })
                .collect()
        })
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for PathRegex {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell(self.regex.as_str().to_string())
    }
}

/// Builder for [PathRegex].
pub struct PathRegexBuilder {
    regex_str: String,
    named_params: Vec<String>,
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
            "(/[^?]+)?"
        } else {
            "([^?]+)?"
        });
        self.push_str(&regex::escape(rem.as_ref()));
        self.named_params.push(name.into());
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
        self.named_params.push(name.into());
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
        self.named_params.push(name.into());
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
