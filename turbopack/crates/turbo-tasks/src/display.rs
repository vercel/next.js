use std::future::Future;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
pub use turbo_tasks_macros::ValueToString;

use crate::{self as turbo_tasks};

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
#[cfg(not(feature = "sync"))]
pub trait ValueToStringRef {
    fn to_string_ref(&self) -> impl Future<Output = Result<RcStr>> + Send;
}

/// Implements a synchronous counterpart to `Display`, returning `RcStr` (sync build).
#[cfg(feature = "sync")]
pub trait ValueToStringRef {
    fn to_string_ref(&self) -> Result<RcStr>;
}

/// Ref-following: `&T` delegates to `T`'s `ValueToStringRef`.
#[cfg(not(feature = "sync"))]
impl<T: ValueToStringRef + Sync> ValueToStringRef for &T {
    fn to_string_ref(&self) -> impl Future<Output = Result<RcStr>> + Send {
        (**self).to_string_ref()
    }
}

/// Ref-following: `&T` delegates to `T`'s `ValueToStringRef`.
#[cfg(feature = "sync")]
impl<T: ValueToStringRef + Sync> ValueToStringRef for &T {
    fn to_string_ref(&self) -> Result<RcStr> {
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
#[cfg(not(feature = "sync"))]
impl ValueToStringRef for RcStr {
    async fn to_string_ref(&self) -> Result<RcStr> {
        Ok(self.clone())
    }
}

/// Identity implementation: `RcStr` just returns itself.
#[cfg(feature = "sync")]
impl ValueToStringRef for RcStr {
    fn to_string_ref(&self) -> Result<RcStr> {
        Ok(self.clone())
    }
}

/// Deref-following: `ReadRef<T>` delegates to the deref target's `ValueToStringRef`.
#[cfg(not(feature = "sync"))]
impl<T> ValueToStringRef for crate::ReadRef<T>
where
    T: crate::VcValueType,
    <T::Read as crate::VcRead<T>>::Target: ValueToStringRef,
{
    fn to_string_ref(&self) -> impl Future<Output = Result<RcStr>> + Send {
        (**self).to_string_ref()
    }
}

/// Deref-following: `ReadRef<T>` delegates to the deref target's `ValueToStringRef`.
#[cfg(feature = "sync")]
impl<T> ValueToStringRef for crate::ReadRef<T>
where
    T: crate::VcValueType,
    <T::Read as crate::VcRead<T>>::Target: ValueToStringRef,
{
    fn to_string_ref(&self) -> Result<RcStr> {
        (**self).to_string_ref()
    }
}

/// Part of the auto-deref specialization system.
#[doc(hidden)]
#[macro_export]
macro_rules! __turbo_stringify {
    ($name:ident, $i:expr) => {
        // Ugh: https://sabrinajewson.org/blog/truly-hygienic-let
        // This "let mut" makes errors more obvious in this case
        let mut $name: $crate::display::macro_helpers::StringifyType = {
            use $crate::display::macro_helpers::ValueToStringify as _;
            let tmp = $crate::display::macro_helpers::ValueToStringifyWrap($i);
            // `read!` is the dual-mode read: `.await` in the async build, inline under
            // `sync`. `turbobail!` expands into a non-async block inside a (sync-mode
            // non-async) `#[turbo_tasks::function]` body, so a raw `.await` is illegal.
            $crate::read!((&&&tmp).to_stringify())?
        };
    };
}

/// Runtime helpers for the `turbofmt!`/`turbobail!` macros. Not part of the
/// public API.
#[doc(hidden)]
pub mod macro_helpers {
    use std::{
        fmt::{self, Display},
        future::Future,
    };

    use anyhow::Result;
    use turbo_rcstr::RcStr;

    use super::{ValueToString, ValueToStringRef};
    use crate::vc::ResolvedVc;

    pub struct ValueToStringifyWrap<T>(pub T);

    #[cfg(not(feature = "sync"))]
    pub trait ValueToStringify<const LEVEL: u8> {
        fn to_stringify(&self) -> impl Future<Output = Result<StringifyType>> + Send;
    }

    #[cfg(feature = "sync")]
    pub trait ValueToStringify<const LEVEL: u8> {
        fn to_stringify(&self) -> Result<StringifyType>;
    }

    pub enum StringifyType {
        RcStr(RcStr),
        String(String),
    }

    impl AsRef<str> for StringifyType {
        fn as_ref(&self) -> &str {
            match self {
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
                StringifyType::RcStr(r) => r,
                StringifyType::String(s) => RcStr::from(s),
            }
        }
    }

    /// Blanket impl: uses synchronous `Display::to_string()` for owned values.
    #[cfg(not(feature = "sync"))]
    impl<T: Display + Send + Sync> ValueToStringify<1> for &ValueToStringifyWrap<&T> {
        #[inline(always)]
        fn to_stringify(&self) -> impl Future<Output = Result<StringifyType>> + Send {
            let s = (self.0).to_string();
            async move { Ok(StringifyType::String(s)) }
        }
    }

    /// Blanket impl: uses synchronous `Display::to_string()` for owned values.
    #[cfg(feature = "sync")]
    impl<T: Display + Send + Sync> ValueToStringify<1> for &ValueToStringifyWrap<&T> {
        #[inline(always)]
        fn to_stringify(&self) -> Result<StringifyType> {
            Ok(StringifyType::String((self.0).to_string()))
        }
    }

    #[cfg(not(feature = "sync"))]
    impl<T: Send> ValueToStringify<2> for &&ValueToStringifyWrap<&crate::Vc<T>>
    where
        T: ValueToString,
    {
        #[inline(always)]
        fn to_stringify(&self) -> impl Future<Output = Result<StringifyType>> + Send {
            let vc = self.0;
            async move {
                let s = vc.to_string().await?;
                Ok(StringifyType::RcStr((*s).clone()))
            }
        }
    }

    #[cfg(feature = "sync")]
    impl<T: Send> ValueToStringify<2> for &&ValueToStringifyWrap<&crate::Vc<T>>
    where
        T: ValueToString,
    {
        #[inline(always)]
        fn to_stringify(&self) -> Result<StringifyType> {
            let vc = self.0;
            let s = crate::read!(vc.to_string())?;
            Ok(StringifyType::RcStr((*s).clone()))
        }
    }

    #[cfg(not(feature = "sync"))]
    impl<T: Send> ValueToStringify<2> for &&ValueToStringifyWrap<&ResolvedVc<T>>
    where
        T: ValueToString,
    {
        #[inline(always)]
        fn to_stringify(&self) -> impl Future<Output = Result<StringifyType>> + Send {
            let vc = self.0;
            async move {
                let s = vc.to_string().await?;
                Ok(StringifyType::RcStr((*s).clone()))
            }
        }
    }

    #[cfg(feature = "sync")]
    impl<T: Send> ValueToStringify<2> for &&ValueToStringifyWrap<&ResolvedVc<T>>
    where
        T: ValueToString,
    {
        #[inline(always)]
        fn to_stringify(&self) -> Result<StringifyType> {
            let vc = self.0;
            let s = crate::read!(vc.to_string())?;
            Ok(StringifyType::RcStr((*s).clone()))
        }
    }

    #[cfg(not(feature = "sync"))]
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

    #[cfg(feature = "sync")]
    impl<T: Send> ValueToStringify<2> for &&&ValueToStringifyWrap<&T>
    where
        T: ValueToStringRef,
    {
        #[inline(always)]
        fn to_stringify(&self) -> Result<StringifyType> {
            Ok(StringifyType::RcStr(self.0.to_string_ref()?))
        }
    }
}
