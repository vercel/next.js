use std::{
    cmp::min,
    io::{BufRead, Result as IoResult, Write},
    ops,
};

use anyhow::Result;
use tracing::instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::rope::{Rope, RopeBuilder};
use turbo_tasks_hash::hash_xxh3_hash64;

use crate::{
    debug_id::generate_debug_id,
    output::OutputAsset,
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap, SourceMap, SourceMapAsset},
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
    should_generate_debug_id: bool,
}

impl Code {
    pub fn source_code(&self) -> &Rope {
        &self.code
    }

    /// Tests if any code in this Code contains an associated source map.
    pub fn has_source_map(&self) -> bool {
        !self.mappings.is_empty()
    }
    // Whether this code should have a debug id generated for it
    pub fn should_generate_debug_id(&self) -> bool {
        self.should_generate_debug_id
    }

    /// Take the source code out of the Code.
    pub fn into_source_code(self) -> Rope {
        self.code
    }

    // Formats the code with the source map and debug id comments as
    pub async fn to_rope_with_magic_comments(
        self: Vc<Self>,
        source_map_path_fn: impl FnOnce() -> Vc<SourceMapAsset>,
    ) -> Result<Rope> {
        let code = self.await?;
        Ok(
            if code.has_source_map() || code.should_generate_debug_id() {
                let mut rope_builder = RopeBuilder::default();
                let debug_id = self.debug_id().await?;
                // hand minified version of
                // ```javascript
                //  !() => {
                //    (globalThis ??= {})[new g.Error().stack] = <debug_id>;
                // }()
                // ```
                // But we need to be compatible with older runtimes since this code isn't transpiled
                // according to a browser list. So we use `var`, `function` and
                // try-caatch since we cannot rely on `Error.stack` being available.
                // And finally to ensure it is on one line since that is what the source map
                // expects.
                // So like Thanos we have to do it ourselves.
                if let Some(debug_id) = &*debug_id {
                    // Test for `globalThis` first since it is available on all platforms released
                    // since 2018! so it will mostly work
                    const GLOBALTHIS_EXPR: &str = r#""undefined"!=typeof globalThis?globalThis:"undefined"!=typeof global?global:"undefined"!=typeof window?window:"undefined"!=typeof self?self:{}"#;
                    const GLOBAL_VAR_NAME: &str = "_debugIds";
                    writeln!(
                        rope_builder,
                        r#";!function(){{try {{ var e={GLOBALTHIS_EXPR},n=(new e.Error).stack;n&&((e.{GLOBAL_VAR_NAME}|| (e.{GLOBAL_VAR_NAME}={{}}))[n]="{debug_id}")}}catch(e){{}}}}();"#,
                    )?;
                }

                rope_builder.concat(&code.code);
                rope_builder.push_static_bytes(b"\n");
                // Add debug ID comment if enabled
                if let Some(debug_id) = &*debug_id {
                    write!(rope_builder, "\n//# debugId={}", debug_id)?;
                }

                if code.has_source_map() {
                    let source_map_path = source_map_path_fn().path().await?;
                    write!(
                        rope_builder,
                        "\n//# sourceMappingURL={}",
                        urlencoding::encode(source_map_path.file_name())
                    )?;
                }
                rope_builder.build()
            } else {
                code.code.clone()
            },
        )
    }
}

/// CodeBuilder provides a mutable container to append source code.
pub struct CodeBuilder {
    code: RopeBuilder,
    mappings: Option<Vec<Mapping>>,
    should_generate_debug_id: bool,
}

impl Default for CodeBuilder {
    fn default() -> Self {
        Self {
            code: RopeBuilder::default(),
            mappings: Some(Vec::new()),
            should_generate_debug_id: false,
        }
    }
}

impl CodeBuilder {
    pub fn new(collect_mappings: bool, should_generate_debug_id: bool) -> Self {
        Self {
            code: RopeBuilder::default(),
            mappings: collect_mappings.then(Vec::new),
            should_generate_debug_id,
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
    ///
    /// This adjusts the source map to be relative to the new code object
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
            should_generate_debug_id: self.should_generate_debug_id,
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
    pub async fn generate_source_map(
        self: ResolvedVc<Self>,
    ) -> Result<Vc<OptionStringifiedSourceMap>> {
        let debug_id = self.debug_id().owned().await?;
        Ok(Vc::cell(Some(
            self.await?.generate_source_map_ref(debug_id),
        )))
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionDebugId(Option<RcStr>);

#[turbo_tasks::value_impl]
impl Code {
    /// Returns the hash of the source code of this Code.
    #[turbo_tasks::function]
    pub fn source_code_hash(&self) -> Vc<u64> {
        let code = self;
        let hash = hash_xxh3_hash64(code.source_code());
        Vc::cell(hash)
    }

    #[turbo_tasks::function]
    pub fn debug_id(&self) -> Vc<OptionDebugId> {
        Vc::cell(if self.should_generate_debug_id {
            Some(generate_debug_id(self.source_code()))
        } else {
            None
        })
    }
}

impl Code {
    /// Generates a source map from the code's mappings.
    #[instrument(level = "trace", name = "Code::generate_source_map", skip_all)]
    pub fn generate_source_map_ref(&self, debug_id: Option<RcStr>) -> Rope {
        // A debug id should be passed only if the code should generate a debug id, it is however
        // allowed to turn it off to access intermediate states of the code (e.g. for minification)
        debug_assert!(debug_id.is_none() || self.should_generate_debug_id);
        // If there is a debug id the first line will be modifying the global object. see
        // `[to_rope_with_magic_comments]` for more details.
        let mut pos = SourcePos::new(if debug_id.is_some() { 1 } else { 0 });

        let mut last_byte_pos = 0;

        let mut sections = Vec::with_capacity(self.mappings.len());
        let mut read = self.code.read();
        for (byte_pos, map) in &self.mappings {
            let mut want = byte_pos - last_byte_pos;
            while want > 0 {
                // `fill_buf` never returns an error.
                let buf = read.fill_buf().unwrap();
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
                if pos.column != 0
                    && read
                        .fill_buf()
                        .unwrap()
                        .first()
                        .is_some_and(|&b| b != b'\n')
                {
                    sections.push((pos, SourceMap::empty_rope()));
                }
            }
        }

        if sections.len() == 1
            && sections[0].0.line == 0
            && sections[0].0.column == 0
            && debug_id.is_none()
        {
            sections.into_iter().next().unwrap().1
        } else {
            SourceMap::sections_to_rope(sections, debug_id)
        }
    }
}
