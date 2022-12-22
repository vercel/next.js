use std::fmt::Display;

use anyhow::Result;
use mime::APPLICATION_JSON;
use serde_json::json;
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::AssetContentVc,
    source_map::{SourceMapVc, Token},
};

/// An individual stack frame, as parsed by the stacktrace-parser npm module.
///
/// Line and column can be None if the frame is anonymous.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct StackFrame {
    pub file: String,
    #[serde(rename = "lineNumber")]
    pub line: Option<usize>,
    pub column: Option<usize>,
    #[serde(rename = "methodName")]
    pub name: Option<String>,
}

impl Display for StackFrame {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.with_path(&self.file).fmt(f)
    }
}

impl StackFrame {
    pub fn with_path<'a>(&'a self, path: &'a str) -> StackFrameWithPath<'a> {
        StackFrameWithPath { frame: self, path }
    }

    pub fn get_pos(&self) -> Option<(usize, usize)> {
        self.line.zip(self.column)
    }
}

pub struct StackFrameWithPath<'a> {
    pub frame: &'a StackFrame,
    pub path: &'a str,
}

impl<'a> Display for StackFrameWithPath<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.frame.get_pos() {
            Some((l, c)) => match &self.frame.name {
                Some(n) => write!(f, "{} ({}:{}:{})", n, self.path, l, c),
                None => write!(f, "{}:{}:{}", self.path, l, c),
            },
            None => write!(f, "{}", self.path),
        }
    }
}
/// Source Map Trace is a convenient wrapper to perform and consume a source map
/// trace's token.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct SourceMapTrace {
    map: SourceMapVc,
    line: usize,
    column: usize,
    name: Option<String>,
}

/// The result of performing a source map trace.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub enum TraceResult {
    NotFound,
    Found(StackFrame),
}

#[turbo_tasks::value_impl]
impl SourceMapTraceVc {
    #[turbo_tasks::function]
    pub async fn new(map: SourceMapVc, line: usize, column: usize, name: Option<String>) -> Self {
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
    pub async fn trace(self) -> Result<TraceResultVc> {
        let this = self.await?;

        let token = this
            .map
            .lookup_token(this.line.saturating_sub(1), this.column.saturating_sub(1))
            .await?;
        let result = match &*token {
            Some(Token::Original(t)) => TraceResult::Found(StackFrame {
                file: t.original_file.clone(),
                line: Some(t.original_line.saturating_add(1)),
                column: Some(t.original_column.saturating_add(1)),
                name: t.name.clone().or_else(|| this.name.clone()),
            }),
            _ => TraceResult::NotFound,
        };

        Ok(result.cell())
    }

    /// Takes the trace and generates a (possibly valid) JSON asset content.
    #[turbo_tasks::function]
    pub async fn content(self) -> Result<AssetContentVc> {
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
        Ok(file.into())
    }
}
