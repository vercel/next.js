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
        SourceMaps,
        structured::{StructuredSourceMap, null_contents},
    },
    source_pos::SourcePos,
};

/// A per-section source map: either an opaque serialized map or a structured one whose
/// `sourcesContent` is shared rather than copied when the section is embedded.
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub enum SectionMap {
    Raw(Rope),
    Structured(Box<StructuredSourceMap>),
    /// A map split by [`StructuredSourceMap::split`] (see
    /// [`SplitSourceMap`](crate::source_map::structured::SplitSourceMap)): `head`, possibly
    /// with rewritten `sources`, followed by the tail: the `sourcesContent` part (if stored on
    /// its own) and the rest.
    ///
    /// Stored as [`CodeCells`], the section map references the tail's parts instead of copying
    /// their bytes, see [`Code::resolved_code_cells`] and [`SharedMapPart`].
    Split {
        head: Box<StructuredSourceMap>,
        contents: Option<SharedMapPart>,
        rest: SharedMapPart,
    },
    /// A map whose `sourcesContent` is another map's (see
    /// [`StructuredSourceMap::with_shared_contents`]): `prefix` (the opening `{` and the head
    /// fields), the shared contents, then `suffix` (the remaining fields and the closing `}`).
    ///
    /// E.g. a minified factory's map: the minifier keeps the sources but recomputes everything
    /// else, so it can run without the contents and reference the unminified map's instead.
    SharedContents {
        prefix: Rope,
        contents: SharedMapPart,
        suffix: Rope,
    },
}

/// Part of a serialized source map that is held by a [`CellRope`] cell, along with the bytes it
/// currently reads as. The bytes are what synchronous code uses, the cell is what is persisted
/// (see [`Code::resolved_code_cells`]).
///
/// A `sourcesContent` part whose entries are all references to the sources' files (or `null`)
/// holds no text of its own, only small JSON scaffolding. Maps sharing such a part copy its
/// segments instead of referencing its cell: reading them then only needs the files' escaped
/// content, not the task owning the part (which would load everything else that task stores).
/// A part holding inline text is referenced, so the text isn't copied.
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub struct SharedMapPart {
    cell: ResolvedVc<CellRope>,
    /// The part's segments, if it holds no text of its own (see above).
    reference_only: Option<CellRope>,
    bytes: Rope,
    /// For a `sourcesContent` part, its number of entries (one per source); 0 otherwise.
    entries: u32,
}

impl SharedMapPart {
    /// Reads a part that isn't a `sourcesContent` part.
    pub async fn read(cell: ResolvedVc<CellRope>) -> Result<Self> {
        Ok(SharedMapPart {
            cell,
            reference_only: None,
            bytes: cell.await?.read().await?,
            entries: 0,
        })
    }

    /// Reads a `sourcesContent` part (`,"sourcesContent":[...]`) with `entries` entries.
    /// `reference_only` says whether every entry is a file reference or `null` (see above). The
    /// part's creator knows both, so they don't have to be recovered from its bytes.
    pub async fn read_contents(
        cell: ResolvedVc<CellRope>,
        entries: u32,
        reference_only: bool,
    ) -> Result<Self> {
        let rope = cell.await?;
        Ok(SharedMapPart {
            cell,
            bytes: rope.read().await?,
            reference_only: reference_only.then(|| (*rope).clone()),
            entries,
        })
    }

    /// For a `sourcesContent` part, the number of entries (one per source).
    pub fn entries(&self) -> u32 {
        self.entries
    }

    /// Appends the part to `builder`: its segments if it holds no text of its own, otherwise a
    /// reference to its cell.
    fn append_to(&self, builder: &mut CellRopeBuilder) {
        match &self.reference_only {
            Some(segments) => builder.append(segments),
            None => builder.push_rope(self.cell),
        }
    }

    pub fn cell(&self) -> ResolvedVc<CellRope> {
        self.cell
    }

