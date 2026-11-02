//! A source map kept in structured form until it is actually emitted, so that rewriting or
//! embedding a map shares its ropes instead of copying its bytes. `sourcesContent` in
//! particular (the full original source text) would otherwise be copied for every chunking
//! context that rewrites the `sources` URLs and for every chunk source map that embeds the
//! module's map.
//!
//! Fields are stored as verbatim raw JSON snippets ([`Rope`]s) and only decoded when something
//! actually needs their values: `sources` is decoded lazily by
//! [`StructuredSourceMap::rewrite_sources`] when a rewrite changes an entry, and `sourcesContent`
//! of maps built from swc objects is a list of individually pre-escaped [`Rope`]s that are shared
//! into every map that embeds them.
//!
//! [`StructuredSourceMap::to_rope`] emits fields in the same order as `swc_sourcemap`'s
//! serializer, so maps built via [`StructuredSourceMap::from_swc_map`] serialize byte-for-byte
//! identically to what `swc_sourcemap::SourceMap::to_writer` would have produced (pinned by the
//! golden tests below).
//!
//! In the persistent cache, sharing ropes doesn't avoid copies: every persisted map stores its own
//! bytes. A module's map is therefore stored as a [`SplitSourceMap`], whose tail (everything after
//! `sources`) is a cell that the maps of the module's factories reference.

use std::sync::LazyLock;

use anyhow::Result;
use bincode::{Decode, Encode};
use serde::Deserialize;
use serde_json::value::RawValue;
use turbo_tasks::{NonLocalValue, ResolvedVc};
use turbo_tasks_fs::{
    CellRope, CellRopeBuilder, FileContent, escape_json_string,
    rope::{Rope, RopeBuilder},
};
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher};

use crate::code_builder::{SectionMap, SharedMapPart};

/// A single source map in structured form. See the module documentation.
#[derive(Clone, Debug, Default, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub struct StructuredSourceMap {
    // Raw snippet fields hold the field's verbatim JSON value (e.g. `3`, `"..."`, `[...]`).
    // Declaration order mirrors `swc_sourcemap`'s `RawSourceMap`, which is the emission order.
    version: Option<Rope>,
    file: Option<Rope>,
    sources: Option<SourcesField>,
    source_root: Option<Rope>,
    sources_content: Option<SourcesContentField>,
    sections: Option<Rope>,
    names: Option<Rope>,
    scopes: Option<Rope>,
    range_mappings: Option<Rope>,
    mappings: Option<Rope>,
    ignore_list: Option<Rope>,
    x_facebook_offsets: Option<Rope>,
    x_metro_module_paths: Option<Rope>,
    x_facebook_sources: Option<Rope>,
    debug_id_old: Option<Rope>,
    debug_id: Option<Rope>,
}

/// The `sources` field. Kept verbatim until a rewrite actually changes an entry, so maps whose
/// `sources` cannot be decoded (or are never rewritten) round-trip byte-for-byte.
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
enum SourcesField {
    /// The field's verbatim JSON value.
    Raw(Rope),
    /// Decoded form, produced only by [`StructuredSourceMap::rewrite_sources`] when an entry
    /// changed.
    Rewritten(Vec<Option<String>>),
}

/// The `sourcesContent` field.
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
enum SourcesContentField {
    /// The field's verbatim JSON value (maps parsed from external bytes). Never decoded — this
    /// tolerates content JSON that does not decode into Rust strings, e.g. lone surrogate
    /// escapes.
    Raw(Rope),
    /// One entry per source: the pre-escaped JSON value of the source's content — a string
    /// literal (including quotes) or the literal `null`. Shared into every emitted map (maps
    /// built via [`StructuredSourceMap::from_swc_map`]).
    Escaped(Vec<Rope>),
}

/// Deserialization mirror of [`StructuredSourceMap`]. Unknown fields are dropped.
#[derive(Deserialize)]
struct RawFields {
    version: Option<Box<RawValue>>,
    file: Option<Box<RawValue>>,
    sources: Option<Box<RawValue>>,
    #[serde(rename = "sourceRoot")]
    source_root: Option<Box<RawValue>>,
    #[serde(rename = "sourcesContent")]
    sources_content: Option<Box<RawValue>>,
    sections: Option<Box<RawValue>>,
    names: Option<Box<RawValue>>,
    scopes: Option<Box<RawValue>>,
    #[serde(rename = "rangeMappings")]
    range_mappings: Option<Box<RawValue>>,
    mappings: Option<Box<RawValue>>,
    #[serde(rename = "ignoreList")]
    ignore_list: Option<Box<RawValue>>,
    x_facebook_offsets: Option<Box<RawValue>>,
    x_metro_module_paths: Option<Box<RawValue>>,
    x_facebook_sources: Option<Box<RawValue>>,
    #[serde(rename = "debug_id")]
    debug_id_old: Option<Box<RawValue>>,
    #[serde(rename = "debugId")]
    debug_id: Option<Box<RawValue>>,
}

fn into_rope(value: Option<Box<RawValue>>) -> Option<Rope> {
    value.map(|v| Rope::from(v.get().as_bytes().to_vec()))
}

/// JSON-escapes a source's content into the string-literal form stored in `sources_content`.
fn escape_content(content: Option<&str>) -> Rope {
    match content {
        Some(text) => escape_json_string(text),
        None => {
            static NULL: LazyLock<Rope> = LazyLock::new(|| Rope::from("null"));
            NULL.clone()
        }
    }
}

/// A serde [`Serializer`](serde::Serializer) that splits a struct into its top-level fields,
/// each serialized to its own JSON value. This lets [`StructuredSourceMap::from_serialize`]
/// capture a source map's fields directly from its `Serialize` implementation without
/// materializing — and then re-parsing — the whole serialized document.
struct FieldSplit;

#[derive(Debug)]
struct FieldSplitError(String);

impl std::fmt::Display for FieldSplitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl std::error::Error for FieldSplitError {}

impl serde::ser::Error for FieldSplitError {
    fn custom<T: std::fmt::Display>(msg: T) -> Self {
        FieldSplitError(msg.to_string())
    }
}

