use std::{
    fmt::{Result as FmtResult, Write},
    ops,
};

use anyhow::Result;
use turbo_tasks::primitives::StringVc;

use crate::source_pos::SourcePos;

#[turbo_tasks::value_trait]
pub trait EncodedSourceMap {
    /// Generates JSON of a source map, similar to `JSON.stringify({...})`.
    fn encoded_map(&self) -> StringVc;
}

/// A source map that contains no actual source location information (no
/// `sources`, no mappings that point into a source). This is used to tell
/// Chrome that the generated code starting at a particular offset is no longer
/// part of the previous section's mappings.
const EMPTY_MAP: &str = r#"{"version": 3, "names": [], "sources": [], "mappings": "A"}"#;

/// Code stores combined output code and the source map of that output code.
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Default)]
pub struct Code {
    code: String,

    /// A mapping of byte-offset in the code string to an associated source map.
    mappings: Vec<(usize, Option<EncodedSourceMapVc>)>,
}

impl Code {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn source_code(&self) -> &str {
        &self.code
    }

    /// Setting breakpoints on synthetic code can cause weird behaviors
    /// because Chrome will treat the location as belonging to the previous
    /// original code section. By inserting an empty source map when reaching a
    /// synthetic section directly after an original section, we tell Chrome
    /// that the previous map ended at this point.
    fn push_map(&mut self, map: Option<EncodedSourceMapVc>) {
        if map.is_none() && matches!(self.mappings.last(), None | Some((_, None))) {
            // No reason to push an empty map directly after an empty map
            return;
        }

        debug_assert!(
            map.is_some() || !self.mappings.is_empty(),
            "the first mapping is never a None"
        );
        self.mappings.push((self.code.len(), map));
    }

    /// Pushes synthetic runtime code without an associated source map. This is
    /// the default concatenation operation, but it's designed to be used
    /// with the `+=` operator.
    fn push_str(&mut self, code: &str) {
        self.push_source(code, None);
    }

    /// Pushes original user code with an optional source map if one is
    /// available. If it's not, this is no different than pushing Synthetic
    /// code.
    pub fn push_source(&mut self, code: &str, map: Option<EncodedSourceMapVc>) {
        self.push_map(map);
        self.code += code;
    }

    /// Copies the Synthetic/Original code of an already constructed CodeBuilder
    /// into this instance.
    pub fn push_code(&mut self, prebuilt: &Code) {
        if let Some((index, _)) = prebuilt.mappings.first() {
            if *index > 0 {
                // If the index is positive, then the code starts with a synthetic section. We
                // may need to push an empty map in order to end the current
                // section's mappings.
                self.push_map(None);
            }

            let len = self.code.len();
            self.mappings.extend(
                prebuilt
                    .mappings
                    .iter()
                    .map(|(index, map)| (index + len, *map)),
            );
        } else {
            self.push_map(None);
        }

        self.code += &prebuilt.code;
    }

    /// Tests if any code in this CodeBuilder contains an associated source map.
    pub fn has_source_map(&self) -> bool {
        !self.mappings.is_empty()
    }
}

impl ops::AddAssign<&str> for Code {
    fn add_assign(&mut self, rhs: &str) {
        self.push_str(rhs);
    }
}

impl Write for Code {
    fn write_str(&mut self, s: &str) -> FmtResult {
        self.push_str(s);
        Ok(())
    }
}

#[turbo_tasks::value_impl]
impl CodeVc {
    #[turbo_tasks::function]
    pub async fn source_code(self) -> Result<StringVc> {
        Ok(StringVc::cell(self.await?.source_code().to_string()))
    }

    /// Generates the source map out of all the pushed Original code.
    /// The SourceMap v3 spec has a "sectioned" source map specifically designed
    /// for concatenation in post-processing steps. This format consists of
    /// a `sections` array, with section item containing a `offset` object
    /// and a `map` object. The section's map applies only after the
    /// starting offset, and until the start of the next section. This is by
    /// far the simplest way to concatenate the source maps of the multiple
    /// chunk items into a single map file.
    #[turbo_tasks::function]
    pub async fn source_map(self) -> Result<StringVc> {
        let this = self.await?;
        let mut pos = SourcePos::new();
        let mut last_index = 0;

        // Boy, the sourcemap crate only allows writing the source map directly
        // into a string output. The map needs to be an object, and we can't inject
        // the map string as an object because JsonValue doesn't provide a "raw"
        // type (see https://github.com/tc39/proposal-json-parse-with-source).
        //
        // So, we need to manually construct the JSON. :sigh:
        let mut source_map = r#"{
  "version": 3,
  "sections": ["#
            .to_string();

        let mut first_section = true;
        for (index, map) in &this.mappings {
            pos.update(&this.code[last_index..*index]);
            last_index = *index;

            let encoded = match map {
                None => None,
                Some(map) => Some(map.encoded_map().await?),
            };
            let encoded = if let Some(ref e) = encoded {
                e
            } else {
                EMPTY_MAP
            };

            if !first_section {
                source_map += ",";
            }
            first_section = false;

            write!(
                &mut source_map,
                r#"
    {{"offset": {{"line": {}, "column": {}}}, "map": {}}}"#,
                pos.line, pos.column, encoded,
            )?;
        }

        source_map += r#"]
}"#;

        Ok(StringVc::cell(source_map))
    }
}
