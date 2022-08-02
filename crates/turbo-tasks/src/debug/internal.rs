use std::borrow::Cow;

pub use turbo_tasks_macros::ValueDebug;

use super::ValueDebugStringVc;

/// Representation of a named field of a structure for formatting purposes of
/// `ValueDebug` implementations.
#[derive(Debug)]
pub struct FormattingField<'a> {
    name: &'a str,
    contents: String,
}

impl<'a> FormattingField<'a> {
    pub fn new(name: &'a str, contents: String) -> Self {
        Self { name, contents }
    }
}

/// Representation of a structure for formatting purposes of `ValueDebug`
/// implementations.
pub enum FormattingStruct<'a> {
    /// Structure with named fields (e.g. `struct Foo { bar: u32 }`).
    Named {
        name: &'a str,
        fields: Vec<FormattingField<'a>>,
    },
    /// Structure with unnamed fields (e.g. `struct Foo(u32)`, `Foo::Bar(u32)`).
    Unnamed { name: &'a str, fields: Vec<String> },
}

impl<'a> FormattingStruct<'a> {
    pub fn new_named(name: &'a str, fields: Vec<FormattingField<'a>>) -> Self {
        Self::Named { name, fields }
    }

    pub fn new_unnamed(name: &'a str, fields: Vec<String>) -> Self {
        Self::Unnamed { name, fields }
    }
}

impl<'a> std::fmt::Debug for FormattingStruct<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FormattingStruct::Named { name, fields } => {
                let mut debug_struct = f.debug_struct(name);
                for field in fields {
                    debug_struct.field(field.name, &PassthroughDebug::new_str(&field.contents));
                }
                debug_struct.finish()
            }
            FormattingStruct::Unnamed { name, fields } => {
                let mut debug_tuple = f.debug_tuple(name);
                for field in fields {
                    debug_tuple.field(&PassthroughDebug::new_str(field));
                }
                debug_tuple.finish()
            }
        }
    }
}

/// Debug implementation that prints an unquoted, unescaped string.
struct PassthroughDebug<'a>(Cow<'a, str>);

impl<'a> PassthroughDebug<'a> {
    fn new_str(s: &'a str) -> Self {
        Self(Cow::Borrowed(s))
    }

    fn new_string(s: String) -> Self {
        Self(Cow::Owned(s))
    }
}

impl<'a> std::fmt::Debug for PassthroughDebug<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0.as_ref())
    }
}

/// Use [autoref specialization] to implement `ValueDebug` for `T: Debug`.
///
/// [autoref specialization] https://github.com/dtolnay/case-studies/blob/master/autoref-specialization/README.md
pub trait ValueDebugFormat {
    fn value_debug_format(&self) -> ValueDebugFormatString;
}

// Use autoref specializatiion [1] to implement `ValueDebugFormat` for `T:
// Debug` as a fallback if `T` does not implement it directly, hence the `for
// &T` clause.
//
// [1] https://github.com/dtolnay/case-studies/blob/master/autoref-specialization/README.md
impl<T> ValueDebugFormat for &T
where
    T: std::fmt::Debug,
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
    pub async fn try_to_value_debug_string(self) -> anyhow::Result<ValueDebugStringVc> {
        Ok(ValueDebugStringVc::new(match self {
            ValueDebugFormatString::Sync(value) => value,
            ValueDebugFormatString::Async(future) => future.await?,
        }))
    }
}
