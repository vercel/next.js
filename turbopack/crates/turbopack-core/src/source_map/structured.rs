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

use std::sync::LazyLock;

use anyhow::Result;
use bincode::{Decode, Encode};
use serde::Deserialize;
use serde_json::value::RawValue;
use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};
use turbo_tasks_fs::rope::{Rope, RopeBuilder};
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher};

/// A single source map in structured form. See the module documentation.
#[derive(Clone, Debug, Default, PartialEq, Eq, Encode, Decode, TraceRawVcs, NonLocalValue)]
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
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TraceRawVcs, NonLocalValue)]
enum SourcesField {
    /// The field's verbatim JSON value.
    Raw(Rope),
    /// Decoded form, produced only by [`StructuredSourceMap::rewrite_sources`] when an entry
    /// changed.
    Rewritten(Vec<Option<String>>),
}

/// The `sourcesContent` field.
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TraceRawVcs, NonLocalValue)]
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
        Some(text) => {
            Rope::from(serde_json::to_vec(text).expect("string serialization is infallible"))
        }
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
    pub fn from_swc_map(mut map: swc_sourcemap::SourceMap) -> Result<Self> {
        let contents: Vec<Rope> = map
            .source_contents()
            .map(|content| escape_content(content.map(|c| c.as_str())))
            .collect();
        let has_contents = contents.iter().any(|c| c.to_bytes().as_ref() != b"null");
        for idx in 0..map.get_source_count() {
            map.set_source_contents(idx, None);
        }
        let mut skeleton = Vec::new();
        map.to_writer(&mut skeleton)?;
        let mut result = Self::from_json_slice(&skeleton)?;
        result.sources_content = has_contents.then_some(SourcesContentField::Escaped(contents));
        Ok(result)
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
        // `key` is a literal identifier and `raw_json` holds a complete, valid JSON value
        // (parsed as `RawValue` or produced by `serde_json` serialization), so neither needs
        // escaping here.
        fn field(
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

        let mut builder = RopeBuilder::default();
        let mut first = true;
        builder += "{";
        field(&mut builder, &mut first, "version", self.version.as_ref());
        field(&mut builder, &mut first, "file", self.file.as_ref());
        match &self.sources {
            None => {}
            Some(SourcesField::Raw(raw)) => {
                field(&mut builder, &mut first, "sources", Some(raw));
            }
            Some(SourcesField::Rewritten(sources)) => {
                if !first {
                    builder += ",";
                }
                first = false;
                builder += "\"sources\":";
                builder += &Rope::from(
                    serde_json::to_vec(sources).expect("string serialization is infallible"),
                );
            }
        }
        field(
            &mut builder,
            &mut first,
            "sourceRoot",
            self.source_root.as_ref(),
        );
        match &self.sources_content {
            None => {}
            Some(SourcesContentField::Raw(raw)) => {
                field(&mut builder, &mut first, "sourcesContent", Some(raw));
            }
            Some(SourcesContentField::Escaped(contents)) => {
                if !first {
                    builder += ",";
                }
                first = false;
                builder += "\"sourcesContent\":[";
                for (i, content) in contents.iter().enumerate() {
                    if i > 0 {
                        builder += ",";
                    }
                    builder += content;
                }
                builder += "]";
            }
        }
        field(&mut builder, &mut first, "sections", self.sections.as_ref());
        field(&mut builder, &mut first, "names", self.names.as_ref());
        field(&mut builder, &mut first, "scopes", self.scopes.as_ref());
        field(
            &mut builder,
            &mut first,
            "rangeMappings",
            self.range_mappings.as_ref(),
        );
        field(&mut builder, &mut first, "mappings", self.mappings.as_ref());
        field(
            &mut builder,
            &mut first,
            "ignoreList",
            self.ignore_list.as_ref(),
        );
        field(
            &mut builder,
            &mut first,
            "x_facebook_offsets",
            self.x_facebook_offsets.as_ref(),
        );
        field(
            &mut builder,
            &mut first,
            "x_metro_module_paths",
            self.x_metro_module_paths.as_ref(),
        );
        field(
            &mut builder,
            &mut first,
            "x_facebook_sources",
            self.x_facebook_sources.as_ref(),
        );
        field(
            &mut builder,
            &mut first,
            "debug_id",
            self.debug_id_old.as_ref(),
        );
        field(&mut builder, &mut first, "debugId", self.debug_id.as_ref());
        builder += "}";
        builder.build()
    }
}

impl DeterministicHash for StructuredSourceMap {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        // Hashing the serialized form covers every field.
        self.to_rope().deterministic_hash(state);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
