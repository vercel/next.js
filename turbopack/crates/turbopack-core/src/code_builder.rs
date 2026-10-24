use std::{
    cmp::min,
    io::{BufRead, Result as IoResult, Write},
    ops,
    sync::Arc,
};

use anyhow::Result;
use bincode::{Decode, Encode};
use tracing::instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc};
use turbo_tasks_fs::{
    File, FileContent,
    rope::{Rope, RopeBuilder},
};
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher, hash_xxh3_hash128};

use crate::{
    debug_id::generate_debug_id,
    output::OutputAsset,
    source_map::{GenerateSourceMap, SourceMap, SourceMapAsset, structured::StructuredSourceMap},
    source_pos::SourcePos,
};

/// A per-section source map: either an opaque serialized map or a structured one whose
/// `sourcesContent` is shared rather than copied when the section is embedded.
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub enum SectionMap {
    Raw(Rope),
    Structured(Box<StructuredSourceMap>),
}

impl From<Rope> for SectionMap {
    fn from(map: Rope) -> Self {
        SectionMap::Raw(map)
    }
}

impl From<StructuredSourceMap> for SectionMap {
    fn from(map: StructuredSourceMap) -> Self {
        SectionMap::Structured(Box::new(map))
    }
}

impl DeterministicHash for SectionMap {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        match self {
            SectionMap::Raw(map) => {
                state.write_u8(0);
                map.deterministic_hash(state);
            }
            SectionMap::Structured(map) => {
                state.write_u8(1);
                map.deterministic_hash(state);
            }
        }
    }
}

impl SectionMap {
    pub fn to_rope(&self) -> Rope {
        match self {
            SectionMap::Raw(map) => map.clone(),
            SectionMap::Structured(map) => map.to_rope(),
        }
    }
}

/// A mapping of byte-offset in the code string to an associated source map.
pub type Mapping = (usize, Option<SectionMap>);

/// The file-level strict mode directive a [`Code`] can start with, see
/// [`CodeBuilder::push_strict_directive_prefix`].
pub const STRICT_DIRECTIVE: &str = "\"use strict\";";

/// Code stores combined output code and the source map of that output code.
#[turbo_tasks::value(shared, serialization = "hash")]
#[derive(Debug, Clone, Encode, Decode)]
pub struct Code {
    code: Rope,
    mappings: Arc<Vec<Mapping>>,
    should_generate_debug_id: bool,
    /// Whether `code` starts with an unmapped [`STRICT_DIRECTIVE`] that has to stay the first
    /// statement of the emitted file. No mapping starts before its end.
    strict_directive_prefix: bool,
}

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct PersistedCode(Code);

#[turbo_tasks::value_impl]
impl PersistedCode {
    #[turbo_tasks::function]
    pub async fn to_code(self: Vc<Self>) -> Result<Vc<Code>> {
        // PersistedCode is transparent over Code; owned() yields Code directly.
        Ok(self.owned().await?.cell())
    }
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

    /// Whether this code starts with an unmapped [`STRICT_DIRECTIVE`], see
    /// [`CodeBuilder::push_strict_directive_prefix`].
    pub fn has_strict_directive_prefix(&self) -> bool {
        self.strict_directive_prefix
    }

    /// Take the source code out of the Code.
    pub fn into_source_code(self) -> Rope {
        self.code
    }

    /// Stores this `Code` as a [`PersistedCode`] (fully serialized) and returns a `Vc<Code>`
    /// backed by the persisted version, avoiding an intermediate hash-mode `Code` cell.
    pub fn cell_persisted(self) -> ResolvedVc<PersistedCode> {
        PersistedCode(self).resolved_cell()
    }

