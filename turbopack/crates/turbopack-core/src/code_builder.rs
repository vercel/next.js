use std::{
    cmp::min,
    io::{BufRead, Result as IoResult, Write},
    ops,
};

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::rope::{Rope, RopeBuilder};
use turbo_tasks_hash::hash_xxh3_hash64;

use crate::{
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap, SourceMap},
    source_pos::SourcePos,
};

/// A mapping of byte-offset in the code string to an associated source map.
pub type Mapping = (usize, Option<Rope>);

/// Code stores combined output code and the source map of that output code.
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub struct Code {
    code: Rope,
    mappings: Vec<Mapping>,
}

impl Code {
    pub fn source_code(&self) -> &Rope {
        &self.code
    }

    /// Tests if any code in this Code contains an associated source map.
    pub fn has_source_map(&self) -> bool {
        !self.mappings.is_empty()
    }

    /// Take the source code out of the Code.
    pub fn into_source_code(self) -> Rope {
        self.code
    }
}

/// CodeBuilder provides a mutable container to append source code.
pub struct CodeBuilder {
    code: RopeBuilder,
    mappings: Option<Vec<Mapping>>,
}

impl Default for CodeBuilder {
    fn default() -> Self {
        Self {
            code: RopeBuilder::default(),
            mappings: Some(Vec::new()),
        }
    }
}

impl CodeBuilder {
    pub fn new(collect_mappings: bool) -> Self {
        Self {
            code: RopeBuilder::default(),
            mappings: collect_mappings.then(Vec::new),
        }
    }

    /// Pushes synthetic runtime code without an associated source map. This is
    /// the default concatenation operation, but it's designed to be used
    /// with the `+=` operator.
    fn push_static_bytes(&mut self, code: &'static [u8]) {
        self.push_map(None);
        self.code.push_static_bytes(code);
    }

    /// Pushes original user code with an optional source map if one is
    /// available. If it's not, this is no different than pushing Synthetic
    /// code.
    pub fn push_source(&mut self, code: &Rope, map: Option<Rope>) {
        self.push_map(map);
        self.code += code;
    }

    /// Copies the Synthetic/Original code of an already constructed Code into
    /// this instance.
    pub fn push_code(&mut self, prebuilt: &Code) {
        if let Some((index, _)) = prebuilt.mappings.first() {
            if *index > 0 {
                // If the index is positive, then the code starts with a synthetic section. We
                // may need to push an empty map in order to end the current
                // section's mappings.
                self.push_map(None);
            }

            let len = self.code.len();
            if let Some(mappings) = self.mappings.as_mut() {
                mappings.extend(
                    prebuilt
                        .mappings
                        .iter()
                        .map(|(index, map)| (index + len, map.clone())),
                );
            }
        } else {
            self.push_map(None);
        }

        self.code += &prebuilt.code;
    }

    /// Setting breakpoints on synthetic code can cause weird behaviors
    /// because Chrome will treat the location as belonging to the previous
    /// original code section. By inserting an empty source map when reaching a
    /// synthetic section directly after an original section, we tell Chrome
    /// that the previous map ended at this point.
    fn push_map(&mut self, map: Option<Rope>) {
        let Some(mappings) = self.mappings.as_mut() else {
            return;
        };
        if map.is_none() && matches!(mappings.last(), None | Some((_, None))) {
            // No reason to push an empty map directly after an empty map
            return;
        }

        debug_assert!(
            map.is_some() || !mappings.is_empty(),
            "the first mapping is never a None"
        );
        mappings.push((self.code.len(), map));
    }

    /// Tests if any code in this CodeBuilder contains an associated source map.
    pub fn has_source_map(&self) -> bool {
        self.mappings
            .as_ref()
            .is_some_and(|mappings| !mappings.is_empty())
    }

    pub fn build(self) -> Code {
        Code {
            code: self.code.build(),
            mappings: self.mappings.unwrap_or_default(),
        }
    }
}

impl ops::AddAssign<&'static str> for CodeBuilder {
    fn add_assign(&mut self, rhs: &'static str) {
        self.push_static_bytes(rhs.as_bytes());
    }
}

impl ops::AddAssign<&'static str> for &mut CodeBuilder {
    fn add_assign(&mut self, rhs: &'static str) {
        self.push_static_bytes(rhs.as_bytes());
    }
}

impl Write for CodeBuilder {
    fn write(&mut self, bytes: &[u8]) -> IoResult<usize> {
        self.push_map(None);
        self.code.write(bytes)
    }

    fn flush(&mut self) -> IoResult<()> {
        self.code.flush()
    }
}

impl From<Code> for CodeBuilder {
    fn from(code: Code) -> Self {
        let mut builder = CodeBuilder::default();
        builder.push_code(&code);
        builder
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
    pub async fn generate_source_map(&self) -> Result<Vc<OptionStringifiedSourceMap>> {
        Ok(Vc::cell(Some(self.generate_source_map_ref()?)))
    }
}

#[turbo_tasks::value_impl]
impl Code {
    /// Returns the hash of the source code of this Code.
    #[turbo_tasks::function]
    pub fn source_code_hash(&self) -> Vc<u64> {
        let code = self;
        let hash = hash_xxh3_hash64(code.source_code());
        Vc::cell(hash)
    }
}

impl Code {
    pub fn generate_source_map_ref(&self) -> Result<Rope> {
        let mut pos = SourcePos::new();
        let mut last_byte_pos = 0;

        let mut sections = Vec::with_capacity(self.mappings.len());
        let mut read = self.code.read();
        for (byte_pos, map) in &self.mappings {
            let mut want = byte_pos - last_byte_pos;
            while want > 0 {
                let buf = read.fill_buf()?;
                debug_assert!(!buf.is_empty());

                let end = min(want, buf.len());
                pos.update(&buf[0..end]);

                read.consume(end);
                want -= end;
            }
            last_byte_pos = *byte_pos;

            if let Some(map) = map {
                sections.push((pos, map.clone()))
            } else {
                // We don't need an empty source map when column is 0 or the next char is a newline.
                if pos.column != 0 && read.fill_buf()?.first().is_some_and(|&b| b != b'\n') {
                    sections.push((pos, SourceMap::empty_rope()));
                }
            }
        }

        if sections.len() == 1 && sections[0].0.line == 0 && sections[0].0.column == 0 {
            Ok(sections.into_iter().next().unwrap().1)
        } else {
            SourceMap::sections_to_rope(sections)
        }
    }
}