struct FieldSplitStruct {
    fields: Vec<(&'static str, Vec<u8>)>,
}

impl serde::ser::SerializeStruct for FieldSplitStruct {
    type Ok = Vec<(&'static str, Vec<u8>)>;
    type Error = FieldSplitError;

    fn serialize_field<T: ?Sized + serde::Serialize>(
        &mut self,
        key: &'static str,
        value: &T,
    ) -> Result<(), FieldSplitError> {
        let bytes = serde_json::to_vec(value).map_err(serde::ser::Error::custom)?;
        self.fields.push((key, bytes));
        Ok(())
    }

    fn end(self) -> Result<Self::Ok, FieldSplitError> {
        Ok(self.fields)
    }
}

macro_rules! not_a_struct {
    ($($f:ident($($arg:ty),*) -> $ret:ty;)*) => {
        $(fn $f(self, $(_: $arg),*) -> Result<$ret, FieldSplitError> {
            Err(serde::ser::Error::custom("expected a struct"))
        })*
    };
}

impl serde::Serializer for FieldSplit {
    type Ok = Vec<(&'static str, Vec<u8>)>;
    type Error = FieldSplitError;
    type SerializeSeq = serde::ser::Impossible<Self::Ok, Self::Error>;
    type SerializeTuple = serde::ser::Impossible<Self::Ok, Self::Error>;
    type SerializeTupleStruct = serde::ser::Impossible<Self::Ok, Self::Error>;
    type SerializeTupleVariant = serde::ser::Impossible<Self::Ok, Self::Error>;
    type SerializeMap = serde::ser::Impossible<Self::Ok, Self::Error>;
    type SerializeStruct = FieldSplitStruct;
    type SerializeStructVariant = serde::ser::Impossible<Self::Ok, Self::Error>;

    fn serialize_struct(
        self,
        _name: &'static str,
        len: usize,
    ) -> Result<FieldSplitStruct, FieldSplitError> {
        Ok(FieldSplitStruct {
            fields: Vec::with_capacity(len),
        })
    }

    not_a_struct! {
        serialize_bool(bool) -> Self::Ok;
        serialize_i8(i8) -> Self::Ok;
        serialize_i16(i16) -> Self::Ok;
        serialize_i32(i32) -> Self::Ok;
        serialize_i64(i64) -> Self::Ok;
        serialize_u8(u8) -> Self::Ok;
        serialize_u16(u16) -> Self::Ok;
        serialize_u32(u32) -> Self::Ok;
        serialize_u64(u64) -> Self::Ok;
        serialize_f32(f32) -> Self::Ok;
        serialize_f64(f64) -> Self::Ok;
        serialize_char(char) -> Self::Ok;
        serialize_str(&str) -> Self::Ok;
        serialize_bytes(&[u8]) -> Self::Ok;
        serialize_none() -> Self::Ok;
        serialize_unit() -> Self::Ok;
        serialize_unit_struct(&'static str) -> Self::Ok;
        serialize_unit_variant(&'static str, u32, &'static str) -> Self::Ok;
        serialize_seq(Option<usize>) -> Self::SerializeSeq;
        serialize_tuple(usize) -> Self::SerializeTuple;
        serialize_tuple_struct(&'static str, usize) -> Self::SerializeTupleStruct;
        serialize_tuple_variant(&'static str, u32, &'static str, usize) -> Self::SerializeTupleVariant;
        serialize_map(Option<usize>) -> Self::SerializeMap;
        serialize_struct_variant(&'static str, u32, &'static str, usize) -> Self::SerializeStructVariant;
    }

    fn serialize_some<T: ?Sized + serde::Serialize>(
        self,
        _value: &T,
    ) -> Result<Self::Ok, FieldSplitError> {
        Err(serde::ser::Error::custom("expected a struct"))
    }

    fn serialize_newtype_struct<T: ?Sized + serde::Serialize>(
        self,
        _name: &'static str,
        value: &T,
    ) -> Result<Self::Ok, FieldSplitError> {
        value.serialize(self)
    }

    fn serialize_newtype_variant<T: ?Sized + serde::Serialize>(
        self,
        _name: &'static str,
        _variant_index: u32,
        _variant: &'static str,
        _value: &T,
    ) -> Result<Self::Ok, FieldSplitError> {
        Err(serde::ser::Error::custom("expected a struct"))
    }
}

impl StructuredSourceMap {
    /// Builds from a [`swc_sourcemap::SourceMap`], taking the `sourcesContent` entries out of
    /// the map before serializing the (now small) remainder. This is the cheap constructor for
    /// all internally generated maps: the source text is escaped exactly once and never
    /// round-trips through JSON parsing.
    pub fn from_swc_map(map: swc_sourcemap::SourceMap) -> Result<Self> {
        Ok(Self::from_swc_map_with_sources(map, &[])?.0)
    }

    /// Like [`StructuredSourceMap::from_swc_map`], but also returns, for each `sourcesContent`
    /// entry, the file in `sources` whose content is exactly that entry's text (if any).
    ///
    /// `sources` are the texts the map's mappings were generated from, each with the file content
    /// cell holding the same text. An entry matching one can be stored as a reference to the file
    /// instead of an escaped copy (see [`SplitSourceMap::new_with_source_contents`]).
    pub fn from_swc_map_with_sources(
        mut map: swc_sourcemap::SourceMap,
        sources: &[(Rope, ResolvedVc<FileContent>)],
    ) -> Result<(Self, Vec<Option<ResolvedVc<FileContent>>>)> {
        let mut source_refs = Vec::new();
        let contents: Vec<Rope> = map
            .source_contents()
            .map(|content| {
                let content = content.map(|c| c.as_str());
                source_refs.push(content.and_then(|text| {
                    sources.iter().find_map(|(source, cell)| {
                        (source.len() == text.len() && *source.to_bytes() == *text.as_bytes())
                            .then_some(*cell)
                    })
                }));
                escape_content(content)
            })
            .collect();
        let has_contents = contents.iter().any(|c| c.to_bytes().as_ref() != b"null");
        for idx in 0..map.get_source_count() {
            map.set_source_contents(idx, None);
        }
        let mut skeleton = Vec::new();
        map.to_writer(&mut skeleton)?;
        let mut result = Self::from_json_slice(&skeleton)?;
        result.sources_content = has_contents.then_some(SourcesContentField::Escaped(contents));
        if !has_contents {
            source_refs.clear();
        }
        Ok((result, source_refs))
    }

    /// Parses an arbitrary serialized source map, e.g. one shipped alongside external code.
    pub fn from_json(map: &Rope) -> Result<Self> {
        Self::from_json_slice(&map.to_bytes())
    }

    /// Parses a serialized source map from a byte slice.
    pub fn from_json_slice(map: &[u8]) -> Result<Self> {
        let fields: RawFields = serde_json::from_slice(map)?;
        Ok(StructuredSourceMap {
            version: into_rope(fields.version),
            file: into_rope(fields.file),
            sources: into_rope(fields.sources).map(SourcesField::Raw),
            source_root: into_rope(fields.source_root),
            sources_content: into_rope(fields.sources_content).map(SourcesContentField::Raw),
            sections: into_rope(fields.sections),
            names: into_rope(fields.names),
            scopes: into_rope(fields.scopes),
            range_mappings: into_rope(fields.range_mappings),
            mappings: into_rope(fields.mappings),
            ignore_list: into_rope(fields.ignore_list),
            x_facebook_offsets: into_rope(fields.x_facebook_offsets),
            x_metro_module_paths: into_rope(fields.x_metro_module_paths),
            x_facebook_sources: into_rope(fields.x_facebook_sources),
            debug_id_old: into_rope(fields.debug_id_old),
            debug_id: into_rope(fields.debug_id),
        })
    }

    /// Builds directly from a value's [`serde::Serialize`] implementation (e.g.
    /// `swc_sourcemap::lazy::RawSourceMap`), capturing each top-level field's serialized JSON
    /// value without materializing — and then re-parsing — the whole document. The result is
    /// byte-equivalent to `Self::from_json_slice(&serde_json::to_vec(value)?)`.
    ///
    /// Errors if the value does not serialize as a struct or contains a field this type does
    /// not know about; callers should fall back to serializing and [`Self::from_json`] then.
    pub fn from_serialize<T: serde::Serialize>(value: &T) -> Result<Self> {
        let fields = value
            .serialize(FieldSplit)
            .map_err(|error| anyhow::anyhow!("failed to split source map fields: {error}"))?;
        let mut result = StructuredSourceMap::default();
        for (key, bytes) in fields {
            let rope = Rope::from(bytes);
            match key {
                "version" => result.version = Some(rope),
                "file" => result.file = Some(rope),
                "sources" => result.sources = Some(SourcesField::Raw(rope)),
                "sourceRoot" => result.source_root = Some(rope),
                "sourcesContent" => result.sources_content = Some(SourcesContentField::Raw(rope)),
                "sections" => result.sections = Some(rope),
                "names" => result.names = Some(rope),
                "scopes" => result.scopes = Some(rope),
                "rangeMappings" => result.range_mappings = Some(rope),
                "mappings" => result.mappings = Some(rope),
                "ignoreList" => result.ignore_list = Some(rope),
                "x_facebook_offsets" => result.x_facebook_offsets = Some(rope),
                "x_metro_module_paths" => result.x_metro_module_paths = Some(rope),
                "x_facebook_sources" => result.x_facebook_sources = Some(rope),
                "debug_id" => result.debug_id_old = Some(rope),
                "debugId" => result.debug_id = Some(rope),
                other => anyhow::bail!("unknown source map field `{other}`"),
            }
        }
        Ok(result)
    }

    /// Rewrites each `sources` entry, keeping every other field (including the shared
    /// `sourcesContent` ropes) intact. `rewrite` returns `None` to leave an entry unchanged.
    ///
    /// `sources` is only decoded if a rewrite actually changes an entry; if it cannot be decoded
    /// (e.g. non-string entries in an external map) the map is returned unchanged.
    pub fn rewrite_sources(
        &self,
        mut rewrite: impl FnMut(&str) -> Result<Option<String>>,
    ) -> Result<Self> {
        let mut result = self.clone();
        let mut sources: Vec<Option<String>> = match &self.sources {
            None => return Ok(result),
            Some(SourcesField::Rewritten(sources)) => sources.clone(),
            Some(SourcesField::Raw(raw)) => match serde_json::from_slice(&raw.to_bytes()) {
                Ok(sources) => sources,
                Err(_) => return Ok(result),
            },
        };
        let mut changed = false;
        for source in sources.iter_mut().flatten() {
            if let Some(new_source) = rewrite(source)? {
                *source = new_source;
                changed = true;
            }
        }
        if changed {
            result.sources = Some(SourcesField::Rewritten(sources));
        }
        Ok(result)
    }

    /// Serializes the map. Field order matches `swc_sourcemap`'s serializer; `sourcesContent`
    /// and `mappings` ropes are shared, not copied, into the result.
    pub fn to_rope(&self) -> Rope {
        let mut builder = RopeBuilder::default();
        let mut first = true;
        builder += "{";
        self.write_head(&mut builder, &mut first);
        self.write_tail(&mut builder, &mut first);
        builder += "}";
        builder.build()
    }

    /// Whether the map has any of the head fields, see [`StructuredSourceMap::split`].
    fn has_head(&self) -> bool {
        self.version.is_some() || self.file.is_some() || self.sources.is_some()
    }

    /// A copy of the map's head fields (`version`, `file`, `sources`) only.
    fn head_fields(&self) -> StructuredSourceMap {
        StructuredSourceMap {
            version: self.version.clone(),
            file: self.file.clone(),
            sources: self.sources.clone(),
            ..Default::default()
        }
    }

    /// A `sourcesContent` value with a `null` entry for each of the map's sources (`None` if
    /// `sources` can't be decoded), to stand in for shared contents left out of the map.
    ///
    /// Leaving the field out entirely would change how the map is read: flattening an index map
    /// (`swc_sourcemap`'s `flatten`) drops the sources of sections without contents.
    pub fn contents_placeholder(&self) -> Option<Rope> {
        let count = match self.sources.as_ref()? {
            SourcesField::Rewritten(sources) => sources.len(),
            SourcesField::Raw(raw) => serde_json::from_slice::<Vec<&RawValue>>(&raw.to_bytes())
                .ok()?
                .len(),
        };
        let mut placeholder = String::with_capacity(2 + count * 5);
        placeholder.push('[');
        for i in 0..count {
            if i > 0 {
                placeholder.push(',');
            }
            placeholder.push_str("null");
        }
        placeholder.push(']');
        Some(Rope::from(placeholder))
    }

    /// Splits the map into its head (`version`, `file` and `sources`, the fields that come
    /// first in the serialized form) and the serialized bytes of everything after them (the
    /// tail, through the closing `}`).
    ///
    /// `head.head_to_rope()` followed by the tail is exactly `self.to_rope()`. Rewriting the
    /// head's `sources` (see [`StructuredSourceMap::rewrite_sources`]) doesn't change which head
    /// fields are present, so the tail also completes a rewritten head: maps that only differ in
    /// `sources` (e.g. one module's map rewritten for several chunking contexts) can share it.
    pub fn split(self) -> (StructuredSourceMap, Rope) {
        let mut builder = RopeBuilder::default();
        let mut first = !self.has_head();
        self.write_tail(&mut builder, &mut first);
        builder += "}";
        let head = StructuredSourceMap {
            version: self.version,
            file: self.file,
            sources: self.sources,
            ..Default::default()
        };
        (head, builder.build())
    }

    /// Serializes the head of a map split by [`StructuredSourceMap::split`]: the opening `{` and
    /// the head fields, to be followed by the tail.
    pub fn head_to_rope(&self) -> Rope {
        debug_assert!(
            !self.has_tail(),
            "head_to_rope is only meant for a split head"
        );
        let mut builder = RopeBuilder::default();
        let mut first = true;
        builder += "{";
        self.write_head(&mut builder, &mut first);
        builder.build()
    }

    /// Whether the map has any of the fields that [`StructuredSourceMap::split`] moves to the
    /// tail.
    fn has_tail(&self) -> bool {
        let mut builder = RopeBuilder::default();
        let mut first = true;
        self.write_tail(&mut builder, &mut first);
        !first
    }

    /// Writes the head fields (`version`, `file`, `sources`), see [`StructuredSourceMap::split`].
    fn write_head(&self, builder: &mut RopeBuilder, first: &mut bool) {
        write_field(builder, first, "version", self.version.as_ref());
        write_field(builder, first, "file", self.file.as_ref());
        match &self.sources {
            None => {}
            Some(SourcesField::Raw(raw)) => {
                write_field(builder, first, "sources", Some(raw));
            }
            Some(SourcesField::Rewritten(sources)) => {
                if !*first {
                    *builder += ",";
                }
                *first = false;
                *builder += "\"sources\":";
                *builder += &Rope::from(
                    serde_json::to_vec(sources).expect("string serialization is infallible"),
                );
            }
        }
    }

    /// Writes every field after the head fields, without the closing `}`.
    fn write_tail(&self, builder: &mut RopeBuilder, first: &mut bool) {
        self.write_before_contents(builder, first);
        match &self.sources_content {
            None => {}
            Some(SourcesContentField::Raw(raw)) => {
                write_field(builder, first, "sourcesContent", Some(raw));
            }
            Some(SourcesContentField::Escaped(contents)) => {
                if !*first {
                    *builder += ",";
                }
                *first = false;
                *builder += "\"sourcesContent\":[";
                for (i, content) in contents.iter().enumerate() {
                    if i > 0 {
                        *builder += ",";
                    }
                    *builder += content;
                }
                *builder += "]";
            }
        }
        self.write_after_contents(builder, first);
    }

    /// Like [`StructuredSourceMap::write_tail`], but into a [`CellRope`], with each escaped
    /// `sourcesContent` entry that has a file in `source_refs` (by index) written as a reference
    /// to that file's content instead of a copy.
    fn write_tail_cells(
        &self,
        builder: &mut CellRopeBuilder,
        first: &mut bool,
        source_refs: &[Option<ResolvedVc<FileContent>>],
    ) {
        let mut before = RopeBuilder::default();
        self.write_before_contents(&mut before, first);
        builder.concat(&before.build());
        match &self.sources_content {
            Some(SourcesContentField::Escaped(contents)) => {
                if !*first {
                    *builder += ",";
                }
                *first = false;
                write_contents_cells(builder, contents, source_refs);
            }
            Some(SourcesContentField::Raw(raw)) => {
                let mut raw_field = RopeBuilder::default();
                write_field(&mut raw_field, first, "sourcesContent", Some(raw));
                builder.concat(&raw_field.build());
            }
            None => {}
        }
        let mut after = RopeBuilder::default();
        self.write_after_contents(&mut after, first);
        builder.concat(&after.build());
    }

    /// Writes `sourceRoot`, the only field between the head and `sourcesContent`.
    fn write_before_contents(&self, builder: &mut RopeBuilder, first: &mut bool) {
        write_field(builder, first, "sourceRoot", self.source_root.as_ref());
    }

    /// Writes every field after `sourcesContent`, without the closing `}`.
    fn write_after_contents(&self, builder: &mut RopeBuilder, first: &mut bool) {
        write_field(builder, first, "sections", self.sections.as_ref());
        write_field(builder, first, "names", self.names.as_ref());
        write_field(builder, first, "scopes", self.scopes.as_ref());
        write_field(
            builder,
            first,
            "rangeMappings",
            self.range_mappings.as_ref(),
        );
        write_field(builder, first, "mappings", self.mappings.as_ref());
        write_field(builder, first, "ignoreList", self.ignore_list.as_ref());
        write_field(
            builder,
            first,
            "x_facebook_offsets",
            self.x_facebook_offsets.as_ref(),
        );
        write_field(
            builder,
            first,
            "x_metro_module_paths",
            self.x_metro_module_paths.as_ref(),
        );
        write_field(
            builder,
            first,
            "x_facebook_sources",
            self.x_facebook_sources.as_ref(),
        );
        write_field(builder, first, "debug_id", self.debug_id_old.as_ref());
        write_field(builder, first, "debugId", self.debug_id.as_ref());
    }

    /// Whether [`StructuredSourceMap::write_tail_parts`] stores `sourcesContent` as its own part.
    ///
    /// That needs a head (so that the part, and the rest after it, start with a comma whether
    /// or not `sourcesContent` is left out), no `sourceRoot` (the only field between them) and
    /// escaped contents: those are exactly what a decoder re-serializes them to, so a map
    /// computed from this one without its contents can take them back as they are (see
    /// [`SectionMap::SharedContents`]).
    fn has_shareable_contents(&self) -> bool {
        self.has_head()
            && self.source_root.is_none()
            && matches!(self.sources_content, Some(SourcesContentField::Escaped(_)))
    }

    /// Serializes everything after the head fields (see [`StructuredSourceMap::split`]), as a
    /// `sourcesContent` part (`,"sourcesContent":[...]`) and the rest (through the closing `}`),
    /// or as just the rest (including any `sourcesContent`) if the contents can't be shared on
    /// their own (see [`StructuredSourceMap::has_shareable_contents`]).
    ///
    /// Escaped `sourcesContent` entries with a file in `source_refs` (by index) reference that
    /// file's content instead of copying it.
    fn write_tail_parts(
        &self,
        source_refs: &[Option<ResolvedVc<FileContent>>],
    ) -> (Option<CellRope>, CellRope) {
        if let (true, Some(SourcesContentField::Escaped(contents))) =
            (self.has_shareable_contents(), &self.sources_content)
        {
            let mut contents_builder = CellRopeBuilder::default();
            contents_builder += ",";
            write_contents_cells(&mut contents_builder, contents, source_refs);
            let mut rest = RopeBuilder::default();
            let mut first = false;
            self.write_after_contents(&mut rest, &mut first);
            rest += "}";
            let mut rest_builder = CellRopeBuilder::default();
            rest_builder.concat(&rest.build());
            (Some(contents_builder.build()), rest_builder.build())
        } else {
            let mut rest = CellRopeBuilder::default();
            let mut first = !self.has_head();
            self.write_tail_cells(&mut rest, &mut first, source_refs);
            rest += "}";
            (None, rest.build())
        }
    }

    /// Serializes everything after the head fields except `sourcesContent`, through the closing
    /// `}`, for a map with shareable contents (or none): what follows [`SharedMapPart`] contents
    /// taken from another map in a [`SectionMap::SharedContents`] map.
    fn rest_without_contents(&self) -> Rope {
        let mut rest = RopeBuilder::default();
        let mut first = !self.has_head();
        self.write_after_contents(&mut rest, &mut first);
        rest += "}";
        rest.build()
    }

    /// Converts this map, computed from a map whose `sourcesContent` was left out, into a
    /// [`SectionMap::SharedContents`] map taking `contents` back from that map, if that results
    /// in exactly the bytes this map would have had with the contents.
    ///
    /// That's the case if this map has the same head (`version`, `file`, `sources`, as
    /// `expected_head`, see [`StructuredSourceMap::head_to_rope`]) as the map `contents` comes
    /// from, no `sourceRoot` and no `sourcesContent` of its own other than the all-`null`
    /// placeholder its input had instead (see [`StructuredSourceMap::contents_placeholder`]):
    /// the contents belong to the same sources then, in the same order. Returns `None` otherwise.
    pub fn with_shared_contents(
        &self,
        expected_head: &Rope,
        contents: SharedMapPart,
    ) -> Option<SectionMap> {
        let prefix = self.shared_contents_prefix(expected_head)?;
        Some(SectionMap::SharedContents {
            prefix,
            contents,
            suffix: self.rest_without_contents(),
        })
    }

    /// The opening `{` and head fields of this map, if it can take back the contents of a map
    /// with `expected_head`, see [`StructuredSourceMap::with_shared_contents`].
    fn shared_contents_prefix(&self, expected_head: &Rope) -> Option<Rope> {
        if self.source_root.is_some() || !self.has_head() {
            return None;
        }
        // The map's own contents can only be the placeholder its input had instead (see
        // `StructuredSourceMap::contents_placeholder`).
        match &self.sources_content {
            None => {}
            Some(SourcesContentField::Raw(raw))
                if Some(raw) == self.contents_placeholder().as_ref() => {}
            Some(_) => return None,
        }
        let mut prefix = RopeBuilder::default();
        let mut first = true;
        prefix += "{";
        self.write_head(&mut prefix, &mut first);
        let prefix = prefix.build();
        (prefix == *expected_head).then_some(prefix)
    }
}

/// Writes `"sourcesContent":[...]` (without a leading comma) into `builder`, with each entry that
/// has a file in `source_refs` (by index) as a reference to the file's content.
fn write_contents_cells(
    builder: &mut CellRopeBuilder,
    contents: &[Rope],
    source_refs: &[Option<ResolvedVc<FileContent>>],
) {
    *builder += "\"sourcesContent\":[";
    for (i, content) in contents.iter().enumerate() {
        if i > 0 {
            *builder += ",";
        }
        match source_refs.get(i).copied().flatten() {
            Some(file) => builder.push_escaped_file_content(file),
            None => builder.concat(content),
        }
    }
    *builder += "]";
}

/// Writes `"key":value` (preceded by a comma unless it's the first field), if there is a value.
///
/// `key` is a literal identifier and `raw_json` holds a complete, valid JSON value (parsed as
/// `RawValue` or produced by `serde_json` serialization), so neither needs escaping here.
fn write_field(
    builder: &mut RopeBuilder,
    first: &mut bool,
    key: &'static str,
    raw_json: Option<&Rope>,
) {
    if let Some(value) = raw_json {
        if !*first {
            *builder += ",";
        }
        *first = false;
        *builder += "\"";
        *builder += key;
        *builder += "\":";
        *builder += value;
    }
}

impl DeterministicHash for StructuredSourceMap {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        // Hashing the serialized form covers every field.
        self.to_rope().deterministic_hash(state);
    }
}

/// A [`StructuredSourceMap`] split by [`StructuredSourceMap::split`]: its head, and the
/// serialized tail in [`CellRope`] cells owned by the task that created them.
///
/// A module's map is stored like this so that the maps derived from it, which only rewrite
/// `sources` (one per chunking context the module's factory is generated for), can reference
/// the tail instead of each persisting a copy of it (see [`SectionMap::Split`]). The tail is most
/// of a map's bytes: `sourcesContent`, `names` and `mappings`.
///
/// The tail is stored as two cells where possible: `contents` (`,"sourcesContent":[...]`) and
/// `rest` (everything after it). Maps computed from this one that keep its sources but change
/// everything else (e.g. a minified factory's map) can then reference the contents as well, see
/// [`SectionMap::SharedContents`]. Contents entries can reference the source files' content
/// instead of copying the (escaped) text, see [`SplitSourceMap::new_with_source_contents`].
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub struct SplitSourceMap {
    head: StructuredSourceMap,
    contents: Option<ResolvedVc<CellRope>>,
    rest: ResolvedVc<CellRope>,
}

impl SplitSourceMap {
    /// Splits `map`, storing its tail in new cells of the current task.
    pub fn new(map: StructuredSourceMap) -> Self {
        Self::new_with_source_contents(map, &[])
    }

    /// Like [`SplitSourceMap::new`], but each `sourcesContent` entry that has a file in
    /// `source_refs` (by index, see [`StructuredSourceMap::from_swc_map_with_sources`]) is stored
    /// as a reference to that file's content, escaped when the map is read, instead of a copy.
    ///
    /// The file's content must be exactly the text the entry (and the map's mappings) were
    /// generated from. Pass the file content cell the parsed source was read from: when the file
    /// changes, the task that generated the map depends on that cell and is recomputed, so a
    /// strongly consistent read never pairs the map with another version of the text. Sources
    /// parsed from other bytes (e.g. a last successful source) must not be referenced.
    pub fn new_with_source_contents(
        map: StructuredSourceMap,
        source_refs: &[Option<ResolvedVc<FileContent>>],
    ) -> Self {
        let (contents, rest) = map.write_tail_parts(source_refs);
        let head = map.head_fields();
        SplitSourceMap {
            head,
            contents: contents.map(|contents| contents.resolved_cell()),
            rest: rest.resolved_cell(),
        }
    }

    /// The head fields (`version`, `file` and `sources`).
    pub fn head(&self) -> &StructuredSourceMap {
        &self.head
    }

    /// The cell holding the serialized `sourcesContent` (preceded by a comma), if it's stored
    /// on its own.
    pub fn contents(&self) -> Option<ResolvedVc<CellRope>> {
        self.contents
    }

    /// The cell holding the rest of the serialized tail, after the contents (if stored on their
    /// own), through the closing `}`.
    pub fn rest(&self) -> ResolvedVc<CellRope> {
        self.rest
    }

    /// A section map with `head` (this map's head, possibly with rewritten `sources`) followed
    /// by this map's tail. Reads the tail.
    pub async fn to_section_map(&self, head: StructuredSourceMap) -> Result<SectionMap> {
        debug_assert_eq!(head.has_head(), self.head.has_head());
        let contents = match self.contents {
            Some(contents) => Some(SharedMapPart::read(contents).await?),
            None => None,
        };
        Ok(SectionMap::Split {
            head: Box::new(head),
            contents,
            rest: SharedMapPart::read(self.rest).await?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Asserts that `map`'s split head and tail reassemble into `map.to_rope()`, and that the
    /// tail also completes the head with rewritten `sources`.
    fn assert_split_reassembles(map: StructuredSourceMap) -> Result<()> {
        let expected = map.to_rope().to_bytes().to_vec();
        let rewritten = map.rewrite_sources(|source| Ok(Some(format!("rewritten/{source}"))))?;
        let rewritten_expected = rewritten.to_rope().to_bytes().to_vec();

        let (head, tail) = map.split();
        let mut joined = head.head_to_rope().to_bytes().to_vec();
        joined.extend_from_slice(&tail.to_bytes());
        assert_eq!(joined, expected);

        let rewritten_head =
            head.rewrite_sources(|source| Ok(Some(format!("rewritten/{source}"))))?;
        let mut joined = rewritten_head.head_to_rope().to_bytes().to_vec();
        joined.extend_from_slice(&tail.to_bytes());
        assert_eq!(joined, rewritten_expected);
        Ok(())
    }

    #[test]
    fn split_reassembles_swc_maps() -> Result<()> {
        let mut builder = swc_sourcemap::SourceMapBuilder::new(Some("out.js".into()));
        let src_a = builder.add_source("turbopack:///[project]/a.js".into());
        let src_b = builder.add_source("turbopack:///[project]/dir/b\u{2028}c\"d\\e.js".into());
        builder.set_source_contents(
            src_a,
            Some("let a = 1;\r\nconsole.log(\"hi\\n\", '\u{1F980}', `\u{2028}\u{0000}`);".into()),
        );
        builder.set_source_contents(src_b, None);
        let name = builder.add_name("console".into());
        builder.add_raw(0, 0, 0, 0, Some(src_a), Some(name), false);
        builder.add_raw(0, 10, 1, 0, Some(src_b), None, false);
        assert_split_reassembles(StructuredSourceMap::from_swc_map(builder.into_sourcemap())?)?;

        // Without any source contents.
        let mut builder = swc_sourcemap::SourceMapBuilder::new(None);
        let src = builder.add_source("turbopack:///[project]/a.js".into());
        builder.add_raw(0, 0, 0, 0, Some(src), None, false);
        assert_split_reassembles(StructuredSourceMap::from_swc_map(builder.into_sourcemap())?)
    }

    #[test]
    fn split_reassembles_external_maps() -> Result<()> {
        for input in [
            // Verbatim `sources` and `sourcesContent`, including a lone surrogate escape.
            r#"{"version":3,"sources":["a.js"],"sourcesContent":["x\ud800y"],"names":[],"mappings":"AAAA","ignoreList":[0]}"#,
            // Undecodable `sources` (kept verbatim by a rewrite).
            r#"{"version":3,"sources":["\ud800"],"names":[],"mappings":"AAAA"}"#,
            // No `sources`.
            r#"{"version":3,"file":"out.js","names":[],"mappings":""}"#,
            // No head field at all: the tail starts the object (not in serialization order).
            r#"{"names":[],"mappings":"AAAA"}"#,
            // Only head fields: the tail is just the closing brace.
            r#"{"version":3,"sources":["a.js"]}"#,
            // An index map.
            r#"{"version":3,"sections":[{"offset":{"line":0,"column":0},"map":{"version":3,"sources":["a.js"],"names":[],"mappings":"AAAA"}}]}"#,
            // Every field, in serialization order.
            r#"{"version":3,"file":"out.js","sources":["a.js"],"sourceRoot":"/root","sourcesContent":["x"],"sections":[],"names":["n"],"scopes":"s","rangeMappings":"r","mappings":"AAAA","ignoreList":[0],"x_facebook_offsets":[0],"x_metro_module_paths":["m"],"x_facebook_sources":[null],"debug_id":"old","debugId":"new"}"#,
        ] {
            let map = StructuredSourceMap::from_json(&Rope::from(input))?;
            assert_eq!(map.to_rope().to_bytes().as_ref(), input.as_bytes());
            assert_split_reassembles(map)?;
        }
        Ok(())
    }

    /// `to_rope(from_swc_map(m))` must be byte-identical to `m.to_writer()` — this pins the
    /// emitter to `swc_sourcemap`'s format so emitted maps (and snapshot fixtures) don't change.
    #[test]
    fn golden_matches_swc_serializer() -> Result<()> {
        let mut builder = swc_sourcemap::SourceMapBuilder::new(None);
        let src_a = builder.add_source("turbopack:///[project]/a.js".into());
        let src_b = builder.add_source("turbopack:///[project]/dir/b\u{2028}c\"d\\e.js".into());
        builder.set_source_contents(
            src_a,
            Some("let a = 1;\nconsole.log(\"hi\\n\", '\u{1F980}', `\u{2028}\u{0000}`);".into()),
        );
        builder.set_source_contents(src_b, None);
        let name = builder.add_name("console".into());
        builder.add_raw(0, 0, 0, 0, Some(src_a), Some(name), false);
        builder.add_raw(0, 10, 1, 0, Some(src_b), None, false);
        let map = builder.into_sourcemap();

        let mut expected = Vec::new();
        map.clone().to_writer(&mut expected)?;

        let structured = StructuredSourceMap::from_swc_map(map)?;
        assert_eq!(structured.to_rope().to_bytes().as_ref(), &expected[..]);
        Ok(())
    }

    /// Same, for a map without any source contents.
    #[test]
    fn golden_matches_swc_serializer_no_contents() -> Result<()> {
        let mut builder = swc_sourcemap::SourceMapBuilder::new(None);
        let src = builder.add_source("turbopack:///[project]/a.js".into());
        builder.add_raw(0, 0, 0, 0, Some(src), None, false);
        let map = builder.into_sourcemap();

        let mut expected = Vec::new();
        map.clone().to_writer(&mut expected)?;

        let structured = StructuredSourceMap::from_swc_map(map)?;
        assert_eq!(structured.to_rope().to_bytes().as_ref(), &expected[..]);
        Ok(())
    }

    /// `from_json` → `to_rope` round-trips maps produced by serde-style serializers.
    #[test]
    fn roundtrips_serialized_map() -> Result<()> {
        let input = r#"{"version":3,"sources":["a.js",null],"sourcesContent":["let a = \"x\";\n",null],"names":["a"],"mappings":"AAAA"}"#;
        let structured = StructuredSourceMap::from_json(&Rope::from(input))?;
        assert_eq!(structured.to_rope().to_bytes().as_ref(), input.as_bytes());
        Ok(())
    }

    /// External maps may contain JSON that does not decode into Rust strings — lone surrogate
    /// escapes (produced by transpilers slicing source text mid-code-point) or non-string
    /// entries. These passed through the pre-structured pipeline verbatim and must not become
    /// parse errors or be rewritten.
    #[test]
    fn tolerates_undecodable_sources_and_contents() -> Result<()> {
        let input = r#"{"version":3,"sources":["a.js",7],"sourcesContent":["x\ud800y",42,null],"mappings":"AAAA"}"#;
        let structured = StructuredSourceMap::from_json(&Rope::from(input))?;
        assert_eq!(structured.to_rope().to_bytes().as_ref(), input.as_bytes());
        Ok(())
    }

    /// Non-canonical (but valid) escaping in external maps must round-trip byte-for-byte.
    #[test]
    fn preserves_noncanonical_escaping() -> Result<()> {
        let input =
            r#"{"version":3,"sources":["a\/b.js"],"sourcesContent":["c\/dé"],"mappings":"AAAA"}"#;
        let structured = StructuredSourceMap::from_json(&Rope::from(input))?;
        assert_eq!(structured.to_rope().to_bytes().as_ref(), input.as_bytes());
        Ok(())
    }

    /// A rewrite over a map whose `sources` cannot be decoded leaves the map untouched instead
    /// of failing, matching the previous rewriters which silently skipped unparsable maps.
    #[test]
    fn rewrite_leaves_undecodable_sources_untouched() -> Result<()> {
        let input =
            r#"{"version":3,"sources":[{"weird":1}],"sourcesContent":["text"],"mappings":"AAAA"}"#;
        let structured = StructuredSourceMap::from_json(&Rope::from(input))?;
        let rewritten = structured.rewrite_sources(|_| Ok(Some("nope".to_string())))?;
        assert_eq!(rewritten.to_rope().to_bytes().as_ref(), input.as_bytes());
        Ok(())
    }

    /// A rewrite that changes nothing must keep the map byte-identical (the verbatim `sources`
    /// bytes are retained rather than re-serialized).
    #[test]
    fn noop_rewrite_is_byte_identical() -> Result<()> {
        let input =
            r#"{"version":3,"sources":["a\/b.js"],"sourcesContent":["text"],"mappings":"AAAA"}"#;
        let structured = StructuredSourceMap::from_json(&Rope::from(input))?;
        let rewritten = structured.rewrite_sources(|_| Ok(None))?;
        assert_eq!(rewritten.to_rope().to_bytes().as_ref(), input.as_bytes());
        Ok(())
    }

    /// `from_serialize` must produce exactly what serializing the value and parsing it back
    /// would — including undecodable raw values that swc's lazy decoder passes through.
    #[test]
    fn from_serialize_matches_serialized_roundtrip() -> Result<()> {
        let cases: &[&str] = &[
            r#"{"version":3,"sources":["a.js",7],"sourcesContent":["x\ud800y",42,null],"names":["n"],"mappings":"AAAA"}"#,
            r#"{"version":3,"sources":[],"mappings":""}"#,
            r#"{"version":3,"file":"out.js","sources":["a\/b.js"],"sourceRoot":"","sourcesContent":["c\/d"],"names":[],"mappings":"AAAA;;AACA","ignoreList":[0]}"#,
        ];
        for case in cases {
            let lazy = swc_sourcemap::lazy::decode(case.as_bytes())?.into_source_map()?;
            let raw = lazy.into_raw_sourcemap();
            let expected = serde_json::to_vec(&raw)?;
            let split = StructuredSourceMap::from_serialize(&raw)?;
            assert_eq!(
                split.to_rope().to_bytes().as_ref(),
                &expected[..],
                "case: {case}"
            );
            let reparsed = StructuredSourceMap::from_json_slice(&expected)?;
            assert_eq!(split, reparsed, "field-level equality, case: {case}");
        }
        Ok(())
    }

    #[test]
    fn rewrite_sources_keeps_contents_shared() -> Result<()> {
        let input = r#"{"version":3,"sources":["turbopack:///[project]/a.js"],"sourcesContent":["text"],"mappings":"AAAA"}"#;
        let structured = StructuredSourceMap::from_json(&Rope::from(input))?;
        let rewritten = structured.rewrite_sources(|source| {
            Ok(source
                .strip_prefix("turbopack:///[project]/")
                .map(|rest| format!("file:///root/{rest}")))
        })?;
        let json: serde_json::Value = serde_json::from_slice(&rewritten.to_rope().to_bytes())?;
        assert_eq!(json["sources"][0], "file:///root/a.js");
        assert_eq!(json["sourcesContent"][0], "text");
        Ok(())
    }

    /// A map computed without its input's contents takes them back only if it has the input's
    /// head (same `version`/`file`/`sources`), no `sourceRoot`, and no contents of its own other
    /// than the all-`null` placeholder.
    #[test]
    fn shared_contents_reuse_condition() -> Result<()> {
        let head = Rope::from(r#"{"version":3,"sources":["a.js","b.js"]"#);
        let map = |json: &str| StructuredSourceMap::from_json(&Rope::from(json.to_string()));
        let can =
            |json: &str| -> Result<bool> { Ok(map(json)?.shared_contents_prefix(&head).is_some()) };
        // Same head; no contents, or the placeholder.
        assert!(can(
            r#"{"version":3,"sources":["a.js","b.js"],"names":[],"mappings":"AAAA"}"#
        )?);
        assert!(can(
            r#"{"version":3,"sources":["a.js","b.js"],"sourcesContent":[null,null],"names":[],"mappings":"AAAA"}"#
        )?);
        // Different, reordered or fewer sources.
        assert!(!can(
            r#"{"version":3,"sources":["b.js","a.js"],"mappings":"AAAA"}"#
        )?);
        assert!(!can(
            r#"{"version":3,"sources":["a.js"],"mappings":"AAAA"}"#
        )?);
        // A `file` the input didn't have.
        assert!(!can(
            r#"{"version":3,"file":"x.js","sources":["a.js","b.js"],"mappings":"AAAA"}"#
        )?);
        // A `sourceRoot`.
        assert!(!can(
            r#"{"version":3,"sources":["a.js","b.js"],"sourceRoot":"/","mappings":"AAAA"}"#
        )?);
        // Contents of its own (not the placeholder).
        assert!(!can(
            r#"{"version":3,"sources":["a.js","b.js"],"sourcesContent":["x",null],"mappings":"AAAA"}"#
        )?);
        assert!(!can(
            r#"{"version":3,"sources":["a.js","b.js"],"sourcesContent":[null],"mappings":"AAAA"}"#
        )?);
        // No head at all (e.g. an index map).
        assert!(!can(r#"{"sections":[]}"#)?);
        Ok(())
    }

    /// The tail parts (the shareable `sourcesContent` part and the rest, or the rest alone)
    /// complete the head into exactly `to_rope()`, for every field.
    #[tokio::test]
    async fn tail_parts_reassemble_every_field() -> Result<()> {
        for source_root in ["", r#""sourceRoot":"/root","#] {
            let input = format!(
                r#"{{"version":3,"file":"out.js","sources":["a.js"],{source_root}"sections":[],"names":["n"],"scopes":"s","rangeMappings":"r","mappings":"AAAA","ignoreList":[0],"x_facebook_offsets":[0],"x_metro_module_paths":["m"],"x_facebook_sources":[null],"debug_id":"old","debugId":"new"}}"#
            );
            let mut map = StructuredSourceMap::from_json(&Rope::from(input))?;
            map.sources_content = Some(SourcesContentField::Escaped(vec![escape_content(Some(
                "x\u{0}\"",
            ))]));
            let (contents, rest) = map.write_tail_parts(&[]);
            assert_eq!(contents.is_some(), source_root.is_empty());
            let mut joined = map.head_fields().head_to_rope().to_bytes().to_vec();
            if let Some(contents) = contents {
                joined.extend_from_slice(&contents.read().await?.to_bytes());
            }
            joined.extend_from_slice(&rest.read().await?.to_bytes());
            assert_eq!(joined, map.to_rope().to_bytes().to_vec());
        }
        Ok(())
    }
}
