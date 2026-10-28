mod source_map_sections;

use std::{
    cmp::min,
    io::{BufRead, Result as IoResult, Write},
    ops,
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
    code_builder::source_map_sections::Mappings,
    debug_id::generate_debug_id,
    output::OutputAsset,
    source_map::{
        GenerateSourceMap, SourceMap, SourceMapAsset, SourceMapType, SourceMaps,
        structured::StructuredSourceMap,
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

/// Code stores combined output code and the source map of that output code.
#[turbo_tasks::value(shared, serialization = "hash")]
#[derive(Debug, Clone, Encode, Decode)]
pub struct Code {
    code: Rope,
    mappings: Mappings,
    should_generate_debug_id: bool,
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
    /// Rejects variants that were not generated for every mapped section.
    pub fn validate_source_map_type(&self, ty: SourceMapType) -> Result<()> {
        let available = self.mappings.is_complete(ty);
        anyhow::ensure!(
            available,
            "Requested {ty:?} source map was not generated for all mapped code"
        );
        Ok(())
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
        let partial = self.has_source_map_for(SourceMapType::Partial);
        if full && partial && self.mappings.is_shared() {
            return Ok(SourceMaps::Shared(
                self.generate_source_map_ref(None, SourceMapType::Full)?,
            ));
        }
        Ok(SourceMaps::new(
            full.then(|| self.generate_source_map_ref(None, SourceMapType::Full))
                .transpose()?,
            partial
                .then(|| self.generate_source_map_ref(None, SourceMapType::Partial))
                .transpose()?,
        ))
    }

    // Whether this code should have a debug id generated for it
    pub fn should_generate_debug_id(&self) -> bool {
        self.should_generate_debug_id
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

    // Formats the code with the source map and debug id comments as
    pub async fn to_rope_with_magic_comments(
        self: Vc<Self>,
        emitted_source_map_ty: Option<SourceMapType>,
        source_map_path_fn: impl FnOnce() -> Vc<SourceMapAsset>,
    ) -> Result<Rope> {
        let code = self.await?;
        let emit_source_map = code.should_emit_source_map(emitted_source_map_ty)?;
        Ok(if emit_source_map || code.should_generate_debug_id() {
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

            if emit_source_map {
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
        })
    }
}

/// CodeBuilder provides a mutable container to append source code.
#[derive(Default)]
pub struct CodeBuilder {
    code: RopeBuilder,
    mappings: Mappings,
    should_generate_debug_id: bool,
}

impl CodeBuilder {
    pub fn new(should_generate_debug_id: bool) -> Self {
        Self {
            should_generate_debug_id,
            ..Default::default()
        }
    }

    /// Pushes synthetic runtime code without an associated source map. This is
    /// the default concatenation operation, but it's designed to be used
    /// with the `+=` operator.
    fn push_static_bytes(&mut self, code: &'static [u8]) {
        self.push_source_maps(SourceMaps::None);
        self.code.push_static_bytes(code);
    }

    /// Pushes original user code with an optional source map if one is
    /// available. If it's not, this is no different than pushing Synthetic
    /// code.
    pub fn push_source<M: Into<SectionMap> + NonLocalValue>(
        &mut self,
        code: &Rope,
        source_maps: SourceMaps<M>,
    ) {
        self.push_source_maps(source_maps.map(Into::into));
        self.code += code;
    }

    fn push_source_maps(&mut self, source_maps: SourceMaps<SectionMap>) {
        self.mappings.push(self.code.len(), source_maps);
    }

    /// Copies the Synthetic/Original code of an already constructed Code into
    /// this instance.
    ///
    /// This adjusts the source map to be relative to the new code object
    pub fn push_code(&mut self, prebuilt: &Code) {
        self.mappings.append(self.code.len(), &prebuilt.mappings);
        self.code += &prebuilt.code;
    }

    pub fn build(self) -> Code {
        Code {
            code: self.code.build(),
            mappings: self.mappings,
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
        self.push_source_maps(SourceMaps::None);
        self.code.write(bytes)
    }

    fn flush(&mut self) -> IoResult<()> {
        self.code.flush()
    }
}

impl From<Code> for CodeBuilder {
    fn from(code: Code) -> Self {
        let mut builder = CodeBuilder::new(code.should_generate_debug_id);
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
    pub fn generate_source_map_ref(
        &self,
        debug_id: Option<RcStr>,
        ty: SourceMapType,
    ) -> Result<Rope> {
        self.validate_source_map_type(ty)?;
        // A debug id should be passed only if the code should generate a debug id, it is however
        // allowed to turn it off to access intermediate states of the code (e.g. for minification)
        debug_assert!(debug_id.is_none() || self.should_generate_debug_id);
        // If there is a debug id the first line will be modifying the global object. see
        // `[to_rope_with_magic_comments]` for more details.
        let mut pos = SourcePos::new(if debug_id.is_some() { 1 } else { 0 });

        let mut last_byte_pos = 0;

        let mappings = &self.mappings.mappings;
        let mut sections = Vec::with_capacity(mappings.len());
        let mut read = self.code.read();
        for (byte_pos, maps) in mappings.iter() {
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

            if let Some(map) = maps.get(ty) {
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
            Ok(sections.into_iter().next().unwrap().1)
        } else {
            Ok(SourceMap::sections_to_rope(sections, debug_id))
        }
    }
}
