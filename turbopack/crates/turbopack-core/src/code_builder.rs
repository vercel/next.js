mod source_map_sections;

use std::{
    cmp::min,
    io::{BufRead, Result as IoResult, Write},
    ops::{self, Range},
    sync::Arc,
};

use anyhow::{Context, Result, bail, ensure};
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use tracing::instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{FixintU128, NonLocalValue, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{
    CellRope, CellRopeBuilder, CellRopePart, File, FileContent, OptionByteRange,
    rope::{Rope, RopeBuilder},
};
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher, hash_xxh3_hash128};

use crate::{
    code_builder::source_map_sections::Mappings,
    debug_id::generate_debug_id,
    output::OutputAsset,
    source_map::{
        GenerateSourceMap, SourceMap, SourceMapAsset, SourceMapGenerationOptions, SourceMapType,
        SourceMaps, structured::StructuredSourceMap,
    },
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
pub type Mapping = (usize, SourceMaps<SectionMap>);

/// The `"use strict";` directive written by [`CodeBuilder::push_strict_directive`].
pub const STRICT_DIRECTIVE: &str = "\"use strict\";";

/// Code stores combined output code and the source map of that output code.
#[turbo_tasks::value(shared, serialization = "hash")]
#[derive(Debug, Clone, Encode, Decode)]
pub struct Code {
    code: Rope,
    mappings: Mappings,
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
/// them through a [`CellRope`] instead of persisting a copy (see [`CodeCompositionBuilder`]).
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub struct CodeCells {
    code: ResolvedVc<Rope>,
    /// The same byte offsets as [`Code`]'s mappings, with each generated map variant as a cell
    /// holding [`SectionMap::to_rope`]. A map shared by both variants stays one cell.
    mappings: Vec<(usize, SourceMaps<ResolvedVc<Rope>>)>,
    /// The map variants [`Code`]'s mappings were generated with.
    source_map_generation_options: SourceMapGenerationOptions,
    should_generate_debug_id: bool,
    /// Same as [`Code`]'s strict directive offset.
    strict_directive: Option<usize>,
    /// [`Code::strict_directive`] as a cell, so that a composition can leave the directive out of
    /// `code` without reading either (see
    /// [`CodeCompositionBuilder::push_code_cells_without_strict_directive`]).
    strict_directive_range: ResolvedVc<OptionByteRange>,
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
            .map(async |(index, maps)| {
                let maps = maps
                    .clone()
                    .try_map_async(async |map| anyhow::Ok(SectionMap::Raw(map.owned().await?)))
                    .await?;
                anyhow::Ok((*index, maps))
            })
            .try_join()
            .await?;
        Ok(Code {
            code: (*code).clone(),
            mappings: Mappings::from_parts(mappings, self.source_map_generation_options),
            should_generate_debug_id: self.should_generate_debug_id,
            strict_directive: self.strict_directive,
        }
        .cell())
    }
}

impl CodeCells {
    /// The cell holding the code's bytes.
    pub fn code(&self) -> ResolvedVc<Rope> {
        self.code
    }

    /// The cell holding the byte range of the code's strict directive, if it has one.
    pub fn strict_directive_range(&self) -> ResolvedVc<OptionByteRange> {
        self.strict_directive_range
    }
}

impl Code {
    /// Rejects variants that were not generated for every mapped section.
    pub fn validate_source_map_type(&self, ty: SourceMapType) -> Result<()> {
        let available = !self.has_source_map() || self.mappings.is_complete(ty);
        anyhow::ensure!(
            available,
            "Requested {ty:?} source map was not generated for all mapped code"
        );
        Ok(())
    }

    pub fn source_map_generation_options(&self) -> SourceMapGenerationOptions {
        SourceMapGenerationOptions {
            full: self.mappings.is_complete(SourceMapType::Full),
            shallow: self.mappings.is_complete(SourceMapType::Shallow),
            shallow_sources_content: self.mappings.is_complete(SourceMapType::Shallow),
        }
    }

    pub fn source_code(&self) -> &Rope {
        &self.code
    }

    /// Tests if any code in this Code contains an associated source map.
    pub fn has_source_map(&self) -> bool {
        self.mappings.has_source_map()
    }
    pub fn has_source_map_for(&self, ty: SourceMapType) -> bool {
        self.mappings.is_complete(ty) && self.mappings.has_source_map()
    }

    pub fn should_emit_source_map(&self, ty: Option<SourceMapType>) -> Result<bool> {
        let Some(ty) = ty else { return Ok(false) };
        self.validate_source_map_type(ty)?;
        Ok(self.has_source_map())
    }

    pub fn source_maps(&self) -> Result<SourceMaps<Rope>> {
        let full = self.has_source_map_for(SourceMapType::Full);
        let shallow = self.has_source_map_for(SourceMapType::Shallow);
        if full && shallow && self.mappings.is_shared() {
            return Ok(SourceMaps::Shared(
                self.generate_source_map_ref(None, SourceMapType::Full)?,
            ));
        }
        Ok(SourceMaps::new(
            full.then(|| self.generate_source_map_ref(None, SourceMapType::Full))
                .transpose()?,
            shallow
                .then(|| self.generate_source_map_ref(None, SourceMapType::Shallow))
                .transpose()?,
        ))
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

    /// Stores this `Code` as [`CodeCells`] in the current task: the code and each generated
    /// section map become their own persisted [`Rope`] cells.
    pub fn resolved_code_cells(self) -> ResolvedVc<CodeCells> {
        let source_map_generation_options = self.mappings.available();
        let mappings = self
            .mappings
            .mappings
            .iter()
            .map(|(index, maps)| {
                (
                    *index,
                    maps.clone().map(|map| map.to_rope().resolved_cell()),
                )
            })
            .collect();
        let strict_directive_range = OptionByteRange::new(self.strict_directive()).resolved_cell();
        CodeCells {
            code: self.code.resolved_cell(),
            mappings,
            source_map_generation_options,
            should_generate_debug_id: self.should_generate_debug_id,
            strict_directive: self.strict_directive,
            strict_directive_range,
        }
        .resolved_cell()
    }

    // Formats the code with the source map and debug id comments as
    pub async fn to_rope_with_magic_comments(
        self: Vc<Self>,
        emitted_source_map_ty: Option<SourceMapType>,
        source_map_path_fn: impl FnOnce() -> Vc<SourceMapAsset>,
    ) -> Result<Rope> {
        let code = self.await?;
        Ok(
            match self
                .magic_comments(emitted_source_map_ty, source_map_path_fn)
                .await?
            {
                Some((prefix, suffix)) => {
                    let mut rope_builder = RopeBuilder::default();
                    rope_builder.concat(&prefix);
                    rope_builder.concat(&code.code);
                    rope_builder.concat(&suffix);
                    rope_builder.build()
                }
                None => code.code.clone(),
            },
        )
    }

    /// Like [`Code::to_rope_with_magic_comments`], but for code whose bytes are described by
    /// `body` (see [`CodeComposition`]). Produces the same bytes; the result references `body`
    /// instead of copying its segments.
    pub async fn to_cell_rope_with_magic_comments(
        self: Vc<Self>,
        body: ResolvedVc<CellRope>,
        emitted_source_map_ty: Option<SourceMapType>,
        source_map_path_fn: impl FnOnce() -> Vc<SourceMapAsset>,
    ) -> Result<ResolvedVc<CellRope>> {
        Ok(
            match self
                .magic_comments(emitted_source_map_ty, source_map_path_fn)
                .await?
            {
                Some((prefix, suffix)) => {
                    let mut rope_builder = CellRopeBuilder::default();
                    rope_builder.concat(&prefix);
                    rope_builder.push_rope(body);
                    rope_builder.concat(&suffix);
                    rope_builder.build().resolved_cell()
                }
                None => body,
            },
        )
    }

    /// The bytes [`Code::to_rope_with_magic_comments`] puts before and after the code, if any.
    async fn magic_comments(
        self: Vc<Self>,
        emitted_source_map_ty: Option<SourceMapType>,
        source_map_path_fn: impl FnOnce() -> Vc<SourceMapAsset>,
    ) -> Result<Option<(Rope, Rope)>> {
        let code = self.await?;
        let emit_source_map = code.should_emit_source_map(emitted_source_map_ty)?;
        if !emit_source_map && !code.should_generate_debug_id() {
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

        if emit_source_map {
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
    mappings: Mappings,
    should_generate_debug_id: bool,
    strict_directive: Option<usize>,
}

impl CodeBuilder {
    pub fn new(
        should_generate_debug_id: bool,
        source_map_generation_options: SourceMapGenerationOptions,
    ) -> Self {
        Self {
            code: RopeBuilder::default(),
            mappings: Mappings::new(source_map_generation_options),
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
        self.mappings.push_synthetic(self.code.len());
        self.code.push_static_bytes(code);
    }

    /// Pushes original user code with an optional source map if one is
    /// available. If it's not, this is no different than pushing Synthetic
    /// code.
    ///
    /// Returns an error without appending code if a required source map variant is missing.
    pub fn push_source<M: Into<SectionMap> + NonLocalValue>(
        &mut self,
        code: &Rope,
        source_maps: SourceMaps<M>,
    ) -> Result<()> {
        self.mappings
            .push(self.code.len(), source_maps.map(Into::into))?;
        self.code += code;
        Ok(())
    }

    /// Copies the Synthetic/Original code of an already constructed Code into
    /// this instance.
    ///
    /// This adjusts the source map to be relative to the new code object
    ///
    /// Returns an error without appending code if a required source map variant is missing.
    pub fn push_code(&mut self, prebuilt: &Code) -> Result<()> {
        self.mappings.append(self.code.len(), &prebuilt.mappings)?;
        self.code += &prebuilt.code;
        Ok(())
    }

    /// Like [`CodeBuilder::push_code`], but leaves out the code's recorded `"use strict"`
    /// directive (see [`CodeBuilder::push_strict_directive`]), if it has one. Use it only where
    /// the code is placed in a strict context by other means.
    ///
    /// The directive is its own unmapped section, so this only drops its bytes and moves the
    /// following sections up; no section map has to be rewritten.
    pub fn push_code_without_strict_directive(&mut self, prebuilt: &Code) -> Result<()> {
        let Some(directive) = prebuilt.strict_directive() else {
            return self.push_code(prebuilt);
        };
        debug_assert!(
            prebuilt
                .mappings
                .mappings
                .iter()
                .all(|(index, map)| !directive.contains(index) || matches!(map, SourceMaps::None)),
            "a strict directive must be unmapped"
        );
        let removed = directive.len();
        // Mappings starting inside the directive only end the preceding section, which the
        // section after the directive does as well, so they are dropped.
        let mut mappings = prebuilt.mappings.clone();
        mappings.mappings = Arc::new(
            prebuilt
                .mappings
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
                .collect(),
        );
        self.push_code(&Code {
            code: prebuilt.code.skip(directive),
            mappings,
            should_generate_debug_id: prebuilt.should_generate_debug_id,
            strict_directive: None,
        })
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
            mappings: self.mappings,
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
        self.mappings.push_synthetic(self.code.len());
        self.code.write(bytes)
    }

    fn flush(&mut self) -> IoResult<()> {
        self.code.flush()
    }
}

impl From<Code> for CodeBuilder {
    fn from(code: Code) -> Self {
        let mut builder = Self {
            code: RopeBuilder::default(),
            mappings: code.mappings,
            should_generate_debug_id: code.should_generate_debug_id,
            strict_directive: None,
        };
        builder.code += &code.code;
        builder
    }
}

/// Describes code composed of inline scaffolding and pieces stored as [`CodeCells`], without
/// reading the pieces' bytes. Builds a [`CodeComposition`].
///
/// This is meant to be used by a task that depends only on the composition's structure (which
/// pieces, in which order, and the scaffolding between them), so that a change to a piece's bytes
/// doesn't re-execute it, and the persisted body [`CellRope`] isn't rewritten. Everything derived
/// from the bytes (the flat [`Code`], its hash, source map offsets) is computed by
/// [`CodeComposition::build_code`] and [`CodeComposition::generate_source_map`], in the tasks that
/// read them.
pub struct CodeCompositionBuilder {
    body: CellRopeBuilder,
    items: Vec<ResolvedVc<CodeCells>>,
    should_generate_debug_id: bool,
    source_map_generation_options: SourceMapGenerationOptions,
}

impl CodeCompositionBuilder {
    /// Takes the same arguments as [`CodeBuilder::new`].
    pub fn new(
        should_generate_debug_id: bool,
        source_map_generation_options: SourceMapGenerationOptions,
    ) -> Self {
        Self {
            body: CellRopeBuilder::default(),
            items: Vec::new(),
            should_generate_debug_id,
            source_map_generation_options,
        }
    }

    /// Appends the code stored in `cells`, whose bytes are in `code` (see [`CodeCells::code`]), by
    /// reference. Reads neither.
    ///
    /// Takes the code cell separately so that callers can depend on just that reference: the
    /// `CodeCells` value itself changes with the code's length (its mappings are byte offsets).
    pub fn push_code_cells(&mut self, cells: ResolvedVc<CodeCells>, code: ResolvedVc<Rope>) {
        self.body.push_cell(code);
        self.items.push(cells);
    }

    /// Like [`CodeCompositionBuilder::push_code_cells`], but leaves out the code's strict
    /// directive, like [`CodeBuilder::push_code_without_strict_directive`]. `strict_directive` is
    /// [`CodeCells::strict_directive_range`]; it's applied when the composition is read, so this
    /// reads none of the cells either, and the composition doesn't depend on where the directive
    /// is.
    pub fn push_code_cells_without_strict_directive(
        &mut self,
        cells: ResolvedVc<CodeCells>,
        code: ResolvedVc<Rope>,
        strict_directive: ResolvedVc<OptionByteRange>,
    ) {
        self.body.push_cell_skipping(code, strict_directive);
        self.items.push(cells);
    }

    pub fn build(self) -> CodeComposition {
        CodeComposition {
            body: self.body.build().resolved_cell(),
            items: self.items,
            should_generate_debug_id: self.should_generate_debug_id,
            source_map_generation_options: self.source_map_generation_options,
        }
    }
}

impl ops::AddAssign<&'static str> for CodeCompositionBuilder {
    fn add_assign(&mut self, rhs: &'static str) {
        self.body += rhs;
    }
}

impl Write for CodeCompositionBuilder {
    fn write(&mut self, bytes: &[u8]) -> IoResult<usize> {
        self.body.write_all(bytes)?;
        Ok(bytes.len())
    }

    fn flush(&mut self) -> IoResult<()> {
        Ok(())
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
        ty: SourceMapType,
    ) -> Result<Vc<FileContent>> {
        let debug_id = self.debug_id().owned().await?;
        Ok(FileContent::Content(File::from(
            self.await?.generate_source_map_ref(debug_id, ty)?,
        ))
        .cell())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionDebugId(Option<RcStr>);

#[turbo_tasks::value_impl]
impl Code {
    /// Returns the hash of the source code of this Code.
    #[turbo_tasks::function]
    pub fn source_code_hash(&self) -> Vc<FixintU128> {
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
    pub fn generate_source_map_ref(
        &self,
        debug_id: Option<RcStr>,
        ty: SourceMapType,
    ) -> Result<Rope> {
        self.validate_source_map_type(ty)?;
        // A debug id should be passed only if the code should generate a debug id, it is however
        // allowed to turn it off to access intermediate states of the code (e.g. for minification)
        debug_assert!(debug_id.is_none() || self.should_generate_debug_id);
        let sections = self
            .source_map_sections(debug_id.is_some(), ty)
            .into_iter()
            .map(|(pos, section)| {
                let map = match section {
                    Some(index) => self.mappings.mappings[index]
                        .1
                        .get(ty)
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
            Ok(sections.into_iter().next().unwrap().1)
        } else {
            Ok(SourceMap::sections_to_rope(sections, debug_id))
        }
    }

    /// The sections of this code's `ty` source map: where each starts, and the index of its
    /// mapping (`None` for an empty map that ends the previous section).
    fn source_map_sections(
        &self,
        has_debug_id: bool,
        ty: SourceMapType,
    ) -> Vec<(SourcePos, Option<usize>)> {
        // If there is a debug id the first line will be modifying the global object. see
        // `[to_rope_with_magic_comments]` for more details.
        let mut pos = SourcePos::new(if has_debug_id { 1 } else { 0 });

        let mut last_byte_pos = 0;

        let mappings = &self.mappings.mappings;
        let mut sections = Vec::with_capacity(mappings.len());
        let mut read = self.code.read();
        for (index, (byte_pos, maps)) in mappings.iter().enumerate() {
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

            if maps.get(ty).is_some() {
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

/// The structure of code composed from inline scaffolding and pieces stored as [`CodeCells`]: a
/// body [`CellRope`] referencing the pieces' code cells, and the pieces themselves (one per cell
/// segment of the body, in order). Built by [`CodeCompositionBuilder`].
///
/// Nothing in it is derived from the pieces' bytes, so it stays equal when only the bytes change.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct CodeComposition {
    body: ResolvedVc<CellRope>,
    items: Vec<ResolvedVc<CodeCells>>,
    should_generate_debug_id: bool,
    source_map_generation_options: SourceMapGenerationOptions,
}

impl CodeComposition {
    /// The composed bytes, as a [`CellRope`] referencing the pieces' code cells.
    pub fn body(&self) -> ResolvedVc<CellRope> {
        self.body
    }

    /// Reads the pieces and builds the flat [`Code`], with the same bytes and mappings as
    /// building it with a [`CodeBuilder`] from the same scaffolding and pieces.
    pub async fn build_code(&self) -> Result<Code> {
        let body = self.body.await?;
        let pieces = self
            .items
            .iter()
            .map(|cells| cells.to_code())
            .try_join()
            .await?;
        let mut pieces = pieces.iter();
        let mut code = CodeBuilder::new(
            self.should_generate_debug_id,
            self.source_map_generation_options,
        );
        for part in body.parts() {
            match part {
                CellRopePart::Inline(bytes) => {
                    code.push_source(&bytes, SourceMaps::<SectionMap>::None)?
                }
                CellRopePart::Cell { skip, .. } => {
                    let piece = pieces
                        .next()
                        .context("a composition has one piece per cell segment")?;
                    match skip {
                        None => code.push_code(piece)?,
                        Some(skip) => {
                            // The body leaves out the range the cell holds; it's the piece's
                            // directive by construction, which this removes from the mappings.
                            ensure!(
                                skip.await?.range() == piece.strict_directive(),
                                "a skipped range must be the piece's strict directive"
                            );
                            code.push_code_without_strict_directive(piece)?
                        }
                    }
                }
                CellRopePart::Nested(_) => bail!("a composition body doesn't nest ropes"),
            }
        }
        Ok(code.build())
    }

    /// Generates the `ty` source map for `code` (which must be [`CodeComposition::build_code`]'s
    /// result) as a [`CellRope`]. Produces the same bytes as [`Code::generate_source_map_ref`]
    /// (and fails the same way if `ty` wasn't generated), with the pieces' section maps referenced
    /// instead of copied.
    pub async fn generate_source_map(
        &self,
        code: &Code,
        debug_id: Option<RcStr>,
        ty: SourceMapType,
    ) -> Result<CellRope> {
        code.validate_source_map_type(ty)?;
        let map_cells = self.map_cells().await?;
        let sections = code
            .source_map_sections(debug_id.is_some(), ty)
            .into_iter()
            .map(|(pos, section)| {
                let section = match section {
                    Some(index) => {
                        let (byte_pos, maps) = &code.mappings.mappings[index];
                        match map_cells.get(byte_pos).and_then(|cells| cells.get(ty)) {
                            Some(cell) => ComposedSection::Cell(*cell),
                            None => ComposedSection::Inline(
                                maps.get(ty).expect("sections only refer to maps").to_rope(),
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
        Ok(rope.build())
    }

    /// The pieces' section maps that are cells (every generated variant), by their byte offset in
    /// the built code. Reads the pieces' bytes to compute the offsets.
    async fn map_cells(&self) -> Result<FxHashMap<usize, SourceMaps<ResolvedVc<Rope>>>> {
        let mut map_cells = FxHashMap::default();
        let options = self.source_map_generation_options;
        if !options.full && !options.shallow {
            return Ok(map_cells);
        }
        let body = self.body.await?;
        let pieces = self
            .items
            .iter()
            .map(async |cells| {
                let cells = cells.await?;
                let len = cells.code.await?.len();
                anyhow::Ok((cells, len))
            })
            .try_join()
            .await?;
        let mut pieces = pieces.iter();
        let mut offset = 0;
        for part in body.parts() {
            match part {
                CellRopePart::Inline(bytes) => offset += bytes.len(),
                CellRopePart::Cell { skip, .. } => {
                    let (cells, len) = pieces
                        .next()
                        .context("a composition has one piece per cell segment")?;
                    // Mirrors `CodeBuilder::push_code_without_strict_directive`.
                    let directive = if skip.is_some() {
                        cells
                            .strict_directive
                            .map(|start| start..start + STRICT_DIRECTIVE.len())
                    } else {
                        None
                    };
                    for (index, maps) in &cells.mappings {
                        let index = match &directive {
                            Some(directive) if directive.contains(index) => continue,
                            Some(directive) if *index >= directive.end => index - directive.len(),
                            _ => *index,
                        };
                        if !matches!(maps, SourceMaps::None) {
                            map_cells.insert(offset + index, maps.clone());
                        }
                    }
                    offset += len - directive.map_or(0, |directive| directive.len());
                }
                CellRopePart::Nested(_) => bail!("a composition body doesn't nest ropes"),
            }
        }
        Ok(map_cells)
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
/// [`CodeComposition`] describing them. Output files built from it reference those cells
/// instead of persisting copies (see `turbo_tasks_fs::File::from_cell_rope`).
#[turbo_tasks::value(shared)]
pub struct ComposedCode {
    code: ResolvedVc<Code>,
    composition: Option<ResolvedVc<CodeComposition>>,
}

impl ComposedCode {
    /// `code` must be `composition`'s [`CodeComposition::build_code`], or `composition` must be
    /// `None` if `code` was transformed afterwards (e.g. minified as a whole).
    pub fn new(code: Code, composition: Option<ResolvedVc<CodeComposition>>) -> Self {
        ComposedCode {
            code: code.resolved_cell(),
            composition,
        }
    }

    pub fn code(&self) -> Vc<Code> {
        *self.code
    }

    /// The output file: the code with its source map and debug id comments. Same bytes as
    /// [`Code::to_rope_with_magic_comments`].
    pub async fn to_file_with_magic_comments(
        &self,
        emitted_source_map_ty: Option<SourceMapType>,
        source_map_path_fn: impl FnOnce() -> Vc<SourceMapAsset>,
    ) -> Result<File> {
        match self.composition {
            Some(composition) => {
                let rope = self
                    .code
                    .to_cell_rope_with_magic_comments(
                        composition.await?.body(),
                        emitted_source_map_ty,
                        source_map_path_fn,
                    )
                    .await?;
                File::from_cell_rope(rope).await
            }
            None => Ok(File::from(
                self.code
                    .to_rope_with_magic_comments(emitted_source_map_ty, source_map_path_fn)
                    .await?,
            )),
        }
    }

    /// The `ty` source map file. Same bytes as [`Code::generate_source_map`].
    pub async fn source_map_file_content(&self, ty: SourceMapType) -> Result<Vc<FileContent>> {
        Ok(match self.composition {
            Some(composition) => {
                let debug_id = self.code.debug_id().owned().await?;
                let rope = composition
                    .await?
                    .generate_source_map(&*self.code.await?, debug_id, ty)
                    .await?;
                FileContent::Content(File::from_cell_rope(rope.resolved_cell()).await?).cell()
            }
            None => self.code.generate_source_map(ty),
        })
    }
}
#[cfg(test)]
mod tests {
    use serde_json::Value;
    use swc_sourcemap::{DecodedMap, SourceMapBuilder};
    use turbo_tasks_fs::rope::Rope;

    use super::*;

    const BOTH: SourceMapGenerationOptions = SourceMapGenerationOptions {
        full: true,
        shallow: true,
        shallow_sources_content: true,
    };

    const SECTION_MAP: &str = r#"{"version":3,"sources":["a.js"],"names":[],"mappings":"AAAA"}"#;

    fn section_offsets(code: &Code) -> Vec<(u64, u64)> {
        let map = code
            .generate_source_map_ref(None, SourceMapType::Full)
            .unwrap();
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
        let mut builder = CodeBuilder::new(false, BOTH);
        // `🦀` is a 4-byte UTF-8 sequence and two UTF-16 code units, `é` is a single unit.
        let prefix = "line0\n\"🦀é\"; ";
        builder += prefix;
        builder
            .push_source(
                &Rope::from("mapped();".to_string()),
                SourceMaps::Shared(Rope::from(SECTION_MAP.to_string())),
            )
            .unwrap();
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
        let map = match swc_sourcemap::decode_slice(
            &code
                .generate_source_map_ref(None, SourceMapType::Full)
                .unwrap()
                .to_bytes(),
        )
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
        let mut code = CodeBuilder::new(false, BOTH);
        code += head;
        code.push_strict_directive();
        code += gap;
        code.push_source(&body.to_string().into(), SourceMaps::Shared(line_map(body)))
            .unwrap();
        code += "})";
        code.build()
    }

    fn compose(factory: &Code, without_directive: bool) -> Code {
        let mut code = CodeBuilder::new(false, factory.source_map_generation_options());
        code += "[1,";
        if without_directive {
            code.push_code_without_strict_directive(factory).unwrap();
        } else {
            code.push_code(factory).unwrap();
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
        let mut code = CodeBuilder::new(false, BOTH);
        code.push_source(
            &"x();".to_string().into(),
            SourceMaps::Shared(line_map("x();")),
        )
        .unwrap();
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

#[cfg(test)]
mod composition_tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use anyhow::{Result, ensure};
    use turbo_rcstr::RcStr;
    use turbo_tasks::{ReadRef, ResolvedVc, State, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::*;

    #[turbo_tasks::value]
    struct Text {
        text: State<RcStr>,
    }

    #[turbo_tasks::function(operation, root)]
    fn text_operation() -> Vc<Text> {
        Text {
            text: State::new("one".into()),
        }
        .cell()
    }

    /// Code like a module factory: fixed scaffolding around a source with its own map.
    fn piece_code(text: &str) -> Code {
        let mut code = CodeBuilder::new(false, SourceMapGenerationOptions::default());
        code += "(()=>{";
        let map =
            format!(r#"{{"version":3,"sources":["{text}.js"],"names":[],"mappings":"AAAA"}}"#);
        code.push_source(
            &Rope::from(text.to_string()),
            SourceMaps::Full(Rope::from(map)),
        )
        .unwrap();
        code += "})";
        code.build()
    }

    #[turbo_tasks::function]
    async fn edited_piece(text: ResolvedVc<Text>) -> Result<Vc<CodeCells>> {
        let text = text.await?.text.get().clone();
        Ok(*piece_code(&text).resolved_code_cells())
    }

    #[turbo_tasks::function]
    fn fixed_piece() -> Vc<CodeCells> {
        *piece_code("fixed").resolved_code_cells()
    }

    /// What a chunk item's entry exposes to the composition: references only.
    #[turbo_tasks::value(shared)]
    struct PieceRef {
        cells: ResolvedVc<CodeCells>,
        code: ResolvedVc<Rope>,
    }

    #[turbo_tasks::function]
    async fn piece_ref(cells: ResolvedVc<CodeCells>) -> Result<Vc<PieceRef>> {
        Ok(PieceRef {
            cells,
            code: cells.await?.code(),
        }
        .cell())
    }

    static COMPOSITION_EXECUTIONS: AtomicUsize = AtomicUsize::new(0);

    /// The structure-only task: `[<edited>,<fixed>]`.
    #[turbo_tasks::function]
    async fn composition(text: ResolvedVc<Text>) -> Result<Vc<CodeComposition>> {
        COMPOSITION_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
        let mut builder = CodeCompositionBuilder::new(false, SourceMapGenerationOptions::default());
        builder += "[";
        let edited = piece_ref(edited_piece(*text)).await?;
        builder.push_code_cells(edited.cells, edited.code);
        builder += ",";
        let fixed = piece_ref(fixed_piece()).await?;
        builder.push_code_cells(fixed.cells, fixed.code);
        builder += "]";
        Ok(builder.build().cell())
    }

    #[turbo_tasks::value(shared, serialization = "skip")]
    struct Output {
        code: RcStr,
        map: RcStr,
        /// How many section maps the source map references as cells instead of copying them.
        map_cells: usize,
        body: ReadRef<CellRope>,
    }

    /// Reads the composition like a chunk's content does, and checks it against building the
    /// same pieces with a `CodeBuilder`.
    #[turbo_tasks::function(operation, root)]
    async fn output_operation(text: ResolvedVc<Text>) -> Result<Vc<Output>> {
        let composition = composition(*text).await?;
        let code = composition.build_code().await?;
        let map_rope = composition
            .generate_source_map(&code, None, SourceMapType::Full)
            .await?;
        let map_cells = map_rope.cell_count();
        let map = map_rope.read().await?;

        let mut flat = CodeBuilder::new(false, SourceMapGenerationOptions::default());
        flat += "[";
        flat.push_code(&*edited_piece(*text).to_code().await?)?;
        flat += ",";
        flat.push_code(&*fixed_piece().to_code().await?)?;
        flat += "]";
        let flat = flat.build();
        ensure!(code.source_code() == flat.source_code(), "code differs");
        ensure!(
            map == flat.generate_source_map_ref(None, SourceMapType::Full)?,
            "source map differs"
        );
        ensure!(
            composition.body().await?.read().await? == *code.source_code(),
            "body differs from the built code"
        );
        Ok(Output {
            code: code.source_code().to_str()?.into(),
            map: map.to_str()?.into(),
            map_cells,
            body: composition.body().await?,
        }
        .cell())
    }

    /// The point of a structure-only composition: changing a piece's bytes (here also its length,
    /// which changes its `CodeCells` mappings) updates the output without re-executing the
    /// composition, so its persisted body isn't rewritten.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn piece_edits_dont_recompose() {
        turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ))
        .run_once(async {
            let text_op = text_operation();
            let text = text_op.resolve().strongly_consistent().await?;
            let output = output_operation(text);
            let before = output.read_strongly_consistent().await?;
            assert_eq!(before.code.as_str(), "[(()=>{one}),(()=>{fixed})]");
            assert!(before.map.contains("one.js") && before.map.contains("fixed.js"));
            let executions = COMPOSITION_EXECUTIONS.load(Ordering::SeqCst);

            text_op
                .read_strongly_consistent()
                .await?
                .text
                .set("a longer text".into());

            let after = output.read_strongly_consistent().await?;
            assert_eq!(after.code.as_str(), "[(()=>{a longer text}),(()=>{fixed})]");
            assert!(after.map.contains("a longer text.js"));
            assert_eq!(
                COMPOSITION_EXECUTIONS.load(Ordering::SeqCst),
                executions,
                "the composition must not re-execute"
            );
            assert_eq!(before.body, after.body);
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// A strict piece: its directive's offset depends on `text`, like a factory's parameter list
    /// before its directive.
    fn strict_piece_code(text: &str) -> Code {
        let mut code = CodeBuilder::new(false, SourceMapGenerationOptions::default());
        code.push_source(
            &Rope::from(format!("(({text})=>{{")),
            SourceMaps::<SectionMap>::None,
        )
        .unwrap();
        code.push_strict_directive();
        let map = r#"{"version":3,"sources":["body.js"],"names":[],"mappings":"AAAA,EAAE"}"#;
        code.push_source(
            &Rope::from("x();y()".to_string()),
            SourceMaps::Full(Rope::from(map)),
        )
        .unwrap();
        code += "})";
        code.build()
    }

    #[turbo_tasks::function]
    async fn edited_strict_piece(text: ResolvedVc<Text>) -> Result<Vc<CodeCells>> {
        let text = text.await?.text.get().clone();
        Ok(*strict_piece_code(&text).resolved_code_cells())
    }

    #[turbo_tasks::function]
    fn fixed_strict_piece() -> Vc<CodeCells> {
        *strict_piece_code("fixed").resolved_code_cells()
    }

    /// What a chunk item's entry exposes for a strict factory: references only.
    #[turbo_tasks::value(shared)]
    struct StrictPieceRef {
        cells: ResolvedVc<CodeCells>,
        code: ResolvedVc<Rope>,
        strict_directive: ResolvedVc<OptionByteRange>,
    }

    #[turbo_tasks::function]
    async fn strict_piece_ref(cells: ResolvedVc<CodeCells>) -> Result<Vc<StrictPieceRef>> {
        let value = cells.await?;
        Ok(StrictPieceRef {
            cells,
            code: value.code(),
            strict_directive: value.strict_directive_range(),
        }
        .cell())
    }

    static STRICT_COMPOSITION_EXECUTIONS: AtomicUsize = AtomicUsize::new(0);

    /// `[<edited without directive>,<fixed with directive>,<fixed without directive>]`.
    #[turbo_tasks::function]
    async fn strict_composition(text: ResolvedVc<Text>) -> Result<Vc<CodeComposition>> {
        STRICT_COMPOSITION_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
        let mut builder = CodeCompositionBuilder::new(false, SourceMapGenerationOptions::default());
        builder += "[";
        let edited = strict_piece_ref(edited_strict_piece(*text)).await?;
        builder.push_code_cells_without_strict_directive(
            edited.cells,
            edited.code,
            edited.strict_directive,
        );
        builder += ",";
        let fixed = strict_piece_ref(fixed_strict_piece()).await?;
        builder.push_code_cells(fixed.cells, fixed.code);
        builder += ",";
        builder.push_code_cells_without_strict_directive(
            fixed.cells,
            fixed.code,
            fixed.strict_directive,
        );
        builder += "]";
        Ok(builder.build().cell())
    }

    /// Like `output_operation`, for the strict composition: checks it against building the same
    /// pieces with a `CodeBuilder`, which removes the directives itself.
    #[turbo_tasks::function(operation, root)]
    async fn strict_output_operation(text: ResolvedVc<Text>) -> Result<Vc<Output>> {
        let composition = strict_composition(*text).await?;
        let code = composition.build_code().await?;
        let map_rope = composition
            .generate_source_map(&code, None, SourceMapType::Full)
            .await?;
        let map_cells = map_rope.cell_count();
        let map = map_rope.read().await?;

        let edited = edited_strict_piece(*text).to_code().await?;
        let fixed = fixed_strict_piece().to_code().await?;
        let mut flat = CodeBuilder::new(false, SourceMapGenerationOptions::default());
        flat += "[";
        flat.push_code_without_strict_directive(&edited)?;
        flat += ",";
        flat.push_code(&fixed)?;
        flat += ",";
        flat.push_code_without_strict_directive(&fixed)?;
        flat += "]";
        let flat = flat.build();
        ensure!(code.source_code() == flat.source_code(), "code differs");
        ensure!(code.mappings == flat.mappings, "mappings differ");
        ensure!(
            map == flat.generate_source_map_ref(None, SourceMapType::Full)?,
            "source map differs"
        );
        ensure!(
            composition.body().await?.read().await? == *code.source_code(),
            "body differs from the built code"
        );
        Ok(Output {
            code: code.source_code().to_str()?.into(),
            map: map.to_str()?.into(),
            map_cells,
            body: composition.body().await?,
        }
        .cell())
    }

    /// Strict directives are left out when the composition is read, so moving a piece's
    /// directive (by editing the code before it) doesn't re-execute the composition either.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn skipped_directives_follow_piece_edits_without_recomposing() {
        turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ))
        .run_once(async {
            let text_op = text_operation();
            let text = text_op.resolve().strongly_consistent().await?;
            let output = strict_output_operation(text);
            let before = output.read_strongly_consistent().await?;
            assert_eq!(
                before.code.as_str(),
                r#"[((one)=>{x();y()}),((fixed)=>{"use strict";x();y()}),((fixed)=>{x();y()})]"#
            );
            assert!(before.map.contains("body.js"));
            // Every piece's map is referenced, at its offset after the skipped directives.
            assert_eq!(before.map_cells, 3);
            let executions = STRICT_COMPOSITION_EXECUTIONS.load(Ordering::SeqCst);

            text_op
                .read_strongly_consistent()
                .await?
                .text
                .set("a, longer, list".into());

            let after = output.read_strongly_consistent().await?;
            assert_eq!(
                after.code.as_str(),
                r#"[((a, longer, list)=>{x();y()}),((fixed)=>{"use strict";x();y()}),((fixed)=>{x();y()})]"#
            );
            assert_eq!(
                STRICT_COMPOSITION_EXECUTIONS.load(Ordering::SeqCst),
                executions,
                "the composition must not re-execute"
            );
            assert_eq!(before.body, after.body);
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }
}

#[cfg(test)]
mod variant_tests {
    use anyhow::{Context, Result, ensure};
    use turbo_rcstr::RcStr;
    use turbo_tasks::{ResolvedVc, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::*;

    const BOTH: SourceMapGenerationOptions = SourceMapGenerationOptions {
        full: true,
        shallow: true,
        shallow_sources_content: true,
    };

    fn map(source: &str) -> Rope {
        Rope::from(format!(
            r#"{{"version":3,"sources":["{source}"],"names":[],"mappings":"AAAA"}}"#
        ))
    }

    /// Which variants a piece's section map comes in.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum Variants {
        Full,
        Shallow,
        Both,
        Shared,
    }

    impl Variants {
        fn options(self) -> SourceMapGenerationOptions {
            match self {
                Variants::Full => SourceMapGenerationOptions::default(),
                Variants::Shallow => SourceMapGenerationOptions {
                    full: false,
                    shallow: true,
                    shallow_sources_content: true,
                },
                Variants::Both | Variants::Shared => BOTH,
            }
        }

        fn maps(self, name: &str) -> SourceMaps<Rope> {
            let full = map(&format!("{name}.full.js"));
            let shallow = map(&format!("{name}.shallow.js"));
            match self {
                Variants::Full => SourceMaps::Full(full),
                Variants::Shallow => SourceMaps::Shallow(shallow),
                Variants::Both => SourceMaps::Both { full, shallow },
                Variants::Shared => SourceMaps::Shared(map(&format!("{name}.shared.js"))),
            }
        }

        fn types(self) -> &'static [SourceMapType] {
            match self {
                Variants::Full => &[SourceMapType::Full],
                Variants::Shallow => &[SourceMapType::Shallow],
                Variants::Both | Variants::Shared => &[SourceMapType::Full, SourceMapType::Shallow],
            }
        }

        fn missing(self) -> Option<SourceMapType> {
            match self {
                Variants::Full => Some(SourceMapType::Shallow),
                Variants::Shallow => Some(SourceMapType::Full),
                Variants::Both | Variants::Shared => None,
            }
        }
    }

    const ALL: [Variants; 4] = [
        Variants::Full,
        Variants::Shallow,
        Variants::Both,
        Variants::Shared,
    ];

    /// A factory-like piece with a synthetic head and tail around a mapped body.
    fn piece(variants: Variants, name: &str, debug_id: bool) -> Code {
        let mut code = CodeBuilder::new(debug_id, variants.options());
        code += "(()=>{\n";
        code.push_source(&Rope::from(format!("{name}();")), variants.maps(name))
            .unwrap();
        code += "\n})";
        code.build()
    }

    #[turbo_tasks::function]
    fn piece_cells(variants: usize, name: RcStr) -> Vc<CodeCells> {
        *piece(ALL[variants], &name, false).resolved_code_cells()
    }

    #[turbo_tasks::value(shared, serialization = "skip")]
    struct Checked {
        /// Distinct map cells referenced by each piece's persisted mappings.
        cells_per_piece: Vec<usize>,
    }

    #[turbo_tasks::function(operation, root)]
    async fn check_operation(variants_index: usize, debug_id: bool) -> Result<Vc<Checked>> {
        let variants = ALL[variants_index];
        let names = ["a", "b"];
        let mut cells_per_piece = Vec::new();
        let mut composition = CodeCompositionBuilder::new(debug_id, variants.options());
        let mut flat = CodeBuilder::new(debug_id, variants.options());
        composition += "[";
        flat += "[";
        for (i, name) in names.iter().enumerate() {
            if i > 0 {
                composition += ",";
                flat += ",";
            }
            let cells_vc: ResolvedVc<CodeCells> = piece_cells(variants_index, (*name).into())
                .to_resolved()
                .await?;
            let cells = cells_vc.await?;
            let mut distinct = cells
                .mappings
                .iter()
                .flat_map(|(_, maps)| match maps {
                    SourceMaps::None => vec![],
                    SourceMaps::Full(m) | SourceMaps::Shallow(m) | SourceMaps::Shared(m) => {
                        vec![*m]
                    }
                    SourceMaps::Both { full, shallow } => vec![*full, *shallow],
                })
                .collect::<Vec<_>>();
            distinct.dedup();
            cells_per_piece.push(distinct.len());

            // Restoring from cells is lossless.
            let original = piece(variants, name, false);
            let restored = cells_vc.to_code().await?;
            ensure!(restored.source_code() == original.source_code(), "code");
            ensure!(
                restored.mappings == original.mappings,
                "mappings or availability"
            );
            ensure!(
                restored.source_map_generation_options()
                    == original.source_map_generation_options(),
                "generation options"
            );

            composition.push_code_cells(cells_vc, cells.code());
            flat.push_code(&restored)?;
        }
        composition += "]";
        flat += "]";
        let composition = composition.build();
        let code = composition.build_code().await?;
        let flat = flat.build();
        ensure!(
            code.source_code() == flat.source_code(),
            "composed code differs"
        );
        ensure!(code.mappings == flat.mappings, "composed mappings differ");
        let debug_id = debug_id.then(|| generate_debug_id(code.source_code()));
        for &ty in variants.types() {
            let composed = composition
                .generate_source_map(&code, debug_id.clone(), ty)
                .await?;
            ensure!(
                composed.cell_count() == names.len(),
                "{ty:?} maps are referenced"
            );
            ensure!(
                composed.read().await? == flat.generate_source_map_ref(debug_id.clone(), ty)?,
                "{ty:?} composed map differs"
            );
        }
        if let Some(ty) = variants.missing() {
            ensure!(
                composition
                    .generate_source_map(&code, debug_id.clone(), ty)
                    .await
                    .is_err()
                    && flat.generate_source_map_ref(debug_id.clone(), ty).is_err(),
                "a missing {ty:?} variant must fail in both"
            );
        }
        Ok(Checked { cells_per_piece }.cell())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn every_variant_survives_cells_and_composition() {
        turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ))
        .run_once(async {
            for (index, variants) in ALL.into_iter().enumerate() {
                for debug_id in [false, true] {
                    let checked = check_operation(index, debug_id)
                        .read_strongly_consistent()
                        .await
                        .with_context(|| format!("{variants:?} debug_id={debug_id}"))?;
                    let expected = if variants == Variants::Both { 2 } else { 1 };
                    assert_eq!(
                        checked.cells_per_piece,
                        vec![expected; 2],
                        "{variants:?}: a shared map must stay one cell"
                    );
                }
            }
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// Code generated with source maps but emitted without: no `sourceMappingURL`, and the maps
    /// stay available for other consumers.
    #[test]
    fn unemitted_maps_stay_available() {
        let code = piece(Variants::Both, "a", false);
        assert!(!code.should_emit_source_map(None).unwrap());
        assert!(code.has_source_map_for(SourceMapType::Full));
        assert!(code.has_source_map_for(SourceMapType::Shallow));
        assert!(
            code.should_emit_source_map(Some(SourceMapType::Shallow))
                .unwrap()
        );
        let only_full = piece(Variants::Full, "a", false);
        assert!(
            only_full
                .should_emit_source_map(Some(SourceMapType::Shallow))
                .is_err()
        );
    }
}
