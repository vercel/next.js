use std::{future::IntoFuture, ops::Deref};

use anyhow::Result;
use futures::TryFutureExt;
// This specific macro identifier is detected by turbo-tasks-build.
use turbo_tasks_macros::primitive as __turbo_tasks_internal_primitive;

use crate::{
    RcStr, TryJoinIterExt, Vc, {self as turbo_tasks},
};

__turbo_tasks_internal_primitive!(());
__turbo_tasks_internal_primitive!(String);
__turbo_tasks_internal_primitive!(RcStr);

#[turbo_tasks::function]
fn empty_string() -> Vc<RcStr> {
    Vc::cell(RcStr::default())
}

impl Vc<RcStr> {
    #[deprecated(note = "use Default::default() instead")]
    #[inline(always)]
    pub fn empty() -> Vc<RcStr> {
        empty_string()
    }
}

__turbo_tasks_internal_primitive!(Option<String>);
__turbo_tasks_internal_primitive!(Option<RcStr>);
__turbo_tasks_internal_primitive!(Vec<RcStr>);

#[turbo_tasks::function]
fn empty_string_vec() -> Vc<Vec<RcStr>> {
    Vc::cell(Vec::new())
}

impl Vc<Vec<RcStr>> {
    #[deprecated(note = "use Default::default() instead")]
    #[inline(always)]
    pub fn empty() -> Vc<Vec<RcStr>> {
        empty_string_vec()
    }
}

__turbo_tasks_internal_primitive!(Option<u16>);

#[turbo_tasks::function]
fn option_string_none() -> Vc<Option<String>> {
    Vc::cell(None)
}

impl Vc<Option<String>> {
    #[deprecated(note = "use Default::default() instead")]
    pub fn none() -> Self {
        option_string_none()
    }
}

__turbo_tasks_internal_primitive!(bool);
__turbo_tasks_internal_primitive!(u8);
__turbo_tasks_internal_primitive!(u16);
__turbo_tasks_internal_primitive!(u32);
__turbo_tasks_internal_primitive!(u64);
__turbo_tasks_internal_primitive!(u128);
__turbo_tasks_internal_primitive!(i8);
__turbo_tasks_internal_primitive!(i16);
__turbo_tasks_internal_primitive!(i32);
__turbo_tasks_internal_primitive!(i64);
__turbo_tasks_internal_primitive!(i128);
__turbo_tasks_internal_primitive!(usize);
__turbo_tasks_internal_primitive!(isize);
__turbo_tasks_internal_primitive!(serde_json::Value);
__turbo_tasks_internal_primitive!(Vec<u8>);

__turbo_tasks_internal_primitive!(Vec<bool>);

#[turbo_tasks::value(transparent)]
pub struct Bools(Vec<Vc<bool>>);

#[turbo_tasks::value_impl]
impl Bools {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Bools> {
        Vc::cell(Vec::new())
    }

    #[turbo_tasks::function]
    async fn into_bools(self: Vc<Bools>) -> Result<Vc<Vec<bool>>> {
        let this = self.await?;

        let bools = this
            .iter()
            .map(|b| b.into_future().map_ok(|b| *b))
            .try_join()
            .await?;

        Ok(Vc::cell(bools))
    }

    #[turbo_tasks::function]
    pub async fn all(self: Vc<Bools>) -> Result<Vc<bool>> {
        let bools = self.into_bools().await?;

        Ok(Vc::cell(bools.iter().all(|b| *b)))
    }

    #[turbo_tasks::function]
    pub async fn any(self: Vc<Bools>) -> Result<Vc<bool>> {
        let bools = self.into_bools().await?;

        Ok(Vc::cell(bools.iter().any(|b| *b)))
    }
}

#[turbo_tasks::value(transparent, eq = "manual")]
#[derive(Debug, Clone)]
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
