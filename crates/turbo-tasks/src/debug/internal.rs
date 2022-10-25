use std::borrow::Cow;

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
pub(super) struct PassthroughDebug<'a>(Cow<'a, str>);

impl<'a> PassthroughDebug<'a> {
    pub fn new_str(s: &'a str) -> Self {
        Self(Cow::Borrowed(s))
    }

    pub fn new_string(s: String) -> Self {
        Self(Cow::Owned(s))
    }
}

impl<'a> std::fmt::Debug for PassthroughDebug<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0.as_ref())
    }
}
