use std::collections::HashSet;

use anyhow::Result;

use crate::{self as turbo_tasks, RawVc, ValueToString, ValueToStringVc};

#[turbo_tasks::value(transparent)]
pub struct String(std::string::String);

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
