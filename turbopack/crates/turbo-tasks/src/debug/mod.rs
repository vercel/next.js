use std::fmt::{Debug, Display};

use auto_hash_map::{AutoMap, AutoSet};
use smallvec::SmallVec;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, FxIndexSet, Vc};
pub use turbo_tasks_macros::ValueDebugFormat;

use crate::{self as turbo_tasks};

#[doc(hidden)]
pub mod internal;
mod vdbg;

use internal::PassthroughDebug;

/// The return type of [`ValueDebug::dbg`].
///
/// We don't use [`Vc<RcStr>`][turbo_rcstr::RcStr] or [`String`] directly because we
/// don't want the [`Debug`]/[`Display`] representations to be escaped.
#[turbo_tasks::value]
pub struct ValueDebugString(String);

impl Debug for ValueDebugString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl Display for ValueDebugString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl ValueDebugString {
    /// Returns the underlying string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl ValueDebugString {
    /// Create a new `ValueDebugString` from a string.
    pub fn new(s: String) -> Vc<Self> {
        ValueDebugString::cell(ValueDebugString(s))
    }
}

/// [`Debug`]-like trait for [`Vc`] types, automatically derived when using
/// [`macro@turbo_tasks::value`] and [`turbo_tasks::value_trait`].
///
/// # Usage
///
/// ```ignore
/// dbg!(any_vc.dbg().await?);
/// ```
#[turbo_tasks::value_trait(no_debug)]
pub trait ValueDebug {
    #[turbo_tasks::function]
    fn dbg(self: Vc<Self>) -> Vc<ValueDebugString>;

    /// Like `dbg`, but with a depth limit.
    #[turbo_tasks::function]
    fn dbg_depth(self: Vc<Self>, depth: usize) -> Vc<ValueDebugString>;
}

/// Use [autoref specialization] to implement [`ValueDebug`] for `T: Debug`.
///
/// [autoref specialization]: https://github.com/dtolnay/case-studies/blob/master/autoref-specialization/README.md
pub trait ValueDebugFormat {
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_>;
}

impl ValueDebugFormat for String {
    fn value_debug_format(&self, _depth: usize) -> ValueDebugFormatString<'_> {
        ValueDebugFormatString::Sync(format!("{self:#?}"))
    }
}

impl ValueDebugFormat for RcStr {
    fn value_debug_format(&self, _: usize) -> ValueDebugFormatString<'_> {
        ValueDebugFormatString::Sync(self.to_string())
    }
}

// Use autoref specialization [1] to implement `ValueDebugFormat` for `T:
// Debug` as a fallback if `T` does not implement it directly, hence the `for
// &T` clause.
//
// [1] https://github.com/dtolnay/case-studies/blob/master/autoref-specialization/README.md
impl<T> ValueDebugFormat for &T
where
    T: Debug,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        if depth == 0 {
            return ValueDebugFormatString::Sync(std::any::type_name::<Self>().to_string());
        }

        ValueDebugFormatString::Sync(format!("{self:#?}"))
    }
}

impl<T> ValueDebugFormat for Option<T>
where
    T: ValueDebugFormat,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        if depth == 0 {
            return ValueDebugFormatString::Sync(std::any::type_name::<Self>().to_string());
        }

        match self {
            None => ValueDebugFormatString::Sync(format!("{:#?}", Option::<()>::None)),
            Some(value) => match value.value_debug_format(depth.saturating_sub(1)) {
                ValueDebugFormatString::Sync(string) => ValueDebugFormatString::Sync(format!(
                    "{:#?}",
                    Some(PassthroughDebug::new_string(string))
                )),
                ValueDebugFormatString::Async(future) => {
                    ValueDebugFormatString::Async(Box::pin(async move {
                        let string = future.await?;
                        Ok(format!("{:#?}", Some(PassthroughDebug::new_string(string))))
                    }))
                }
            },
        }
    }
}

