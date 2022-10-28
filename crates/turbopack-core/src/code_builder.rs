use std::{
    fmt::{Result as FmtResult, Write},
    ops,
};

use anyhow::Result;
use sourcemap::SourceMapBuilder;
use turbo_tasks::primitives::StringVc;

use crate::{
    source_map::{GenerateSourceMap, GenerateSourceMapVc, SourceMapSection, SourceMapVc},
    source_pos::SourcePos,
};

/// Code stores combined output code and the source map of that output code.
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Default)]
pub struct Code {
    code: String,

    /// A mapping of byte-offset in the code string to an associated source map.
    mappings: Vec<(usize, Option<GenerateSourceMapVc>)>,
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
    fn push_map(&mut self, map: Option<GenerateSourceMapVc>) {
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
    pub fn push_source(&mut self, code: &str, map: Option<GenerateSourceMapVc>) {
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
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for Code {
    /// Generates the source map out of all the pushed Original code.
    /// The SourceMap v3 spec has a "sectioned" source map specifically designed
    /// for concatenation in post-processing steps. This format consists of
    /// a `sections` array, with section item containing a `offset` object
    /// and a `map` object. The section's map applies only after the
    /// starting offset, and until the start of the next section. This is by
    /// far the simplest way to concatenate the source maps of the multiple
    /// chunk items into a single map file.
    #[turbo_tasks::function]
    pub async fn generate_source_map(&self) -> Result<SourceMapVc> {
        let mut pos = SourcePos::new();
        let mut last_byte_pos = 0;

        let sections = self
            .mappings
            .iter()
            .map(|(byte_pos, map)| {
                pos.update(&self.code[last_byte_pos..*byte_pos]);
                last_byte_pos = *byte_pos;

                let encoded = match map {
                    None => empty_map(),
                    Some(map) => map.generate_source_map(),
                };

                SourceMapSection::new(pos, encoded)
            })
            .collect();

        Ok(SourceMapVc::new_sectioned(sections))
    }
}

/// A source map that contains no actual source location information (no
/// `sources`, no mappings that point into a source). This is used to tell
/// Chrome that the generated code starting at a particular offset is no longer
/// part of the previous section's mappings.
#[turbo_tasks::function]
fn empty_map() -> SourceMapVc {
    let mut builder = SourceMapBuilder::new(None);
    builder.add(0, 0, 0, 0, None, None);
    SourceMapVc::new_regular(builder.into_sourcemap())
}
