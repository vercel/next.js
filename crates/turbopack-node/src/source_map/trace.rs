use std::{borrow::Cow, fmt::Display};

use anyhow::Result;
use mime::APPLICATION_JSON;
use serde::{Deserialize, Serialize};
use serde_json::json;
use turbo_tasks::{RcStr, Vc};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::AssetContent,
    source_map::{SourceMap, Token},
};
use turbopack_ecmascript::magic_identifier::unmangle_identifiers;

/// An individual stack frame, as parsed by the stacktrace-parser npm module.
///
/// Line and column can be None if the frame is anonymous.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct StackFrame<'a> {
    pub file: Cow<'a, str>,
    #[serde(rename = "lineNumber")]
    pub line: Option<usize>,
    pub column: Option<usize>,
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

    pub fn get_pos(&self) -> Option<(usize, usize)> {
        self.line.zip(self.column)
    }
}

impl<'a> Display for StackFrame<'a> {
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
/// Source Map Trace is a convenient wrapper to perform and consume a source map
/// trace's token.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct SourceMapTrace {
    map: Vc<SourceMap>,
    line: usize,
    column: usize,
    name: Option<RcStr>,
}

/// The result of performing a source map trace.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub enum TraceResult {
    NotFound,
    Found(#[turbo_tasks(trace_ignore)] StackFrame<'static>),
}

#[turbo_tasks::value_impl]
impl SourceMapTrace {
    #[turbo_tasks::function]
    pub async fn new(
        map: Vc<SourceMap>,
        line: usize,
        column: usize,
        name: Option<RcStr>,
    ) -> Vc<Self> {
        SourceMapTrace {
            map,
            line,
            column,
            name,
        }
        .cell()
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
    #[turbo_tasks::function]
    pub async fn trace(self: Vc<Self>) -> Result<Vc<TraceResult>> {
        let this = self.await?;

        let token = this
            .map
            .lookup_token(this.line.saturating_sub(1), this.column.saturating_sub(1))
            .await?;
        let result = match &*token {
            Token::Original(t) => TraceResult::Found(StackFrame {
                file: t.original_file.clone().into(),
                line: Some(t.original_line.saturating_add(1)),
                column: Some(t.original_column.saturating_add(1)),
                name: t
                    .name
                    .clone()
                    .or_else(|| this.name.clone())
                    .map(|v| v.into_owned())
                    .map(Cow::Owned),
            }),
            _ => TraceResult::NotFound,
        };

        Ok(result.cell())
    }

    /// Takes the trace and generates a (possibly valid) JSON asset content.
    #[turbo_tasks::function]
    pub async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let trace = self.trace().await?;
        let result = match &*trace {
            // purposefully invalid JSON (it can't be empty), so that the catch handler will default
            // to the generated stack frame.
            TraceResult::NotFound => "".to_string(),
            TraceResult::Found(frame) => json!({
                "originalStackFrame": frame,
                // TODO
                "originalCodeFrame": null,
            })
            .to_string(),
        };
        let file = File::from(result).with_content_type(APPLICATION_JSON);
        Ok(AssetContent::file(file.into()))
    }
}
