use std::fmt::{Display, Formatter, Write};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};

use crate::{rope::Rope, source_context::get_source_context};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub struct UnparsableJson {
    pub message: RcStr,
    pub path: Option<RcStr>,
    /// The start line and column of the error.
    /// Line and column is 0-based.
    pub start_location: Option<(u32, u32)>,
    /// The end line and column of the error.
    /// Line and column is 0-based.
    pub end_location: Option<(u32, u32)>,
}

/// Converts a byte position to a 0-based line and column.
fn byte_to_location(pos: usize, text: &str) -> (u32, u32) {
    let text = &text[..pos];
    let mut lines = text.lines().rev();
    let last = lines.next().unwrap_or("");
    let column = last.len();
    let line = lines.count();
    (line as u32, column as u32)
}

impl UnparsableJson {
    pub fn from_jsonc_error(e: jsonc_parser::errors::ParseError, text: &str) -> Self {
        Self {
            message: RcStr::from(e.kind().to_string()),
            path: None,
            start_location: Some(byte_to_location(e.range().start, text)),
            end_location: Some(byte_to_location(e.range().end, text)),
        }
    }

    pub fn from_serde_path_to_error(e: serde_path_to_error::Error<serde_json::Error>) -> Self {
        let inner = e.inner();
        Self {
            message: RcStr::from(inner.to_string()),
            path: Some(RcStr::from(e.path().to_string())),
            start_location: Some((
                inner.line().saturating_sub(1) as u32,
                inner.column().saturating_sub(1) as u32,
            )),
            end_location: None,
        }
    }

    pub fn write_with_content(&self, writer: &mut impl Write, text: &str) -> std::fmt::Result {
        writeln!(writer, "{}", self.message)?;
        if let Some(path) = &self.path {
            writeln!(writer, "  at {path}")?;
        }
        match (self.start_location, self.end_location) {
            (Some((line, column)), Some((end_line, end_column))) => {
                write!(
                    writer,
                    "{}",
                    get_source_context(text.lines(), line, column, end_line, end_column,)
                )?;
            }
            (Some((line, column)), None) | (None, Some((line, column))) => {
                write!(
                    writer,
                    "{}",
                    get_source_context(text.lines(), line, column, line, column)
                )?;
            }
            (None, None) => {
                write!(writer, "{}", get_source_context(text.lines(), 0, 0, 0, 0))?;
            }
        }
        Ok(())
    }

    pub fn to_string_with_content(&self, text: &str) -> String {
        let mut result = String::new();
        self.write_with_content(&mut result, text).unwrap();
        result
    }
}

impl Display for UnparsableJson {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)?;
        if let Some(path) = &self.path {
            write!(f, "  at {path}")?;
        }
        Ok(())
    }
}

pub fn parse_json_with_source_context<'de, T: Deserialize<'de>>(text: &'de str) -> Result<T> {
    let de = &mut serde_json::Deserializer::from_str(text);
    match serde_path_to_error::deserialize(de) {
        Ok(data) => Ok(data),
        Err(e) => Err(anyhow::Error::msg(
            UnparsableJson::from_serde_path_to_error(e).to_string_with_content(text),
        )),
    }
}

pub fn parse_json_rope_with_source_context<'de, T: Deserialize<'de>>(rope: &'de Rope) -> Result<T> {
    let de = &mut serde_json::Deserializer::from_reader(rope.read());
    match serde_path_to_error::deserialize(de) {
        Ok(data) => Ok(data),
        Err(e) => {
            let cow = rope.to_str()?;
            Err(anyhow::Error::msg(
                UnparsableJson::from_serde_path_to_error(e).to_string_with_content(&cow),
            ))
        }
    }
}