impl<T> ValueDebugFormat for Vec<T>
where
    T: ValueDebugFormat,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        if depth == 0 {
            return ValueDebugFormatString::Sync(std::any::type_name::<Self>().to_string());
        }

        let values = self
            .iter()
            .map(|value| value.value_debug_format(depth.saturating_sub(1)))
            .collect::<Vec<_>>();

        ValueDebugFormatString::Async(Box::pin(async move {
            let mut values_string = vec![];
            for value in values {
                match value {
                    ValueDebugFormatString::Sync(string) => {
                        values_string.push(PassthroughDebug::new_string(string));
                    }
                    ValueDebugFormatString::Async(future) => {
                        values_string.push(PassthroughDebug::new_string(future.await?));
                    }
                }
            }
            Ok(format!("{values_string:#?}"))
        }))
    }
}

impl<T, const N: usize> ValueDebugFormat for SmallVec<[T; N]>
where
    T: ValueDebugFormat,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        if depth == 0 {
            return ValueDebugFormatString::Sync(std::any::type_name::<Self>().to_string());
        }

        let values = self
            .iter()
            .map(|value| value.value_debug_format(depth.saturating_sub(1)))
            .collect::<Vec<_>>();

        ValueDebugFormatString::Async(Box::pin(async move {
            let mut values_string = vec![];
            for value in values {
                match value {
                    ValueDebugFormatString::Sync(string) => {
                        values_string.push(PassthroughDebug::new_string(string));
                    }
                    ValueDebugFormatString::Async(future) => {
                        values_string.push(PassthroughDebug::new_string(future.await?));
                    }
                }
            }
            Ok(format!("{values_string:#?}"))
        }))
    }
}

impl<K> ValueDebugFormat for AutoSet<K>
where
    K: ValueDebugFormat,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        if depth == 0 {
            return ValueDebugFormatString::Sync(std::any::type_name::<Self>().to_string());
        }

        let values = self
            .iter()
            .map(|item| item.value_debug_format(depth.saturating_sub(1)))
            .collect::<Vec<_>>();

        ValueDebugFormatString::Async(Box::pin(async move {
            let mut values_string = Vec::with_capacity(values.len());
            for item in values {
                match item {
                    ValueDebugFormatString::Sync(string) => {
                        values_string.push(PassthroughDebug::new_string(string));
                    }
                    ValueDebugFormatString::Async(future) => {
                        values_string.push(PassthroughDebug::new_string(future.await?));
                    }
                }
            }
            Ok(format!("{values_string:#?}"))
        }))
    }
}

impl<K, V, S> ValueDebugFormat for std::collections::HashMap<K, V, S>
where
    K: Debug,
    V: ValueDebugFormat,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        if depth == 0 {
            return ValueDebugFormatString::Sync(std::any::type_name::<Self>().to_string());
        }

        let values = self
            .iter()
            .map(|(key, value)| {
                (
                    format!("{key:#?}"),
                    value.value_debug_format(depth.saturating_sub(1)),
                )
            })
            .collect::<Vec<_>>();

        ValueDebugFormatString::Async(Box::pin(async move {
            let mut values_string = std::collections::HashMap::new();
            for (key, value) in values {
                match value {
                    ValueDebugFormatString::Sync(string) => {
                        values_string.insert(key, PassthroughDebug::new_string(string));
                    }
                    ValueDebugFormatString::Async(future) => {
                        values_string.insert(key, PassthroughDebug::new_string(future.await?));
                    }
                }
            }
            Ok(format!("{values_string:#?}"))
        }))
    }
}

impl<K, V> ValueDebugFormat for AutoMap<K, V>
where
    K: Debug,
    V: ValueDebugFormat,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        if depth == 0 {
            return ValueDebugFormatString::Sync(std::any::type_name::<Self>().to_string());
        }

        let values = self
            .iter()
            .map(|(key, value)| {
                (
                    format!("{key:#?}"),
                    value.value_debug_format(depth.saturating_sub(1)),
                )
            })
            .collect::<Vec<_>>();

        ValueDebugFormatString::Async(Box::pin(async move {
            let mut values_string = AutoMap::new();
            for (key, value) in values {
                match value {
                    ValueDebugFormatString::Sync(string) => {
                        values_string.insert(key, PassthroughDebug::new_string(string));
                    }
                    ValueDebugFormatString::Async(future) => {
                        values_string.insert(key, PassthroughDebug::new_string(future.await?));
                    }
                }
            }
            Ok(format!("{values_string:#?}"))
        }))
    }
}

