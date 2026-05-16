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

/// Deref-following: `ReadRef<T>` delegates to the deref target's `ValueToStringRef`.
impl<T> ValueToStringRef for crate::ReadRef<T>
where
    T: crate::VcValueType,
    <T::Read as crate::VcRead<T>>::Target: ValueToStringRef,
{
    fn to_string_ref(&self) -> impl Future<Output = Result<RcStr>> + Send {
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
            (&&&tmp).to_stringify().await?
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

    pub trait ValueToStringify<const LEVEL: u8> {
        fn to_stringify(&self) -> impl Future<Output = Result<StringifyType>> + Send;
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
    impl<T: Display + Send + Sync> ValueToStringify<1> for &ValueToStringifyWrap<&T> {
        #[inline(always)]
        fn to_stringify(&self) -> impl Future<Output = Result<StringifyType>> + Send {
            let s = (self.0).to_string();
            async move { Ok(StringifyType::String(s)) }
        }
    }

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
}