    /// Writes the code, preceded by the snippet registering `debug_id` if there is one, in the
    /// layout [`Code::generate_source_map_ref`] describes.
    fn write_code_with_debug_id(
        &self,
        rope_builder: &mut RopeBuilder,
        debug_id: Option<&str>,
    ) -> Result<()> {
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
        //
        // A strict mode directive is only one at the very start of the file, so it is written
        // before the snippet, and the rest of the code after it.
        let Some(debug_id) = debug_id else {
            rope_builder.concat(&self.code);
            return Ok(());
        };
        let code = if self.strict_directive_prefix {
            rope_builder.push_static_bytes(STRICT_DIRECTIVE.as_bytes());
            self.code.slice_from(STRICT_DIRECTIVE.len())
        } else {
            self.code.clone()
        };
        // Test for `globalThis` first since it is available on all platforms released
        // since 2018! so it will mostly work
        const GLOBALTHIS_EXPR: &str = r#""undefined"!=typeof globalThis?globalThis:"undefined"!=typeof global?global:"undefined"!=typeof window?window:"undefined"!=typeof self?self:{}"#;
        const GLOBAL_VAR_NAME: &str = "_debugIds";
        writeln!(
            rope_builder,
            r#";!function(){{try {{ var e={GLOBALTHIS_EXPR},n=(new e.Error).stack;n&&((e.{GLOBAL_VAR_NAME}|| (e.{GLOBAL_VAR_NAME}={{}}))[n]="{debug_id}")}}catch(e){{}}}}();"#,
        )?;
        rope_builder.concat(&code);
        Ok(())
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
                code.write_code_with_debug_id(&mut rope_builder, debug_id.as_deref())?;
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
    strict_directive_prefix: bool,
}

impl Default for CodeBuilder {
    fn default() -> Self {
        Self {
            code: RopeBuilder::default(),
            mappings: Some(Vec::new()),
            should_generate_debug_id: false,
            strict_directive_prefix: false,
        }
    }
}

impl CodeBuilder {
    pub fn new(collect_mappings: bool, should_generate_debug_id: bool) -> Self {
        Self {
            code: RopeBuilder::default(),
            mappings: collect_mappings.then(Vec::new),
            should_generate_debug_id,
            strict_directive_prefix: false,
        }
    }