impl<T> ValueDebugFormat for FxIndexSet<T>
where
    T: ValueDebugFormat,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        if depth == 0 {
            return ValueDebugFormatString::Sync(std::any::type_name::<Self>().to_string());
        }

        let values = self
            .iter()
            .map(|value| value.value_debug_format(depth.saturating_sub(1)))
            .collect::<Vec<_>>();

        ValueDebugFormatString::Async(Box::pin(async move {
            let mut values_string = FxIndexSet::default();
            for value in values {
                let value = match value {
                    ValueDebugFormatString::Sync(string) => string,
                    ValueDebugFormatString::Async(future) => future.await?,
                };
                values_string.insert(PassthroughDebug::new_string(value));
            }
            Ok(format!("{values_string:#?}"))
        }))
    }
}

impl<K, V> ValueDebugFormat for FxIndexMap<K, V>
where
    K: ValueDebugFormat,
    V: ValueDebugFormat,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        if depth == 0 {
            return ValueDebugFormatString::Sync(std::any::type_name::<Self>().to_string());
        }

        let values = self
            .iter()
            .map(|(key, value)| {
                (
                    key.value_debug_format(depth.saturating_sub(1)),
                    value.value_debug_format(depth.saturating_sub(1)),
                )
            })
            .collect::<Vec<_>>();

        ValueDebugFormatString::Async(Box::pin(async move {
            let mut values_string = FxIndexMap::default();
            for (key, value) in values {
                let key = match key {
                    ValueDebugFormatString::Sync(string) => string,
                    ValueDebugFormatString::Async(future) => future.await?,
                };
                let value = match value {
                    ValueDebugFormatString::Sync(string) => string,
                    ValueDebugFormatString::Async(future) => future.await?,
                };
                values_string.insert(
                    PassthroughDebug::new_string(key),
                    PassthroughDebug::new_string(value),
                );
            }
            Ok(format!("{values_string:#?}"))
        }))
    }
}

macro_rules! tuple_impls {
    ( $( $name:ident )+ ) => {
        impl<$($name: ValueDebugFormat),+> ValueDebugFormat for ($($name,)+)
        {
            #[allow(non_snake_case)]
            fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
                if depth == 0 {
                    return ValueDebugFormatString::Sync(std::any::type_name::<Self>().to_string());
                }

                let ($($name,)+) = self;
                let ($($name,)+) = ($($name.value_debug_format(depth.saturating_sub(1)),)+);

                ValueDebugFormatString::Async(Box::pin(async move {
                    let values = ($(PassthroughDebug::new_string($name.try_to_string().await?),)+);
                    Ok(format!("{:#?}", values))
                }))
            }
        }
    };
}

tuple_impls! { A }
tuple_impls! { A B }
tuple_impls! { A B C }
tuple_impls! { A B C D }
tuple_impls! { A B C D E }
tuple_impls! { A B C D E F }
tuple_impls! { A B C D E F G }
tuple_impls! { A B C D E F G H }
tuple_impls! { A B C D E F G H I }
tuple_impls! { A B C D E F G H I J }
tuple_impls! { A B C D E F G H I J K }
tuple_impls! { A B C D E F G H I J K L }

/// Output of `ValueDebugFormat::value_debug_format`.
pub enum ValueDebugFormatString<'a> {
    /// For the `T: Debug` fallback implementation, we can output a string
    /// directly as the result of `format!("{:?}", t)`.
    Sync(String),
    /// For the `Vc` types and `Vc`-containing types implementations, we need to
    /// resolve types asynchronously before we can format them, hence the need
    /// for a future.
    Async(
        core::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<String>> + Send + 'a>>,
    ),
}

impl ValueDebugFormatString<'_> {
    /// Convert the `ValueDebugFormatString` into a `String`.
    ///
    /// This can fail when resolving `Vc` types.
    pub async fn try_to_string(self) -> anyhow::Result<String> {
        Ok(match self {
            ValueDebugFormatString::Sync(value) => value,
            ValueDebugFormatString::Async(future) => future.await?,
        })
    }

    /// Convert the `ValueDebugFormatString` into a `Vc<ValueDebugString>`.
    ///
    /// This can fail when resolving `Vc` types.
    pub async fn try_to_value_debug_string(self) -> anyhow::Result<Vc<ValueDebugString>> {
        Ok(ValueDebugString::new(self.try_to_string().await?))
    }
}