    pub fn bytes(&self) -> &Rope {
        &self.bytes
    }
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
            SectionMap::Split { .. } | SectionMap::SharedContents { .. } => {
                // Hashed like the `Raw` map with the same bytes: the cells are only where parts of
                // the map are stored.
                state.write_u8(0);
                self.to_rope().deterministic_hash(state);
            }
        }
    }
}

impl SectionMap {
    pub fn to_rope(&self) -> Rope {
        match self {
            SectionMap::Raw(map) => map.clone(),
            SectionMap::Structured(map) => map.to_rope(),
            SectionMap::Split {
                head,
                contents,
                rest,
            } => {
                let mut builder = RopeBuilder::default();
                builder.concat(&head.head_to_rope());
                if let Some(contents) = contents {
                    builder.concat(&contents.bytes);
                }
                builder.concat(&rest.bytes);
                builder.build()
            }
            SectionMap::SharedContents {
                prefix,
                contents,
                suffix,
            } => {
                let mut builder = RopeBuilder::default();
                builder.concat(prefix);
                builder.concat(&contents.bytes);
                builder.concat(suffix);
                builder.build()
            }
        }
    }

    /// The map with its shared `sourcesContent` part replaced by a placeholder (see
    /// [`StructuredSourceMap::contents_placeholder`]), the opening `{` and head fields that
    /// precede the part (see [`StructuredSourceMap::with_shared_contents`]), and the part. `None`
    /// if the map doesn't store its contents as a part of its own.
    fn without_shared_contents(&self) -> Option<(Rope, Rope, &SharedMapPart)> {
        if !self.has_shared_contents() {
            return None;
        }
        let (prefix, contents, rest) = match self {
            SectionMap::Split {
                head,
                contents: Some(contents),
                rest,
            } => (head.head_to_rope(), contents, rest.bytes.clone()),
            SectionMap::SharedContents {
                prefix,
                contents,
                suffix,
            } => (prefix.clone(), contents, suffix.clone()),
            SectionMap::Raw(_) | SectionMap::Structured(_) | SectionMap::Split { .. } => {
                return None;
            }
        };
        let mut builder = RopeBuilder::default();
        builder.concat(&prefix);
        builder += ",\"sourcesContent\":";
        builder.concat(&null_contents(contents.entries as usize));
        builder.concat(&rest);
        Some((builder.build(), prefix, contents))
    }

    /// Whether the map stores its `sourcesContent` as a part of its own (see
    /// [`SectionMap::without_shared_contents`]).
    fn has_shared_contents(&self) -> bool {
        matches!(
            self,
            SectionMap::Split {
                contents: Some(_),
                ..
            } | SectionMap::SharedContents { .. }
        )
    }

