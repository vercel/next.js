use std::{
    cmp::min,
    io::{BufRead, Result as IoResult, Write},
    ops::{self, Range},
    sync::Arc,
};

use anyhow::Result;
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use tracing::instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{
    CellRope, CellRopeBuilder, File, FileContent,
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

/// The `"use strict";` directive written by [`CodeBuilder::push_strict_directive`].
pub const STRICT_DIRECTIVE: &str = "\"use strict\";";

/// Code stores combined output code and the source map of that output code.
#[turbo_tasks::value(shared, serialization = "hash")]
#[derive(Debug, Clone, Encode, Decode)]
pub struct Code {
    code: Rope,
    mappings: Arc<Vec<Mapping>>,
    should_generate_debug_id: bool,
    /// Byte offset in `code` of a [`STRICT_DIRECTIVE`] that a consumer may remove, see
    /// [`CodeBuilder::push_code_without_strict_directive`]. The directive is its own unmapped
    /// section: no mapping starts inside it, and the code after it starts a new section.
    strict_directive: Option<usize>,
}

/// A [`Code`] stored as cells: the code bytes and each section's source map are separate
/// [`Rope`] cells, owned by the task that created them.
///
/// [`Code`] is only hashed in the persistent cache, so this is how a piece of code (e.g. a module
/// factory) is persisted. Keeping the bytes in their own cells lets composite outputs reference
/// them through a [`CellRope`] instead of persisting a copy (see [`ComposedCodeBuilder`]).
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub struct CodeCells {
    code: ResolvedVc<Rope>,
    /// The same byte offsets as [`Code`]'s mappings, with each map as a cell holding
    /// [`SectionMap::to_rope`].
    mappings: Vec<(usize, Option<ResolvedVc<Rope>>)>,
    should_generate_debug_id: bool,
    /// Same as [`Code`]'s strict directive offset.
    strict_directive: Option<usize>,
}

#[turbo_tasks::value_impl]
impl CodeCells {
    /// Reads the cells back into a [`Code`].
    #[turbo_tasks::function]
    pub async fn to_code(&self) -> Result<Vc<Code>> {
        let code = self.code.await?;
        let mappings = self
            .mappings
            .iter()
            .map(async |(index, map)| {
                Ok((
                    *index,
                    match map {
                        Some(map) => Some(SectionMap::Raw(map.owned().await?)),
                        None => None,
                    },
                ))
            })
            .try_join()
            .await?;
        Ok(Code {
            code: (*code).clone(),
            mappings: Arc::new(mappings),
            should_generate_debug_id: self.should_generate_debug_id,
            strict_directive: self.strict_directive,
        }
        .cell())
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

    /// The byte range of the removable `"use strict"` directive, if this code has one. See
    /// [`CodeBuilder::push_strict_directive`].
    pub fn strict_directive(&self) -> Option<Range<usize>> {
        self.strict_directive
            .map(|start| start..start + STRICT_DIRECTIVE.len())
    }

    /// Take the source code out of the Code.
    pub fn into_source_code(self) -> Rope {
        self.code
    }

    /// Stores this `Code` as [`CodeCells`] in the current task: the code and each section map
    /// become their own persisted [`Rope`] cells.
    pub fn resolved_code_cells(self) -> ResolvedVc<CodeCells> {
        let mappings = self
            .mappings
            .iter()
            .map(|(index, map)| {
                (
                    *index,
                    map.as_ref().map(|map| map.to_rope().resolved_cell()),
                )
            })
            .collect();
        CodeCells {
            code: self.code.resolved_cell(),
            mappings,
            should_generate_debug_id: self.should_generate_debug_id,
            strict_directive: self.strict_directive,
        }
        .resolved_cell()
    }

    // Formats the code with the source map and debug id comments as
    pub async fn to_rope_with_magic_comments(
        self: Vc<Self>,
        source_map_path_fn: impl FnOnce() -> Vc<SourceMapAsset>,
    ) -> Result<Rope> {
        let code = self.await?;
        Ok(match self.magic_comments(source_map_path_fn).await? {
            Some((prefix, suffix)) => {
                let mut rope_builder = RopeBuilder::default();
                rope_builder.concat(&prefix);
                rope_builder.concat(&code.code);
                rope_builder.concat(&suffix);
                rope_builder.build()
            }
            None => code.code.clone(),
        })
    }

    /// Like [`Code::to_rope_with_magic_comments`], but for code whose bytes are described by
    /// `body` (see [`ComposedCodeBuilder`]). Produces the same bytes.
    pub async fn to_cell_rope_with_magic_comments(
        self: Vc<Self>,
        body: &CellRope,
        source_map_path_fn: impl FnOnce() -> Vc<SourceMapAsset>,
    ) -> Result<CellRope> {
        let mut rope_builder = CellRopeBuilder::default();
        match self.magic_comments(source_map_path_fn).await? {
            Some((prefix, suffix)) => {
                rope_builder.concat(&prefix);
                rope_builder.append(body);
                rope_builder.concat(&suffix);
            }
            None => rope_builder.append(body),
        }
        Ok(rope_builder.build())
    }

    /// The bytes [`Code::to_rope_with_magic_comments`] puts before and after the code, if any.
    async fn magic_comments(
        self: Vc<Self>,
        source_map_path_fn: impl FnOnce() -> Vc<SourceMapAsset>,
    ) -> Result<Option<(Rope, Rope)>> {
        let code = self.await?;
        if !code.has_source_map() && !code.should_generate_debug_id() {
            return Ok(None);
        }
        let debug_id = self.debug_id().await?;
        let mut prefix = RopeBuilder::default();
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
                prefix,
                r#";!function(){{try {{ var e={GLOBALTHIS_EXPR},n=(new e.Error).stack;n&&((e.{GLOBAL_VAR_NAME}|| (e.{GLOBAL_VAR_NAME}={{}}))[n]="{debug_id}")}}catch(e){{}}}}();"#,
            )?;
        }

        let mut suffix = RopeBuilder::default();
        suffix.push_static_bytes(b"\n");
        // Add debug ID comment if enabled
        if let Some(debug_id) = &*debug_id {
            write!(suffix, "\n//# debugId={}", debug_id)?;
        }

        if code.has_source_map() {
            let source_map_path = source_map_path_fn().path().await?;
            write!(
                suffix,
                "\n//# sourceMappingURL={}",
                urlencoding::encode(source_map_path.file_name())
            )?;
        }
        Ok(Some((prefix.build(), suffix.build())))
    }
}