    /// Starts the code with an unmapped [`STRICT_DIRECTIVE`] that has to remain the first statement
    /// of the emitted file: [`Code::to_rope_with_magic_comments`] writes the debug id snippet after
    /// it rather than before.
    ///
    /// # Panics
    ///
    /// If anything was pushed before.
    pub fn push_strict_directive_prefix(&mut self) {
        assert!(
            self.code.is_empty()
                && self
                    .mappings
                    .as_ref()
                    .is_none_or(|mappings| mappings.is_empty()),
            "the strict directive prefix has to be the first thing pushed"
        );
        self.push_static_bytes(STRICT_DIRECTIVE.as_bytes());
        self.strict_directive_prefix = true;
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
    pub fn push_source<M: Into<SectionMap>>(&mut self, code: &Rope, map: Option<M>) {
        self.push_map(map.map(Into::into));
        self.code += code;
    }

    /// Copies the Synthetic/Original code of an already constructed Code into
    /// this instance.
    ///
    /// This adjusts the source map to be relative to the new code object. Copying code that starts
    /// with a strict directive prefix into an empty builder keeps the prefix marked.
    pub fn push_code(&mut self, prebuilt: &Code) {
        if self.code.is_empty() && prebuilt.strict_directive_prefix {
            // Zero-length sections have no code. Dropping them keeps the copied prefix unmapped.
            if let Some(mappings) = self.mappings.as_mut() {
                mappings.clear();
            }
            self.strict_directive_prefix = true;
        }
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
    fn push_map(&mut self, map: Option<SectionMap>) {
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
            mappings: Arc::new(self.mappings.unwrap_or_default()),
            should_generate_debug_id: self.should_generate_debug_id,
            strict_directive_prefix: self.strict_directive_prefix,
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
    pub async fn generate_source_map(self: ResolvedVc<Self>) -> Result<Vc<FileContent>> {
        let debug_id = self.debug_id().owned().await?;
        Ok(FileContent::Content(File::from(self.await?.generate_source_map_ref(debug_id))).cell())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionDebugId(Option<RcStr>);

#[turbo_tasks::value_impl]
impl Code {
    /// Returns the hash of the source code of this Code.
    #[turbo_tasks::function]
    pub fn source_code_hash(&self) -> Vc<u128> {
        let code = self;
        let hash = hash_xxh3_hash128(code.source_code());
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
        // `[to_rope_with_magic_comments]` for more details. A strict directive prefix is written
        // before that line instead, so the rest of the code starts at the beginning of the next
        // line. The prefix is unmapped, so no mapping starts before its end.
        let mut pos = SourcePos::new(if debug_id.is_some() { 1 } else { 0 });

        let mut last_byte_pos = 0;
        let mut read = self.code.read();
        if debug_id.is_some() && self.strict_directive_prefix {
            last_byte_pos = STRICT_DIRECTIVE.len();
            let mut want = last_byte_pos;
            while want > 0 {
                let buf = read.fill_buf().unwrap();
                debug_assert!(!buf.is_empty());
                let end = min(want, buf.len());
                read.consume(end);
                want -= end;
            }
        }

        let mut sections = Vec::with_capacity(self.mappings.len());
        for (byte_pos, map) in self.mappings.iter() {
            debug_assert!(
                *byte_pos >= last_byte_pos,
                "no mapping starts inside the prefix"
            );
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
                sections.push((pos, map.to_rope()))
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

#[cfg(test)]
mod tests {
    use turbo_tasks_fs::rope::{Rope, RopeBuilder};

    use super::{Code, CodeBuilder, STRICT_DIRECTIVE};
    use crate::source_map::{SourceMap, Token};

    const DEBUG_ID: &str = "00000000-0000-0000-0000-000000000000";

    /// A section map with `(generated line, generated column, original line, original column)`
    /// tokens, relative to the section.
    fn section_map(tokens: &[(u32, u32, u32, u32)]) -> Rope {
        let mut builder = swc_sourcemap::SourceMapBuilder::new(None);
        let src = builder.add_source("turbopack:///[project]/a.js".into());
        for &(dst_line, dst_col, src_line, src_col) in tokens {
            builder.add_raw(dst_line, dst_col, src_line, src_col, Some(src), None, false);
        }
        let mut buf = Vec::new();
        builder.into_sourcemap().to_writer(&mut buf).unwrap();
        Rope::from(buf)
    }

    /// Code starting with the strict directive prefix, with mapped code on the prefix's line, a
    /// mapped section spanning lines, and non-ASCII text before mapped code.
    fn marked_code() -> Code {
        let mut code = CodeBuilder::new(true, true);
        code.push_strict_directive_prefix();
        code += "(globalThis.x = [";
        code.push_source(
            &Rope::from("f(\"\u{fc}\"), g\nh()".to_string()),
            Some(section_map(&[(0, 0, 3, 4), (0, 9, 4, 0), (1, 0, 5, 2)])),
        );
        code += "]);\n// \u{fc}\u{e9} ";
        code.push_source(
            &Rope::from("k()".to_string()),
            Some(section_map(&[(0, 0, 9, 1)])),
        );
        code.build()
    }

    fn written(code: &Code, debug_id: Option<&str>) -> String {
        let mut rope = RopeBuilder::default();
        code.write_code_with_debug_id(&mut rope, debug_id).unwrap();
        rope.build().to_str().unwrap().into_owned()
    }

    /// `(generated line, generated column, original line, original column)` of the original tokens.
    fn tokens(code: &Code, debug_id: Option<&str>) -> Vec<(u32, u32, u32, u32)> {
        let map = code.generate_source_map_ref(debug_id.map(Into::into));
        SourceMap::new_from_rope(&map)
            .unwrap()
            .unwrap()
            .tokens()
            .filter_map(|token| match token {
                Token::Original(t) => Some((
                    t.generated_line,
                    t.generated_column,
                    t.original_line,
                    t.original_column,
                )),
                Token::Synthetic(_) => None,
            })
            .collect()
    }

    #[test]
    fn debug_id_snippet_is_written_after_the_strict_directive() {
        let code = marked_code();
        let plain = written(&code, None);
        let with_debug_id = written(&code, Some(DEBUG_ID));

        assert!(plain.starts_with(STRICT_DIRECTIVE));
        assert!(with_debug_id.starts_with(&format!("{STRICT_DIRECTIVE};!function(){{")));
        assert_eq!(with_debug_id.matches(STRICT_DIRECTIVE).count(), 1);

        // The directive moves before the snippet line; everything else moves one line down.
        let (snippet_line, rest) = with_debug_id.split_once('\n').unwrap();
        assert!(snippet_line.contains(DEBUG_ID));
        assert_eq!(rest, &plain[STRICT_DIRECTIVE.len()..]);
    }

    fn text_at(text: &str, line: u32, column: u32) -> String {
        text.lines()
            .nth(line as usize)
            .unwrap()
            .chars()
            .skip(column as usize)
            .take(3)
            .collect()
    }

    #[test]
    fn source_map_follows_the_strict_directive_prefix() {
        let code = marked_code();
        let plain_text = written(&code, None);
        let debug_text = written(&code, Some(DEBUG_ID));
        let plain = tokens(&code, None);
        let with_debug_id = tokens(&code, Some(DEBUG_ID));
        assert_eq!(
            plain,
            vec![(0, 30, 3, 4), (0, 39, 4, 0), (1, 0, 5, 2), (2, 6, 9, 1)]
        );
        assert_eq!(
            with_debug_id,
            vec![(1, 17, 3, 4), (1, 26, 4, 0), (2, 0, 5, 2), (3, 6, 9, 1)]
        );
        for (
            &(plain_line, plain_column, original_line, original_column),
            &(line, column, debug_original_line, debug_original_column),
        ) in plain.iter().zip(&with_debug_id)
        {
            assert_eq!(
                text_at(&debug_text, line, column),
                text_at(&plain_text, plain_line, plain_column)
            );
            assert_eq!(
                (debug_original_line, debug_original_column),
                (original_line, original_column)
            );
        }
    }

    #[test]
    fn unmarked_code_keeps_the_snippet_first() {
        let mut code = CodeBuilder::new(true, true);
        code += STRICT_DIRECTIVE;
        code.push_source(
            &Rope::from("f()".to_string()),
            Some(section_map(&[(0, 0, 1, 0)])),
        );
        let code = code.build();
        assert!(!code.has_strict_directive_prefix());
        assert!(written(&code, Some(DEBUG_ID)).starts_with(";!function(){"));
        assert_eq!(
            tokens(&code, Some(DEBUG_ID)),
            vec![(1, STRICT_DIRECTIVE.len() as u32, 1, 0)]
        );
    }

    #[test]
    fn strict_directive_prefix_survives_copying_into_an_empty_builder() {
        let code = marked_code();
        assert!(code.has_strict_directive_prefix());

        let copied = CodeBuilder::from(code.clone()).build();
        assert!(copied.has_strict_directive_prefix());
        assert_eq!(
            written(&copied, Some(DEBUG_ID)),
            written(&code, Some(DEBUG_ID))
        );
        assert_eq!(tokens(&copied, None), tokens(&code, None));

        let mut appended = CodeBuilder::new(true, false);
        appended += "x;";
        appended.push_code(&code);
        assert!(!appended.build().has_strict_directive_prefix());

        let mut after_empty_source = CodeBuilder::new(true, true);
        after_empty_source.push_source(&Rope::default(), Some(section_map(&[])));
        after_empty_source.push_code(&code);
        let after_empty_source = after_empty_source.build();
        assert!(after_empty_source.has_strict_directive_prefix());
        assert_eq!(
            tokens(&after_empty_source, Some(DEBUG_ID)),
            tokens(&code, Some(DEBUG_ID))
        );
    }

    #[test]
    #[should_panic(expected = "the strict directive prefix has to be the first thing pushed")]
    fn strict_directive_prefix_must_come_before_empty_mapped_sources() {
        let mut code = CodeBuilder::new(true, true);
        code.push_source(&Rope::default(), Some(section_map(&[])));
        code.push_strict_directive_prefix();
    }

    #[test]
    #[should_panic(expected = "the strict directive prefix has to be the first thing pushed")]
    fn strict_directive_prefix_must_come_first() {
        let mut code = CodeBuilder::default();
        code += "x;";
        code.push_strict_directive_prefix();
    }
}