    /// The map as a [`CellRope`]: [`SectionMap::Split`] and [`SectionMap::SharedContents`] maps
    /// reference their parts instead of copying their bytes (see [`SharedMapPart`]), other maps
    /// are inline.
    fn to_cell_rope(&self) -> CellRope {
        let mut builder = CellRopeBuilder::default();
        match self {
            SectionMap::Split {
                head,
                contents,
                rest,
            } => {
                builder.concat(&head.head_to_rope());
                if let Some(contents) = contents {
                    contents.append_to(&mut builder);
                }
                builder.push_rope(rest.cell);
            }
            SectionMap::SharedContents {
                prefix,
                contents,
                suffix,
            } => {
                builder.concat(prefix);
                contents.append_to(&mut builder);
                builder.concat(suffix);
            }
            SectionMap::Raw(_) | SectionMap::Structured(_) => builder.concat(&self.to_rope()),
        }
        builder.build()
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

/// A [`Code`] stored as cells: the code bytes in a [`Rope`] cell and each section's source map in
/// a [`CellRope`] cell, owned by the task that created them.
///
/// [`Code`] is only hashed in the persistent cache, so this is how a piece of code (e.g. a module
/// factory) is persisted. Keeping the bytes in their own cells lets composite outputs reference
/// them through a [`CellRope`] instead of persisting a copy (see [`CodeCompositionBuilder`]). A
/// section map can in turn reference another task's cell (see [`SectionMap::Split`]).
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub struct CodeCells {
    code: ResolvedVc<Rope>,
    /// The same byte offsets as [`Code`]'s mappings, with each generated map variant as a cell
    /// holding [`SectionMap::to_cell_rope`]. A map shared by both variants stays one cell.
    mappings: Vec<(usize, SourceMaps<ResolvedVc<CellRope>>)>,
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
                    .try_map_async(async |map| {
                        anyhow::Ok(SectionMap::Raw(map.await?.read().await?))
                    })
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

    /// The cells holding the code's section maps, in order.
    pub fn section_map_cells(&self) -> impl Iterator<Item = ResolvedVc<CellRope>> + '_ {
        self.mappings
            .iter()
            .flat_map(|(_, maps)| match maps {
                SourceMaps::None => [None, None],
                SourceMaps::Full(map) | SourceMaps::Shallow(map) | SourceMaps::Shared(map) => {
                    [Some(*map), None]
                }
                SourceMaps::Both { full, shallow } => [Some(*full), Some(*shallow)],
            })
            .flatten()
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
        self.source_map_types()
            .try_map(|ty| self.generate_source_map_ref(None, ty))
    }

    /// The shape of [`Code::source_maps`] without generating any map: the type to generate each
    /// variant as (a shared map as [`SourceMapType::Full`]).
    pub fn source_map_types(&self) -> SourceMaps<SourceMapType> {
        let full = self.has_source_map_for(SourceMapType::Full);
        let shallow = self.has_source_map_for(SourceMapType::Shallow);
        if full && shallow && self.mappings.is_shared() {
            return SourceMaps::Shared(SourceMapType::Full);
        }
        SourceMaps::new(
            full.then_some(SourceMapType::Full),
            shallow.then_some(SourceMapType::Shallow),
        )
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
    /// section map become their own persisted cells. [`SectionMap::Split`] and
    /// [`SectionMap::SharedContents`] maps' cells reference their parts instead of copying their
    /// bytes.
    pub fn resolved_code_cells(self) -> ResolvedVc<CodeCells> {
        let source_map_generation_options = self.mappings.available();
        let mappings = self
            .mappings
            .mappings
            .iter()
            .map(|(index, maps)| {
                (
                    *index,
                    maps.clone().map(|map| map.to_cell_rope().resolved_cell()),
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

    /// Like [`Code::generate_source_map_ref`] for `ty` (without a debug id), but with the
    /// `sourcesContent` left out of the code's only `ty` section map that stores it as a part of
    /// its own (see [`SectionMap::Split`]). Returns the map, the opening `{` and head fields of
    /// that section map, and its contents part, or `None` if no or several `ty` section maps store
    /// their contents like this (or `ty` wasn't generated).
    ///
    /// Lets the code be transformed (e.g. minified) without its contents, which a transform that
    /// keeps the sources doesn't need, and the result reference them instead of copying them (see
    /// [`StructuredSourceMap::with_shared_contents`]).
    pub fn generate_source_map_ref_without_shared_contents(
        &self,
        ty: SourceMapType,
    ) -> Option<(Rope, Rope, SharedMapPart)> {
        self.validate_source_map_type(ty).ok()?;
        let mappings = &self.mappings.mappings;
        let mut shared = mappings
            .iter()
            .enumerate()
            .filter(|(_, (_, maps))| maps.get(ty).is_some_and(SectionMap::has_shared_contents));
        let (shared_index, (_, shared_maps)) = shared.next()?;
        if shared.next().is_some() {
            return None;
        }
        let (map_without_contents, prefix, contents) =
            shared_maps.get(ty)?.without_shared_contents()?;
        let contents = contents.clone();
        let sections = self
            .source_map_sections(false, ty)
            .into_iter()
            .map(|(pos, section)| {
                let map = match section {
                    Some(index) if index == shared_index => map_without_contents.clone(),
                    Some(index) => mappings[index]
                        .1
                        .get(ty)
                        .expect("sections only refer to maps")
                        .to_rope(),
                    None => SourceMap::empty_rope(),
                };
                (pos, map)
            })
            .collect::<Vec<_>>();
        let map = if sections.len() == 1 && sections[0].0.line == 0 && sections[0].0.column == 0 {
            sections.into_iter().next().unwrap().1
        } else {
            SourceMap::sections_to_rope(sections, None)
        };
        Some((map, prefix, contents))
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
                CellRopePart::Nested(_) | CellRopePart::EscapedFileContent(_) => {
                    bail!("a composition body only holds inline bytes and code cells")
                }
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
    async fn map_cells(&self) -> Result<FxHashMap<usize, SourceMaps<ResolvedVc<CellRope>>>> {
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
                CellRopePart::Nested(_) | CellRopePart::EscapedFileContent(_) => {
                    bail!("a composition body only holds inline bytes and code cells")
                }
            }
        }
        Ok(map_cells)
    }
}

enum ComposedSection {
    Cell(ResolvedVc<CellRope>),
    Inline(Rope),
}

impl ComposedSection {
    fn push_to(&self, rope: &mut CellRopeBuilder) {
        match self {
            ComposedSection::Cell(cell) => rope.push_rope(*cell),
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
    use crate::source_map::structured::SplitSourceMap;

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

    /// How many parts of `rope` reference another cell (a section map's cell is referenced as a
    /// nested rope).
    fn referenced_parts(rope: &CellRope) -> usize {
        rope.parts()
            .filter(|part| !matches!(part, CellRopePart::Inline(_)))
            .count()
    }

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
        let map_cells = referenced_parts(&map_rope);
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
        let map_cells = referenced_parts(&map_rope);
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

    /// A module's source map, with `text` as its source's content.
    fn module_map(text: &str) -> Result<StructuredSourceMap> {
        StructuredSourceMap::from_json(&Rope::from(format!(
            r#"{{"version":3,"sources":["module.js"],"sourcesContent":["{text}"],"names":[],"mappings":"AAAA"}}"#
        )))
    }

    fn rewrite(map: &StructuredSourceMap, prefix: &str) -> Result<StructuredSourceMap> {
        map.rewrite_sources(|source| Ok(Some(format!("{prefix}/{source}"))))
    }

    /// Like a module's content: the module's map, split, with the tail in this task's cell.
    #[turbo_tasks::value(shared)]
    struct ModuleMap {
        map: SplitSourceMap,
    }

    #[turbo_tasks::function]
    async fn split_module_map(text: ResolvedVc<Text>) -> Result<Vc<ModuleMap>> {
        let text = text.await?.text.get().clone();
        Ok(ModuleMap {
            map: SplitSourceMap::new(module_map(&text)?),
        }
        .cell())
    }

    /// Like a module factory for one chunking context: the module's map with `sources` rewritten
    /// under `prefix`. Its code bytes don't depend on the map's tail.
    #[turbo_tasks::function]
    async fn split_piece(text: ResolvedVc<Text>, prefix: RcStr) -> Result<Vc<CodeCells>> {
        let module = split_module_map(*text).await?;
        let head = rewrite(module.map.head(), &prefix)?;
        let mut code = CodeBuilder::new(false, SourceMapGenerationOptions::default());
        code += "(()=>{";
        code.push_source(
            &Rope::from("x()"),
            SourceMaps::Full(module.map.to_section_map(head).await?),
        )?;
        code += "})";
        Ok(*code.build().resolved_code_cells())
    }

    static SPLIT_COMPOSITION_EXECUTIONS: AtomicUsize = AtomicUsize::new(0);

    #[turbo_tasks::function]
    fn structured_piece() -> Result<Vc<CodeCells>> {
        let map = rewrite(&module_map("structured")?, "structured")?;
        let mut code = CodeBuilder::new(false, SourceMapGenerationOptions::default());
        code += "(()=>{";
        code.push_source(&Rope::from("y()"), SourceMaps::Full(map))?;
        code += "})";
        Ok(*code.build().resolved_code_cells())
    }

    fn section_map_cells(cells: &CodeCells) -> Vec<ResolvedVc<CellRope>> {
        cells.section_map_cells().collect()
    }

    /// `[<a>,<b>,<structured>,<fixed>]`: the same module's factory for two chunking contexts, a
    /// piece with an unsplit structured map, and a piece with a raw map.
    #[turbo_tasks::function]
    async fn split_composition(text: ResolvedVc<Text>) -> Result<Vc<CodeComposition>> {
        SPLIT_COMPOSITION_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
        let mut builder = CodeCompositionBuilder::new(false, SourceMapGenerationOptions::default());
        builder += "[";
        for prefix in ["a", "b"] {
            let piece = piece_ref(split_piece(*text, prefix.into())).await?;
            builder.push_code_cells(piece.cells, piece.code);
            builder += ",";
        }
        let structured = piece_ref(structured_piece()).await?;
        builder.push_code_cells(structured.cells, structured.code);
        builder += ",";
        let fixed = piece_ref(fixed_piece()).await?;
        builder.push_code_cells(fixed.cells, fixed.code);
        builder += "]";
        Ok(builder.build().cell())
    }

    #[turbo_tasks::value(shared, serialization = "skip")]
    struct SplitOutput {
        map: RcStr,
        body: ReadRef<CellRope>,
        /// The factories' section map cells.
        piece_maps: Vec<ReadRef<CellRope>>,
    }

    /// Reads the composition and checks its pieces and map against the flat equivalents.
    #[turbo_tasks::function(operation, root)]
    async fn split_output_operation(text: ResolvedVc<Text>) -> Result<Vc<SplitOutput>> {
        let composition = split_composition(*text).await?;
        let code = composition.build_code().await?;
        let map = composition
            .generate_source_map(&code, None, SourceMapType::Full)
            .await?
            .read()
            .await?;

        let module = split_module_map(*text).await?;
        let full_map = module_map(&text.await?.text.get().clone())?;
        let mut flat = CodeBuilder::new(false, SourceMapGenerationOptions::default());
        flat += "[";
        let mut piece_maps = Vec::new();
        for prefix in ["a", "b"] {
            let cells = split_piece(*text, prefix.into()).await?;
            let [map_cell] = section_map_cells(&cells)[..] else {
                anyhow::bail!("a factory has one section map");
            };
            let map_cell = map_cell.await?;
            // The section map references the module's tail parts instead of copying them.
            let referenced = map_cell
                .parts()
                .filter_map(|part| match part {
                    CellRopePart::Nested(rope) => Some(rope),
                    _ => None,
                })
                .collect::<Vec<_>>();
            let expected = module
                .map
                .contents()
                .into_iter()
                .chain([module.map.rest()])
                .collect::<Vec<_>>();
            ensure!(referenced == expected, "the tail isn't referenced");
            ensure!(
                map_cell.read().await? == rewrite(&full_map, prefix)?.to_rope(),
                "the section map differs from the rewritten module map"
            );
            piece_maps.push(map_cell);

            let piece = split_piece(*text, prefix.into()).to_code().await?;
            flat.push_code(&piece)?;
            flat += ",";
        }
        let structured_cells = structured_piece().await?;
        let [structured_map] = section_map_cells(&structured_cells)[..] else {
            anyhow::bail!("a piece has one section map");
        };
        let structured_map = structured_map.await?;
        ensure!(
            structured_map
                .parts()
                .all(|part| matches!(part, CellRopePart::Inline(_))),
            "an unsplit structured map is stored inline"
        );
        ensure!(
            structured_map.read().await?
                == rewrite(&module_map("structured")?, "structured")?.to_rope(),
            "the unsplit structured map changed"
        );
        flat.push_code(&*structured_piece().to_code().await?)?;
        flat += ",";

        let fixed_cells = fixed_piece().await?;
        let [fixed_map] = section_map_cells(&fixed_cells)[..] else {
            anyhow::bail!("a piece has one section map");
        };
        ensure!(
            fixed_map
                .await?
                .parts()
                .all(|part| matches!(part, CellRopePart::Inline(_))),
            "a map that isn't split is stored inline"
        );
        flat.push_code(&*fixed_piece().to_code().await?)?;
        flat += "]";
        let flat = flat.build();
        ensure!(code.source_code() == flat.source_code(), "code differs");
        ensure!(
            map == flat.generate_source_map_ref(None, SourceMapType::Full)?,
            "source map differs"
        );
        Ok(SplitOutput {
            map: map.to_str()?.into(),
            body: composition.body().await?,
            piece_maps,
        }
        .cell())
    }

    /// Factory maps reference their module's map tail: editing only the tail (here the source's
    /// content) updates the composed map without changing the factories' map cells or
    /// re-executing the composition.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn split_maps_reference_the_module_tail() {
        turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ))
        .run_once(async {
            let text_op = text_operation();
            let text = text_op.resolve().strongly_consistent().await?;
            let output = split_output_operation(text);
            let before = output.read_strongly_consistent().await?;
            assert!(
                before
                    .map
                    .contains(r#""sources":["a/module.js"],"sourcesContent":["one"]"#)
            );
            assert!(
                before
                    .map
                    .contains(r#""sources":["b/module.js"],"sourcesContent":["one"]"#)
            );
            let executions = SPLIT_COMPOSITION_EXECUTIONS.load(Ordering::SeqCst);

            text_op
                .read_strongly_consistent()
                .await?
                .text
                .set("two".into());

            let after = output.read_strongly_consistent().await?;
            assert!(
                after
                    .map
                    .contains(r#""sources":["a/module.js"],"sourcesContent":["two"]"#)
            );
            assert!(
                after
                    .map
                    .contains(r#""sources":["b/module.js"],"sourcesContent":["two"]"#)
            );
            assert!(!after.map.contains("one"));
            assert_eq!(
                SPLIT_COMPOSITION_EXECUTIONS.load(Ordering::SeqCst),
                executions,
                "the composition must not re-execute"
            );
            assert_eq!(before.body, after.body);
            assert_eq!(before.piece_maps, after.piece_maps);
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// The module's source file, holding the text.
    #[turbo_tasks::function]
    async fn text_file(text: ResolvedVc<Text>) -> Result<Vc<FileContent>> {
        Ok(FileContent::Content(File::from(text.await?.text.get().to_string())).cell())
    }

    /// A module's map generated from its source (escaped `sourcesContent`), with `text` as the
    /// source's content.
    fn generated_module_map(
        text: &str,
        sources: &[(Rope, ResolvedVc<FileContent>)],
    ) -> Result<(StructuredSourceMap, Vec<Option<ResolvedVc<FileContent>>>)> {
        let map = swc_sourcemap::SourceMap::from_slice(
            serde_json::to_string(&serde_json::json!({
                "version": 3,
                "sources": ["module.js"],
                "sourcesContent": [text],
                "names": [],
                "mappings": "AAAA",
            }))?
            .as_bytes(),
        )?;
        StructuredSourceMap::from_swc_map_with_sources(map, sources)
    }

    /// Like a module's content: the module's map, split, with the source's content referenced
    /// instead of copied.
    #[turbo_tasks::function]
    async fn referencing_module_map(text: ResolvedVc<Text>) -> Result<Vc<ModuleMap>> {
        let file = text_file(*text).to_resolved().await?;
        let content = text.await?.text.get().to_string();
        let (map, refs) = generated_module_map(&content, &[(Rope::from(content.clone()), file)])?;
        ensure!(
            refs == [Some(file)],
            "the content isn't matched to the file"
        );
        Ok(ModuleMap {
            map: SplitSourceMap::new_with_source_contents(map, &refs),
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn referencing_piece(text: ResolvedVc<Text>, prefix: RcStr) -> Result<Vc<CodeCells>> {
        let module = referencing_module_map(*text).await?;
        let head = rewrite(module.map.head(), &prefix)?;
        let mut code = CodeBuilder::new(false, SourceMapGenerationOptions::default());
        code += "(()=>{";
        code.push_source(
            &Rope::from("x()"),
            SourceMaps::Full(module.map.to_section_map(head).await?),
        )?;
        code += "})";
        Ok(*code.build().resolved_code_cells())
    }

    #[turbo_tasks::value(shared, serialization = "skip")]
    struct ReferencingOutput {
        map: RcStr,
        piece_map: ReadRef<CellRope>,
    }

    /// Checks that the module's contents part references the file instead of copying the text,
    /// and that every way of reading the factory's map (its cell, `to_code`) gives the bytes of
    /// the same map with inline contents.
    #[turbo_tasks::function(operation, root)]
    async fn referencing_output_operation(text: ResolvedVc<Text>) -> Result<Vc<ReferencingOutput>> {
        let content = text.await?.text.get().to_string();
        let module = referencing_module_map(*text).await?;
        let contents = module.map.contents().context("the contents are a part")?;
        let file = text_file(*text).to_resolved().await?;
        let parts = contents.await?;
        ensure!(
            parts
                .parts()
                .any(|part| matches!(part, CellRopePart::EscapedFileContent(f) if f == file)),
            "the contents don't reference the file"
        );
        ensure!(
            parts.parts().all(|part| match part {
                CellRopePart::Inline(bytes) => !bytes.to_str().unwrap().contains(&content),
                _ => true,
            }),
            "the contents hold a copy of the text"
        );

        let flat = rewrite(&generated_module_map(&content, &[])?.0, "a")?.to_rope();
        let cells = referencing_piece(*text, "a".into()).await?;
        let [map_cell] = section_map_cells(&cells)[..] else {
            anyhow::bail!("a factory has one section map");
        };
        let map_cell = map_cell.await?;
        ensure!(
            map_cell.read().await? == flat,
            "the section map differs from the inline map"
        );
        let code = referencing_piece(*text, "a".into()).to_code().await?;
        let mut expected = CodeBuilder::new(false, SourceMapGenerationOptions::default());
        expected += "(()=>{";
        expected.push_source(
            &Rope::from("x()"),
            SourceMaps::Full(Rope::from(flat.to_bytes().to_vec())),
        )?;
        expected += "})";
        ensure!(
            code.generate_source_map_ref(None, SourceMapType::Full)?
                == expected
                    .build()
                    .generate_source_map_ref(None, SourceMapType::Full)?,
            "the code's map differs from the inline map"
        );
        Ok(ReferencingOutput {
            map: map_cell.read().await?.to_str()?.into(),
            piece_map: map_cell,
        }
        .cell())
    }

    /// A map whose contents reference the source file reads like a map with inline contents,
    /// and follows edits to the file without changing the factory's map cell.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn referenced_contents_read_like_inline_contents() {
        turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ))
        .run_once(async {
            let text_op = text_operation();
            let text = text_op.resolve().strongly_consistent().await?;
            let output = referencing_output_operation(text);
            let before = output.read_strongly_consistent().await?;
            assert!(before.map.contains(r#""sourcesContent":["one"]"#));

            text_op
                .read_strongly_consistent()
                .await?
                .text
                .set("two \"quoted\"\n😀".into());

            let after = output.read_strongly_consistent().await?;
            assert!(
                after
                    .map
                    .contains(r#""sourcesContent":["two \"quoted\"\n😀"]"#)
            );
            assert_eq!(before.piece_map, after.piece_map);
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// Like a module's content whose source text couldn't be matched to a file: the contents
    /// stay inline, in their own part.
    #[turbo_tasks::function]
    async fn inline_contents_module_map(text: ResolvedVc<Text>) -> Result<Vc<ModuleMap>> {
        let content = text.await?.text.get().to_string();
        let (map, refs) = generated_module_map(&content, &[])?;
        ensure!(refs.iter().all(Option::is_none), "nothing is referenced");
        Ok(ModuleMap {
            map: SplitSourceMap::new_with_source_contents(map, &refs),
        }
        .cell())
    }

    #[turbo_tasks::function(operation, root)]
    async fn inline_contents_piece_operation(text: ResolvedVc<Text>) -> Result<Vc<RcStr>> {
        let content = text.await?.text.get().to_string();
        let module = inline_contents_module_map(*text).await?;
        let contents = module.map.contents().context("the contents are a part")?;
        let head = rewrite(module.map.head(), "a")?;
        let mut code = CodeBuilder::new(false, SourceMapGenerationOptions::default());
        code.push_source(
            &Rope::from("x()"),
            SourceMaps::Full(module.map.to_section_map(head).await?),
        )?;
        let map = code.build().resolved_code_cells().await?;
        let [map_cell] = section_map_cells(&map)[..] else {
            anyhow::bail!("the code has one section map");
        };
        let map_cell = map_cell.await?;
        let referenced = map_cell
            .parts()
            .filter_map(|part| match part {
                CellRopePart::Nested(rope) => Some(rope),
                _ => None,
            })
            .collect::<Vec<_>>();
        ensure!(
            referenced == [contents, module.map.rest()],
            "inline contents must be referenced, not copied"
        );
        ensure!(
            map_cell.parts().all(|part| match part {
                CellRopePart::Inline(bytes) => !bytes.to_str().unwrap().contains(&content),
                _ => true,
            }),
            "the section map holds a copy of the inline contents"
        );
        Ok(Vc::cell(map_cell.read().await?.to_str()?.into()))
    }

    /// Contents that hold text of their own aren't copied into the maps sharing them.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn inline_contents_are_referenced_not_copied() {
        turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ))
        .run_once(async {
            let text = text_operation().resolve().strongly_consistent().await?;
            let map = inline_contents_piece_operation(text)
                .read_strongly_consistent()
                .await?;
            assert!(map.contains(r#""sourcesContent":["one"]"#), "{map}");
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
    use turbo_tasks_fs::{FileSystem, VirtualFileSystem};

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
                composed
                    .parts()
                    .filter(|part| !matches!(part, CellRopePart::Inline(_)))
                    .count()
                    == names.len(),
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

        // The emitted code files (magic comments and debug id included) match too, for every
        // emitted map type, and emitting a missing variant fails in both.
        let flat = flat.cell();
        let flat_resolved = flat.to_resolved().await?;
        let composed = ComposedCode::new(code, Some(composition.resolved_cell()));
        let map_path = VirtualFileSystem::new()
            .root()
            .await?
            .join("chunk.js.map")?;
        let map_asset = |ty| {
            SourceMapAsset::new_fixed(
                map_path.clone(),
                ty,
                *ResolvedVc::upcast::<Box<dyn GenerateSourceMap>>(flat_resolved),
            )
        };
        for emitted in [
            None,
            Some(SourceMapType::Full),
            Some(SourceMapType::Shallow),
        ] {
            let path_ty = emitted.unwrap_or(SourceMapType::Full);
            let composed_file = composed
                .to_file_with_magic_comments(emitted, || map_asset(path_ty))
                .await;
            let flat_file = flat
                .to_rope_with_magic_comments(emitted, || map_asset(path_ty))
                .await;
            match (composed_file, flat_file) {
                (Ok(composed_file), Ok(flat_file)) => {
                    ensure!(
                        emitted.is_none_or(|ty| variants.types().contains(&ty)),
                        "emitting a missing {emitted:?} variant must fail"
                    );
                    ensure!(
                        *composed_file.content() == flat_file,
                        "{emitted:?} composed file differs"
                    );
                    let text = flat_file.to_str()?;
                    ensure!(
                        text.contains("sourceMappingURL=") == emitted.is_some(),
                        "{emitted:?} sourceMappingURL"
                    );
                    ensure!(text.contains("debugId=") == debug_id.is_some(), "debugId");
                }
                (Err(_), Err(_)) => ensure!(
                    emitted.is_some_and(|ty| !variants.types().contains(&ty)),
                    "only a missing {emitted:?} variant may fail"
                ),
                _ => anyhow::bail!("{emitted:?}: composed and inline disagree on failing"),
            }
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
