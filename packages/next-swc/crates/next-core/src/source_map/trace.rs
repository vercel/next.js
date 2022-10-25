use std::{
    ops::Deref,
    sync::{Arc, Mutex},
};

use anyhow::{bail, Result};
use serde_json::json;
use sourcemap::{decode as decode_source_map, DecodedMap, Token};
use turbo_tasks_fs::{File, FileContent, FileContentVc};
use turbopack_core::asset::{AssetContent, AssetContentVc};

/// An individual stack frame, as parsed by the stacktrace-parser npm module.
///
/// Line and column can be None if the frame is anonymous.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct StackFrame {
    pub file: String,
    #[serde(rename = "lineNumber")]
    pub line: Option<u32>,
    pub column: Option<u32>,
    #[serde(rename = "methodName")]
    pub name: Option<String>,
}

impl StackFrame {
    pub fn get_pos(&self) -> Option<(u32, u32)> {
        match (self.line, self.column) {
            (Some(l), Some(c)) => Some((l, c)),
            _ => None,
        }
    }
}

/// Source Map Trace implmements the actual source map tracing logic, by parsing
/// the source map and calling the appropriate methods.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct SourceMapTrace {
    file: AssetContentVc,
    line: u32,
    column: u32,
    name: Option<String>,
}

/// The result of performing a source map trace.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub enum TraceResult {
    NotFound,
    Found(StackFrame),
}

/// Wraps DecodedMap so that it can be cached in a Vc.
///
/// DecodedMap contains a raw pointer, which isn't Send, which is required to
/// cache in a Vc. So, we have wrap it in 4 layers of cruft to do it. We don't
/// actually use the pointer, because we don't perform sources content lookup,
/// so it's fine.
struct DecodedMapWrapper(DecodedMap);
unsafe impl Send for DecodedMapWrapper {}
impl Deref for DecodedMapWrapper {
    type Target = DecodedMap;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// DecodedSourceMap wraps sourcemap::DecodedMap in a Vc for caching.
#[turbo_tasks::value(serialization = "none", eq = "manual")]
struct DecodedSourceMap(#[turbo_tasks(debug_ignore, trace_ignore)] Arc<Mutex<DecodedMapWrapper>>);
impl Deref for DecodedSourceMap {
    type Target = Arc<Mutex<DecodedMapWrapper>>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[turbo_tasks::value_impl]
impl DecodedSourceMapVc {
    #[turbo_tasks::function]
    async fn from(file: FileContentVc) -> Result<Self> {
        let file_content = file.await?;
        let content = match &*file_content {
            FileContent::Content(c) => c,
            _ => bail!("could not read file content"),
        };

        let sm = match decode_source_map(content.as_ref()) {
            Ok(sm) => sm,
            _ => bail!("could not decode source map"),
        };

        Ok(DecodedSourceMap(Arc::new(Mutex::new(DecodedMapWrapper(sm)))).cell())
    }
}

impl PartialEq for DecodedSourceMap {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

// sourcemap crate didn't implement sectioned sourcemap lookups correctly.
// :face-palm:
fn sectioned_lookup(map: &DecodedMap, line: u32, column: u32) -> Option<Token> {
    if let DecodedMap::Index(idx) = map {
        let len = idx.get_section_count();
        let mut low = 0;
        let mut high = len;

        // A "greatest lower bound" binary search. We're looking for the closest section
        // line/col <= to our line/col.
        while low < high {
            let mid = (low + high) / 2;
            let section = idx.get_section(mid).unwrap();
            if (line, column) < section.get_offset() {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        if low > 0 && low <= len {
            let section = idx.get_section(low - 1).unwrap();
            if let Some(map) = section.get_sourcemap() {
                let (off_line, off_col) = section.get_offset();
                // We're looking for the position `l` lines into region spanned by this
                // sourcemap s section.
                let l = line - off_line;
                // The source map starts if offset by the column only on its first line. On the
                // 2nd+ line, the sourcemap spans starting at column 0.
                let c = if line == off_line {
                    column - off_col
                } else {
                    column
                };
                return sectioned_lookup(map, l, c);
            }
        }
        None
    } else if let DecodedMap::Regular(sm) = map {
        sm.lookup_token(line, column)
    } else {
        unimplemented!("we should only be using the standard source map types");
    }
}

#[turbo_tasks::value_impl]
impl SourceMapTraceVc {
    #[turbo_tasks::function]
    pub async fn new(file: AssetContentVc, line: u32, column: u32, name: Option<String>) -> Self {
        SourceMapTrace {
            file,
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
        let file = this.file.await?;
        let content = match &*file {
            AssetContent::File(c) => c,
            _ => return Ok(TraceResult::NotFound.cell()),
        };
        let decoded_map = DecodedSourceMapVc::from(*content).await?;

        let sm = decoded_map.lock().unwrap();
        let trace = match sectioned_lookup(&sm, this.line.saturating_sub(1), this.column) {
            Some(t) if t.has_source() => t,
            _ => return Ok(TraceResult::NotFound.cell()),
        };

        Ok(TraceResult::Found(StackFrame {
            file: trace
                .get_source()
                .expect("trace was unwraped already")
                .to_string(),
            line: Some(trace.get_src_line().saturating_add(1)),
            column: Some(trace.get_src_col()),
            name: trace
                .get_name()
                .map(|s| s.to_string())
                .or_else(|| this.name.clone()),
        })
        .cell())
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
        Ok(File::from(result).into())
    }
}
