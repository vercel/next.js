use std::{
    cmp::min,
    io::{BufRead, Result as IoResult, Write},
    ops,
};

use anyhow::{Context, Result};
use indexmap::{IndexMap, IndexSet};
use turbo_tasks::Vc;
use turbo_tasks_fs::{
    rope::{Rope, RopeBuilder},
    util::uri_from_file,
    DiskFileSystem, FileSystemPath,
};
use turbo_tasks_hash::hash_xxh3_hash64;

use crate::{
    source_map::{GenerateSourceMap, OptionSourceMap, SourceMap, SourceMapSection},
    source_pos::SourcePos,
    SOURCE_MAP_PREFIX,
};

/// A mapping of byte-offset in the code string to an associated source map.
pub type Mapping = (usize, Option<Vc<Box<dyn GenerateSourceMap>>>);

/// Code stores combined output code and the source map of that output code.
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub struct Code {
    code: Rope,

    mappings: Vec<Mapping>,
}

/// CodeBuilder provides a mutable container to append source code.
#[derive(Default)]
pub struct CodeBuilder {
    code: RopeBuilder,

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
}

impl CodeBuilder {
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
    pub fn push_source(&mut self, code: &Rope, map: Option<Vc<Box<dyn GenerateSourceMap>>>) {
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

    /// Setting breakpoints on synthetic code can cause weird behaviors
    /// because Chrome will treat the location as belonging to the previous
    /// original code section. By inserting an empty source map when reaching a
    /// synthetic section directly after an original section, we tell Chrome
    /// that the previous map ended at this point.
    fn push_map(&mut self, map: Option<Vc<Box<dyn GenerateSourceMap>>>) {
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

    /// Tests if any code in this CodeBuilder contains an associated source map.
    pub fn has_source_map(&self) -> bool {
        !self.mappings.is_empty()
    }

    pub fn build(self) -> Code {
        Code {
            code: self.code.build(),
            mappings: self.mappings,
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
    pub async fn generate_source_map(&self) -> Result<Vc<OptionSourceMap>> {
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

            let encoded = match map {
                None => SourceMap::empty(),
                Some(map) => match *map.generate_source_map().await? {
                    None => SourceMap::empty(),
                    Some(map) => {
                        let map = &*map.await?;
                        let map = map.to_source_map().await?;
                        match map.as_regular_source_map() {
                            None => SourceMap::empty(),
                            Some(map) => {
                                let mut map = map.into_owned();
                                let mut ignored_ids = IndexSet::new();
                                for (src_id, src) in map.sources().enumerate() {
                                    if src.starts_with("turbopack://[next]")
                                        || src.starts_with("turbopack://[turbopack]")
                                        || src.contains("/node_modules/")
                                    {
                                        ignored_ids.insert(src_id);
                                    }
                                }

                                for ignored_id in ignored_ids {
                                    map.add_to_ignore_list(ignored_id as _);
                                }

                                SourceMap::new_decoded(sourcemap::DecodedMap::Regular(map)).cell()
                            }
                        }
                    }
                },
            };

            sections.push(SourceMapSection::new(pos, encoded.to_resolved().await?))
        }

        Ok(Vc::cell(Some(
            SourceMap::new_sectioned(sections).resolved_cell(),
        )))
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

/// Turns `turbopack://[project]`` references in sourcemap sources into absolute
/// `file://` uris. This is useful for debugging environments.
#[turbo_tasks::function]
pub async fn fileify_source_map(
    map: Vc<OptionSourceMap>,
    context_path: Vc<FileSystemPath>,
) -> Result<Vc<OptionSourceMap>> {
    let Some(map) = &*map.await? else {
        return Ok(OptionSourceMap::none());
    };

    let flattened = map.await?.to_source_map().await?;
    let flattened = flattened.as_regular_source_map();

    let Some(flattened) = flattened else {
        return Ok(OptionSourceMap::none());
    };

    let context_fs = context_path.fs();
    let context_fs = &*Vc::try_resolve_downcast_type::<DiskFileSystem>(context_fs)
        .await?
        .context("Expected the chunking context to have a DiskFileSystem")?
        .await?;
    let prefix = format!("{}[{}]/", SOURCE_MAP_PREFIX, context_fs.name());

    let mut transformed = flattened.into_owned();
    let mut updates = IndexMap::new();
    for (src_id, src) in transformed.sources().enumerate() {
        let src = {
            match src.strip_prefix(&prefix) {
                Some(src) => uri_from_file(context_path, Some(src)).await?,
                None => src.to_string(),
            }
        };
        updates.insert(src_id, src);
    }

    for (src_id, src) in updates {
        transformed.set_source(src_id as _, &src);
    }

    Ok(Vc::cell(Some(
        SourceMap::new_decoded(sourcemap::DecodedMap::Regular(transformed)).resolved_cell(),
    )))
}
