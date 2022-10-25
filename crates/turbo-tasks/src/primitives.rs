use std::{collections::HashSet, ops::Deref};

use anyhow::Result;

use crate::{self as turbo_tasks, RawVc, ValueToString, ValueToStringVc};

#[turbo_tasks::value(transparent)]
pub struct String(std::string::String);

#[turbo_tasks::value_impl]
impl StringVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        Self::cell("".to_string())
    }
}

#[turbo_tasks::value(transparent)]
pub struct U64(u64);

#[turbo_tasks::value(transparent)]
pub struct OptionString(Option<std::string::String>);

#[turbo_tasks::value(transparent)]
pub struct Strings(Vec<std::string::String>);

#[turbo_tasks::value_impl]
impl StringsVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        Self::cell(Vec::new())
    }
}

#[turbo_tasks::value(transparent)]
pub struct Bool(bool);

#[turbo_tasks::value(transparent)]
pub struct RawVcSet(HashSet<RawVc>);

#[turbo_tasks::value(transparent)]
pub struct JsonValue(serde_json::Value);

#[turbo_tasks::value_impl]
impl ValueToString for JsonValue {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell(self.0.to_string())
    }
}

#[turbo_tasks::value(transparent, eq = "manual")]
#[derive(Debug)]
pub struct Regex(
    #[turbo_tasks(trace_ignore)]
    #[serde(with = "serde_regex")]
    pub regex::Regex,
);

impl Deref for Regex {
    type Target = regex::Regex;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl PartialEq for Regex {
    fn eq(&self, other: &Regex) -> bool {
        // Context: https://github.com/rust-lang/regex/issues/313#issuecomment-269898900
        self.0.as_str() == other.0.as_str()
    }
}
impl Eq for Regex {}
