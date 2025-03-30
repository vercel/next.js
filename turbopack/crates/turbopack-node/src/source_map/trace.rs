use std::{borrow::Cow, fmt::Display};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbopack_core::source_map::{SourceMap, Token};
use turbopack_ecmascript::magic_identifier::unmangle_identifiers;

/// An individual stack frame, as parsed by the stacktrace-parser npm module.
///
/// Line and column can be None if the frame is anonymous.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct StackFrame<'a> {
    pub file: Cow<'a, str>,
    #[serde(rename = "lineNumber")]
    pub line: Option<u32>,
    pub column: Option<u32>,
    #[serde(rename = "methodName")]
    pub name: Option<Cow<'a, str>>,
}

impl<'a> StackFrame<'a> {
    pub fn unmangle_identifiers<T: Display>(&self, magic: impl Fn(String) -> T) -> StackFrame<'_> {
        StackFrame {
            file: Cow::Borrowed(self.file.as_ref()),
            line: self.line,
            column: self.column,
            name: self
                .name
                .as_ref()
                .map(|n| unmangle_identifiers(n.as_ref(), magic)),
        }
    }

    pub fn with_path<'b>(&'a self, path: &'b str) -> StackFrame<'b>
    where
        'a: 'b,
    {
        StackFrame {
            file: Cow::Borrowed(path),
            line: self.line,
            column: self.column,
            name: self.name.as_ref().map(|n| Cow::Borrowed(n.as_ref())),
        }
    }

    pub fn with_name<'b>(&'a self, name: Option<&'b str>) -> StackFrame<'b>
    where
        'a: 'b,
    {
        StackFrame {
            file: Cow::Borrowed(self.file.as_ref()),
            line: self.line,
            column: self.column,
            name: name.map(Cow::Borrowed),
        }
    }

    pub fn get_pos(&self) -> Option<(u32, u32)> {
        self.line.zip(self.column)
    }
}

impl Display for StackFrame<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.get_pos() {
            Some((l, c)) => match &self.name.as_deref() {
                None | Some("<unknown>") | Some("(anonymous)") => {
                    write!(f, "{}:{}:{}", self.file, l, c)
                }
                Some(n) => write!(f, "{} ({}:{}:{})", n, self.file, l, c),
            },
            None => write!(f, "{}", self.file),
        }
    }
}

/// The result of performing a source map trace.
#[derive(Debug)]
pub enum TraceResult {
    NotFound,
    Found(StackFrame<'static>),
}

/// Traces the line/column through the source map into its original
/// position.
///
/// This method is god-awful slow. We're getting the content
/// of a .map file, which means we're serializing all of the individual
/// sections into a string and concatenating, taking that and
/// deserializing into a DecodedMap, and then querying it. Besides being a
/// memory hog, it'd be so much faster if we could just directly access
/// the individual sections of the JS file's map without the
/// serialization.
pub async fn trace_source_map(
    map: &SourceMap,
    line: u32,
    column: u32,
    name: Option<&str>,
) -> Result<TraceResult> {
    let token = map
        .lookup_token(line.saturating_sub(1), column.saturating_sub(1))
        .await?;
    let result = match token {
        Token::Original(t) => TraceResult::Found(StackFrame {
            file: t.original_file.clone().into(),
            line: Some(t.original_line.saturating_add(1)),
            column: Some(t.original_column.saturating_add(1)),
            name: t
                .name
                .clone()
                .map(|v| v.into_owned())
                .or_else(|| name.map(ToString::to_string))
                .map(Cow::Owned),
        }),
        _ => TraceResult::NotFound,
    };

    Ok(result)
}
