use std::{
    fmt::{self, Display},
    future::Future,
};

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
pub use turbo_tasks_macros::ValueToString;

use crate::{self as turbo_tasks, ReadRef, VcValueType, vc::ResolvedVc};

/// Async counterpart to `Display`, returning `Vc<RcStr>`.
///
/// Use `#[derive(ValueToString)]` to generate an implementation.
#[doc = include_str!("../FORMATTING.md")]
#[turbo_tasks::value_trait]
pub trait ValueToString {
    #[turbo_tasks::function]
    fn to_string(self: Vc<Self>) -> Vc<RcStr>;
}

/// Implements an async counterpart to `Display`, returning `RcStr`. This may
/// act as an optimization.
pub trait ValueToStringRef {
    fn to_string_ref(&self) -> impl Future<Output = Result<RcStr>> + Send;
}

/// Ref-following: `&T` delegates to `T`'s `ValueToStringRef`.
impl<T: ValueToStringRef + Sync> ValueToStringRef for &T {
    fn to_string_ref(&self) -> impl Future<Output = Result<RcStr>> + Send {
        (**self).to_string_ref()
    }
}

/// Identity implementation: `RcStr` just returns itself.
#[turbo_tasks::value_impl]
impl ValueToString for RcStr {
    #[turbo_tasks::function]
    fn to_string(self: Vc<Self>) -> Vc<RcStr> {
        self
    }
}

/// Identity implementation: `RcStr` just returns itself.
impl ValueToStringRef for RcStr {
    async fn to_string_ref(&self) -> Result<RcStr> {
        Ok(self.clone())
    }
}

/// Part of the auto-deref specialization system.
#[doc(hidden)]
#[macro_export]
macro_rules! __turbo_stringify {
    ($name:ident, $i:expr) => {
        let __tmp = $crate::display::ValueToStringifyWrap($i);
        // Ugh: https://sabrinajewson.org/blog/truly-hygienic-let
        // This "let mut" makes errors more obvious in this case
        let mut $name: $crate::display::StringifyType = {
            use $crate::display::ValueToStringify as _;
            (&&&__tmp).to_stringify().await?
        };
    };
}

/// Part of the auto-deref specialization system.
#[doc(hidden)]
pub struct ValueToStringifyWrap<T>(pub T);

/// Part of the auto-deref specialization system.
#[doc(hidden)]
pub trait ValueToStringify<const LEVEL: u8> {
    fn to_stringify(&self) -> impl Future<Output = Result<StringifyType>> + Send;
}

/// Part of the auto-deref specialization system.
#[doc(hidden)]
pub enum StringifyType {
    RcStrRef(ReadRef<RcStr>),
    RcStr(RcStr),
    String(String),
}

impl AsRef<str> for StringifyType {
    fn as_ref(&self) -> &str {
        match self {
            StringifyType::RcStrRef(s) => s.as_str(),
            StringifyType::RcStr(s) => s.as_str(),
            StringifyType::String(s) => s.as_str(),
        }
    }
}

impl fmt::Debug for StringifyType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(self.as_ref(), f)
    }
}

impl Display for StringifyType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_ref())
    }
}

impl From<StringifyType> for RcStr {
    fn from(s: StringifyType) -> Self {
        match s {
            StringifyType::RcStrRef(r) => (*r).clone(),
            StringifyType::RcStr(r) => r.clone(),
            StringifyType::String(s) => RcStr::from(s),
        }
    }
}

/// Blanket impl: uses synchronous `Display::to_string()` for owned values.
impl<T: Display + Send + Sync> ValueToStringify<1> for &ValueToStringifyWrap<&T> {
    #[inline(always)]
    fn to_stringify(&self) -> impl Future<Output = Result<StringifyType>> + Send {
        let s = (self.0).to_string();
        async move { Ok(StringifyType::String(s)) }
    }
}

impl<T: Send> ValueToStringify<2> for &&ValueToStringifyWrap<&Vc<T>>
where
    T: ValueToString,
{
    #[inline(always)]
    fn to_stringify(&self) -> impl Future<Output = Result<StringifyType>> + Send {
        let vc = self.0;
        async move {
            let s = vc.to_string().await?;
            Ok(StringifyType::RcStrRef(s))
        }
    }
}

impl<T: Send> ValueToStringify<2> for &&ValueToStringifyWrap<&ResolvedVc<T>>
where
    T: ValueToString,
{
    #[inline(always)]
    fn to_stringify(&self) -> impl Future<Output = Result<StringifyType>> + Send {
        let vc = self.0;
        async move {
            let s = vc.to_string().await?;
            Ok(StringifyType::RcStrRef(s))
        }
    }
}

impl<T: Send> ValueToStringify<2> for &&&ValueToStringifyWrap<&T>
where
    T: ValueToStringRef,
{
    #[inline(always)]
    fn to_stringify(&self) -> impl Future<Output = Result<StringifyType>> {
        let s = self.0.to_string_ref();
        async move { Ok(StringifyType::RcStr(s.await?)) }
    }
}

impl<T: Send> ValueToStringify<3> for &&&ValueToStringifyWrap<&ReadRef<T>>
where
    T: ValueToString + VcValueType,
{
    #[inline(always)]
    async fn to_stringify(&self) -> Result<StringifyType> {
        let s = ReadRef::<T>::cell((self.0).clone()).to_string().await?;
        Ok(StringifyType::RcStrRef(s))
    }
}
