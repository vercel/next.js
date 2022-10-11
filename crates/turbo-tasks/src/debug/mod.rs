use std::fmt::{Debug, Display};

pub use turbo_tasks_macros::ValueDebugFormat;

use crate::{self as turbo_tasks};

#[doc(hidden)]
pub mod internal;

use internal::PassthroughDebug;

/// The return type of `ValueDebug::dbg`.
///
/// We don't use `StringVc` directly because we don't want the `Debug`/`Display`
/// representations to be escaped.
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

impl ValueDebugStringVc {
    /// Create a new `ValueDebugStringVc` from a string.
    pub fn new(s: String) -> Self {
        ValueDebugStringVc::cell(ValueDebugString(s))
    }
}

/// `Debug`-like trait for `Vc` types, automatically derived when using
/// `turbo_tasks::value` and `turbo_tasks::value_trait`.
///
/// # Usage
///
/// ```ignore
/// dbg!(any_vc.dbg().await?);
/// ```
#[turbo_tasks::value_trait(no_debug)]
pub trait ValueDebug {
    fn dbg(&self) -> ValueDebugStringVc;
}

/// Use [autoref specialization] to implement `ValueDebug` for `T: Debug`.
///
/// [autoref specialization] https://github.com/dtolnay/case-studies/blob/master/autoref-specialization/README.md
pub trait ValueDebugFormat {
    fn value_debug_format(&self) -> ValueDebugFormatString;
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
    fn value_debug_format(&self) -> ValueDebugFormatString {
        ValueDebugFormatString::Sync(format!("{:#?}", self))
    }
}

impl<T> ValueDebugFormat for Option<T>
where
    T: ValueDebugFormat,
{
    fn value_debug_format(&self) -> ValueDebugFormatString {
        match self {
            None => ValueDebugFormatString::Sync(format!("{:#?}", Option::<()>::None)),
            Some(value) => match value.value_debug_format() {
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
    fn value_debug_format(&self) -> ValueDebugFormatString {
        let values = self
            .iter()
            .map(|value| value.value_debug_format())
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
            Ok(format!("{:#?}", values_string))
        }))
    }
}

impl<K, V> ValueDebugFormat for std::collections::HashMap<K, V>
where
    K: Debug,
    V: ValueDebugFormat,
{
    fn value_debug_format(&self) -> ValueDebugFormatString {
        let values = self
            .iter()
            .map(|(key, value)| (format!("{:#?}", key), value.value_debug_format()))
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
            Ok(format!("{:#?}", values_string))
        }))
    }
}

macro_rules! tuple_impls {
    ( $( $name:ident )+ ) => {
        impl<$($name: ValueDebugFormat),+> ValueDebugFormat for ($($name,)+)
        {
            #[allow(non_snake_case)]
            fn value_debug_format(&self) -> ValueDebugFormatString {
                let ($($name,)+) = self;
                let ($($name,)+) = ($($name.value_debug_format(),)+);

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

impl<'a> ValueDebugFormatString<'a> {
    /// Convert the `ValueDebugFormatString` into a `String`.
    ///
    /// This can fail when resolving `Vc` types.
    pub async fn try_to_string(self) -> anyhow::Result<String> {
        Ok(match self {
            ValueDebugFormatString::Sync(value) => value,
            ValueDebugFormatString::Async(future) => future.await?,
        })
    }

    /// Convert the `ValueDebugFormatString` into a `ValueDebugStringVc`.
    ///
    /// This can fail when resolving `Vc` types.
    pub async fn try_to_value_debug_string(self) -> anyhow::Result<ValueDebugStringVc> {
        Ok(ValueDebugStringVc::new(self.try_to_string().await?))
    }
}
