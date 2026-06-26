use std::{borrow::Cow, future::Future};

use futures::future::join_all;
pub use turbo_tasks_macros::ValueDebug;

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

/// Representation of a named field of a structure for formatting purposes of
/// `ValueDebug` implementations.
#[derive(Debug)]
pub struct AsyncFormattingField<'a, Fut>
where
    Fut: Future<Output = String>,
{
    name: &'a str,
    contents: Fut,
}

impl<'a, Fut: Future<Output = String>> AsyncFormattingField<'a, Fut>
where
    Fut: Future<Output = String>,
{
    pub fn new(name: &'a str, contents: Fut) -> Self {
        Self { name, contents }
    }

    pub async fn resolve(self) -> FormattingField<'a> {
        let Self { name, contents } = self;
        FormattingField {
            name,
            contents: contents.await,
        }
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

    pub async fn new_named_async(
        name: &'a str,
        fields: Vec<AsyncFormattingField<'a, impl Future<Output = String>>>,
    ) -> Self {
        Self::Named {
            name,
            fields: join_all(fields.into_iter().map(AsyncFormattingField::resolve)).await,
        }
    }

    pub async fn new_unnamed_async(
        name: &'a str,
        fields: Vec<impl Future<Output = String>>,
    ) -> Self {
        Self::Unnamed {
            name,
            fields: join_all(fields).await,
        }
    }
}

impl std::fmt::Debug for FormattingStruct<'_> {
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
#[derive(PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PassthroughDebug<'a>(Cow<'a, str>);

impl<'a> PassthroughDebug<'a> {
    pub fn new_str(s: &'a str) -> Self {
        Self(Cow::Borrowed(s))
    }

    pub fn new_string(s: String) -> Self {
        Self(Cow::Owned(s))
    }
}

impl std::fmt::Debug for PassthroughDebug<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0.as_ref())
    }
}