/// CodeBuilder provides a mutable container to append source code.
pub struct CodeBuilder {
    code: RopeBuilder,
    mappings: Option<Vec<Mapping>>,
    should_generate_debug_id: bool,
    strict_directive: Option<usize>,
}

impl Default for CodeBuilder {
    fn default() -> Self {
        Self {
            code: RopeBuilder::default(),
            mappings: Some(Vec::new()),
            should_generate_debug_id: false,
            strict_directive: None,
        }
    }
}

impl CodeBuilder {
    pub fn new(collect_mappings: bool, should_generate_debug_id: bool) -> Self {
        Self {
            code: RopeBuilder::default(),
            mappings: collect_mappings.then(Vec::new),
            should_generate_debug_id,
            strict_directive: None,
        }
    }

    /// Pushes a `"use strict";` directive as synthetic code and records its position, so that
    /// a consumer that places this code in a strict context anyway can remove it again with
    /// [`CodeBuilder::push_code_without_strict_directive`].
    ///
    /// The directive becomes its own unmapped section; code pushed after it starts a new
    /// section. At most one directive can be recorded per [`Code`].
    pub fn push_strict_directive(&mut self) {
        debug_assert!(
            self.strict_directive.is_none(),
            "only one strict directive can be recorded"
        );
        self.strict_directive = Some(self.code.len());
        self.push_static_bytes(STRICT_DIRECTIVE.as_bytes());
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

    /// Like [`CodeBuilder::push_code`], but leaves out the code's recorded `"use strict"`
    /// directive (see [`CodeBuilder::push_strict_directive`]), if it has one. Use it only where
    /// the code is placed in a strict context by other means.
    ///
    /// The directive is its own unmapped section, so this only drops its bytes and moves the
    /// following sections up; no section map has to be rewritten.
    pub fn push_code_without_strict_directive(&mut self, prebuilt: &Code) {
        let Some(directive) = prebuilt.strict_directive() else {
            self.push_code(prebuilt);
            return;
        };
        debug_assert!(
            prebuilt
                .mappings
                .iter()
                .all(|(index, map)| !directive.contains(index) || map.is_none()),
            "a strict directive must be unmapped"
        );
        let removed = directive.len();
        // Mappings starting inside the directive only end the preceding section, which the
        // section after the directive does as well, so they are dropped.
        let mappings = prebuilt
            .mappings
            .iter()
            .filter(|(index, _)| !directive.contains(index))
            .map(|(index, map)| {
                let index = if *index >= directive.end {
                    index - removed
                } else {
                    *index
                };
                (index, map.clone())
            })
            .collect();
        self.push_code(&Code {
            code: prebuilt.code.skip(directive),
            mappings: Arc::new(mappings),
            should_generate_debug_id: prebuilt.should_generate_debug_id,
            strict_directive: None,
        });
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

    /// The number of bytes pushed so far.
    pub fn len(&self) -> usize {
        self.code.len()
    }

    pub fn is_empty(&self) -> bool {
        self.code.is_empty()
    }

    pub fn build(self) -> Code {
        Code {
            code: self.code.build(),
            mappings: Arc::new(self.mappings.unwrap_or_default()),
            should_generate_debug_id: self.should_generate_debug_id,
            strict_directive: self.strict_directive,
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

/// Builds a [`Code`] like [`CodeBuilder`], and alongside it a [`CellRope`] describing the same
/// bytes, in which pieces pushed with [`ComposedCodeBuilder::push_code_cells`] are references to
/// their [`CodeCells`] instead of copies.
///
/// Composite outputs (chunks) use the `CellRope` as their persisted representation, so each
/// piece's bytes (and source maps) are persisted once, by the task that owns the cells.
pub struct ComposedCodeBuilder {
    code: CodeBuilder,
    body: CellRopeBuilder,
    /// Section maps that are cells, by their byte offset in the built code.
    map_cells: FxHashMap<usize, ResolvedVc<Rope>>,
}

impl ComposedCodeBuilder {
    pub fn new(collect_mappings: bool, should_generate_debug_id: bool) -> Self {
        Self {
            code: CodeBuilder::new(collect_mappings, should_generate_debug_id),
            body: CellRopeBuilder::default(),
            map_cells: FxHashMap::default(),
        }
    }

    /// Appends `code`, which must be `cells` read back with [`CodeCells::to_code`]. The
    /// [`CellRope`] references the cells instead of copying the bytes.
    pub fn push_code_cells(&mut self, cells: &CodeCells, code: &Code) {
        let offset = self.code.len();
        self.code.push_code(code);
        if !code.source_code().is_empty() {
            self.body.push_cell(cells.code);
        }
        if self.code.mappings.is_some() {
            for (index, map) in &cells.mappings {
                if let Some(map) = map {
                    self.map_cells.insert(offset + index, *map);
                }
            }
        }
    }

    /// Appends code that has no cells of its own; its bytes are inlined into the [`CellRope`].
    pub fn push_code(&mut self, code: &Code) {
        self.code.push_code(code);
        self.body.concat(code.source_code());
    }

    /// Like [`ComposedCodeBuilder::push_code`], but leaves out the code's recorded strict
    /// directive (see [`CodeBuilder::push_code_without_strict_directive`]).
    pub fn push_code_without_strict_directive(&mut self, code: &Code) {
        self.code.push_code_without_strict_directive(code);
        match code.strict_directive() {
            Some(directive) => self.body.concat(&code.source_code().skip(directive)),
            None => self.body.concat(code.source_code()),
        }
    }

    pub fn build(self) -> (Code, ComposedCodeParts) {
        let mut map_cells = self.map_cells.into_iter().collect::<Vec<_>>();
        map_cells.sort_unstable_by_key(|(offset, _)| *offset);
        (
            self.code.build(),
            ComposedCodeParts {
                body: self.body.build(),
                map_cells,
            },
        )
    }
}

impl ops::AddAssign<&'static str> for ComposedCodeBuilder {
    fn add_assign(&mut self, rhs: &'static str) {
        self.code += rhs;
        self.body += rhs;
    }
}

impl Write for ComposedCodeBuilder {
    fn write(&mut self, bytes: &[u8]) -> IoResult<usize> {
        self.code.write_all(bytes)?;
        self.body.write_all(bytes)?;
        Ok(bytes.len())
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
    ///
    /// Section offsets are computed in UTF-16 code units by scanning the code's rope one chunk at
    /// a time, so every chunk must be self-contained text: rope chunks (and mapping positions)
    /// must not split a UTF-8 sequence or a "\r\n". Splitting them is a bug in the code that built
    /// the rope, and can result in incorrect offsets for the sections after it.
    #[instrument(level = "trace", name = "Code::generate_source_map", skip_all)]
    pub fn generate_source_map_ref(&self, debug_id: Option<RcStr>) -> Rope {
        // A debug id should be passed only if the code should generate a debug id, it is however
        // allowed to turn it off to access intermediate states of the code (e.g. for minification)
        debug_assert!(debug_id.is_none() || self.should_generate_debug_id);
        let sections = self
            .source_map_sections(debug_id.is_some())
            .into_iter()
            .map(|(pos, section)| {
                let map = match section {
                    Some(index) => self.mappings[index]
                        .1
                        .as_ref()
                        .expect("sections only refer to maps")
                        .to_rope(),
                    None => SourceMap::empty_rope(),
                };
                (pos, map)
            })
            .collect::<Vec<_>>();

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

    /// The sections of this code's source map: where each starts, and the index of its mapping
    /// (`None` for an empty map that ends the previous section).
    fn source_map_sections(&self, has_debug_id: bool) -> Vec<(SourcePos, Option<usize>)> {
        // If there is a debug id the first line will be modifying the global object. see
        // `[to_rope_with_magic_comments]` for more details.
        let mut pos = SourcePos::new(if has_debug_id { 1 } else { 0 });

        let mut last_byte_pos = 0;

        let mut sections = Vec::with_capacity(self.mappings.len());
        let mut read = self.code.read();
        for (index, (byte_pos, map)) in self.mappings.iter().enumerate() {
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

            if map.is_some() {
                sections.push((pos, Some(index)))
            } else {
                // We don't need an empty source map when column is 0 or the next char is a newline.
                if pos.column != 0
                    && read
                        .fill_buf()
                        .unwrap()
                        .first()
                        .is_some_and(|&b| b != b'\n')
                {
                    sections.push((pos, None));
                }
            }
        }
        sections
    }
}

/// The [`CellRope`] side of a [`ComposedCodeBuilder`]: the code's bytes, and which of its source
/// map sections are cells.
#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub struct ComposedCodeParts {
    body: CellRope,
    map_cells: Vec<(usize, ResolvedVc<Rope>)>,
}

impl ComposedCodeParts {
    /// The code's bytes. See [`Code::to_cell_rope_with_magic_comments`].
    pub fn body(&self) -> &CellRope {
        &self.body
    }

    /// Generates the source map for `code` (which must have been built together with these
    /// parts) as a [`CellRope`]. Produces the same bytes as [`Code::generate_source_map_ref`],
    /// with the sections that are cells referenced instead of copied.
    pub fn generate_source_map(&self, code: &Code, debug_id: Option<RcStr>) -> CellRope {
        let map_cells: FxHashMap<usize, ResolvedVc<Rope>> =
            self.map_cells.iter().copied().collect();
        let sections = code
            .source_map_sections(debug_id.is_some())
            .into_iter()
            .map(|(pos, section)| {
                let section = match section {
                    Some(index) => {
                        let (byte_pos, map) = &code.mappings[index];
                        match map_cells.get(byte_pos) {
                            Some(cell) => ComposedSection::Cell(*cell),
                            None => ComposedSection::Inline(
                                map.as_ref().expect("sections only refer to maps").to_rope(),
                            ),
                        }
                    }
                    None => ComposedSection::Inline(SourceMap::empty_rope()),
                };
                (pos, section)
            })
            .collect::<Vec<_>>();
        let mut rope = CellRopeBuilder::default();
        if let [(pos, section)] = &sections[..]
            && pos.line == 0
            && pos.column == 0
            && debug_id.is_none()
        {
            // Mirrors the single-section shortcut of `generate_source_map_ref`.
            section.push_to(&mut rope);
        } else {
            SourceMap::write_sections(&mut rope, sections, debug_id, |rope, section| {
                section.push_to(rope)
            });
        }
        rope.build()
    }
}

enum ComposedSection {
    Cell(ResolvedVc<Rope>),
    Inline(Rope),
}

impl ComposedSection {
    fn push_to(&self, rope: &mut CellRopeBuilder) {
        match self {
            ComposedSection::Cell(cell) => rope.push_cell(*cell),
            ComposedSection::Inline(map) => rope.concat(map),
        }
    }
}

/// A [`Code`], plus (when its bytes are composed from other tasks' cells) the
/// [`ComposedCodeParts`] describing them. Output files built from it reference those cells
/// instead of persisting copies (see `turbo_tasks_fs::File::from_cell_rope`).
#[turbo_tasks::value(shared)]
pub struct ComposedCode {
    code: ResolvedVc<Code>,
    parts: Option<ComposedCodeParts>,
}

impl ComposedCode {
    /// `parts` must have been built together with `code` (see [`ComposedCodeBuilder::build`]),
    /// or be `None` if `code` was transformed afterwards (e.g. minified as a whole).
    pub fn new(code: Code, parts: Option<ComposedCodeParts>) -> Self {
        ComposedCode {
            code: code.resolved_cell(),
            parts,
        }
    }

    pub fn code(&self) -> Vc<Code> {
        *self.code
    }

    /// The output file: the code with its source map and debug id comments. Same bytes as
    /// [`Code::to_rope_with_magic_comments`].
    pub async fn to_file_with_magic_comments(
        &self,
        source_map_path_fn: impl FnOnce() -> Vc<SourceMapAsset>,
    ) -> Result<File> {
        match &self.parts {
            Some(parts) => {
                let rope = self
                    .code
                    .to_cell_rope_with_magic_comments(parts.body(), source_map_path_fn)
                    .await?;
                File::from_cell_rope(rope.resolved_cell()).await
            }
            None => Ok(File::from(
                self.code
                    .to_rope_with_magic_comments(source_map_path_fn)
                    .await?,
            )),
        }
    }

    /// The source map file. Same bytes as [`Code::generate_source_map`].
    pub async fn source_map_file_content(&self) -> Result<Vc<FileContent>> {
        Ok(match &self.parts {
            Some(parts) => {
                let debug_id = self.code.debug_id().owned().await?;
                let rope = parts.generate_source_map(&*self.code.await?, debug_id);
                FileContent::Content(File::from_cell_rope(rope.resolved_cell()).await?).cell()
            }
            None => self.code.generate_source_map(),
        })
    }
}

#[cfg(test)]
mod tests {
    use serde_json::Value;
    use swc_sourcemap::{DecodedMap, SourceMapBuilder};
    use turbo_tasks_fs::rope::Rope;

    use super::*;

    const SECTION_MAP: &str = r#"{"version":3,"sources":["a.js"],"names":[],"mappings":"AAAA"}"#;

    fn section_offsets(code: &Code) -> Vec<(u64, u64)> {
        let map = code.generate_source_map_ref(None);
        let map: Value = serde_json::from_str(&map.to_str().unwrap()).unwrap();
        map["sections"]
            .as_array()
            .unwrap()
            .iter()
            .map(|section| {
                let offset = &section["offset"];
                (
                    offset["line"].as_u64().unwrap(),
                    offset["column"].as_u64().unwrap(),
                )
            })
            .collect()
    }

    #[test]
    fn section_offsets_count_utf16_code_units() {
        let mut builder = CodeBuilder::default();
        // `🦀` is a 4-byte UTF-8 sequence and two UTF-16 code units, `é` is a single unit.
        let prefix = "line0\n\"🦀é\"; ";
        builder += prefix;
        builder.push_source(
            &Rope::from("mapped();".to_string()),
            Some(Rope::from(SECTION_MAP.to_string())),
        );
        let code = builder.build();

        let expected_column = "\"🦀é\"; ".encode_utf16().count() as u64;
        assert_eq!(expected_column, 7);
        assert_eq!(section_offsets(&code), vec![(1, expected_column)]);
    }

    /// A map for `src` that maps the start of every line to line `n` column 0 of `a.js`, and
    /// every `x` to the same line and the column it has in `src`.
    fn line_map(src: &str) -> Rope {
        let mut builder = SourceMapBuilder::new(None);
        let id = builder.add_source("a.js".into());
        builder.set_source_contents(id, Some(src.to_string().into()));
        for (line, text) in src.lines().enumerate() {
            builder.add_raw(line as u32, 0, line as u32, 0, Some(id), None, false);
            for (col, _) in text.match_indices('x') {
                builder.add_raw(
                    line as u32,
                    col as u32,
                    line as u32,
                    col as u32,
                    Some(id),
                    None,
                    false,
                );
            }
        }
        let mut out = Vec::new();
        builder.into_sourcemap().to_writer(&mut out).unwrap();
        out.into()
    }

    /// `(generated line, generated column, original line, original column)` of every token
    /// mapped to an original source.
    fn tokens(code: &Code) -> Vec<(u32, u32, u32, u32)> {
        let map = match swc_sourcemap::decode_slice(&code.generate_source_map_ref(None).to_bytes())
            .unwrap()
        {
            DecodedMap::Regular(map) => map,
            DecodedMap::Index(index) => index.flatten().unwrap(),
            DecodedMap::Hermes(_) => unreachable!(),
        };
        map.tokens()
            .filter(|token| token.has_source())
            .map(|token| {
                (
                    token.get_dst_line(),
                    token.get_dst_col(),
                    token.get_src_line(),
                    token.get_src_col(),
                )
            })
            .collect()
    }

    fn factory(head: &'static str, gap: &'static str, body: &str) -> Code {
        let mut code = CodeBuilder::new(true, false);
        code += head;
        code.push_strict_directive();
        code += gap;
        code.push_source(&body.to_string().into(), Some(line_map(body)));
        code += "})";
        code.build()
    }

    fn compose(factory: &Code, without_directive: bool) -> Code {
        let mut code = CodeBuilder::new(true, false);
        code += "[1,";
        if without_directive {
            code.push_code_without_strict_directive(factory);
        } else {
            code.push_code(factory);
        }
        code += "]";
        code.build()
    }

    #[test]
    fn strict_directive_is_recorded() {
        let code = factory("((ctx) => {\n", "\n\n", "x();\n");
        let range = code.strict_directive().unwrap();
        let text = code.source_code().to_str().unwrap().into_owned();
        assert_eq!(&text[range], STRICT_DIRECTIVE);
    }

    #[test]
    fn removing_strict_directive_keeps_following_lines_mapped() {
        // An unminified factory: the directive is on a line of its own.
        let factory = factory("((ctx) => {\n", "\n\n", "a; x();\nb; x();\n");
        let with = compose(&factory, false);
        let without = compose(&factory, true);
        assert_eq!(
            without.source_code().to_str().unwrap(),
            "[1,((ctx) => {\n\n\na; x();\nb; x();\n})]"
        );
        assert!(without.strict_directive().is_none());
        // The directive line keeps its line break, so no generated position moves.
        assert!(!tokens(&with).is_empty());
        assert_eq!(tokens(&with), tokens(&without));
    }

    #[test]
    fn removing_strict_directive_shifts_columns_on_its_line() {
        // A minified factory: the directive and the mapped body share a line.
        let factory = factory("(e=>{", "", "a;x();x()");
        let with = compose(&factory, false);
        let without = compose(&factory, true);
        assert_eq!(
            without.source_code().to_str().unwrap(),
            "[1,(e=>{a;x();x()})]"
        );
        let shifted = tokens(&with)
            .into_iter()
            .map(|(line, col, src_line, src_col)| {
                (line, col - STRICT_DIRECTIVE.len() as u32, src_line, src_col)
            })
            .collect::<Vec<_>>();
        assert_eq!(shifted.len(), 3);
        assert_eq!(tokens(&without), shifted);
    }

    #[test]
    fn pushing_code_without_a_directive_is_unchanged() {
        let mut code = CodeBuilder::new(true, false);
        code.push_source(&"x();".to_string().into(), Some(line_map("x();")));
        let code = code.build();
        assert!(code.strict_directive().is_none());
        assert_eq!(
            compose(&code, true).source_code().to_str().unwrap(),
            compose(&code, false).source_code().to_str().unwrap()
        );
        assert_eq!(
            tokens(&compose(&code, true)),
            tokens(&compose(&code, false))
        );
    }
}
