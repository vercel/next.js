//! A source map kept in structured form until it is actually emitted.
//!
//! Historically module source maps were serialized to a JSON [`Rope`] immediately after code
//! generation and treated as opaque bytes from then on. Because `sourcesContent` (the full
//! original source text) is inlined into that JSON, every subsequent per-chunking-context
//! rewrite of the `sources` URLs had to copy the entire map — duplicating each module's source
//! text once per layer and again per chunking context — and every embedding of the map into a
//! chunk's source map copied it again.
//!
//! [`StructuredSourceMap`] instead stores the map's fields:
//! - fields we never modify are kept as verbatim raw JSON snippets ([`Rope`]s), so producers' bytes
//!   round-trip untouched and re-emission is pure rope sharing;
//! - `sources` also stays a verbatim snippet until a URL rewrite (see [`super::utils`]) actually
//!   changes an entry — only then is it decoded, so external maps that fail to decode (or are never
//!   rewritten) round-trip byte-for-byte, matching the pre-structured pipeline;
//! - `sourcesContent` of maps built from swc objects is a list of individually pre-escaped
//!   [`Rope`]s that are shared — not copied — into every map that embeds them; for maps parsed from
//!   external bytes it stays a verbatim snippet and is never decoded;
//! - `mappings` stays a raw snippet since it is usually the largest skeleton field.
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

/// Deserialization mirror of [`StructuredSourceMap`]. Unknown fields are dropped, matching the
/// previous behavior of source map rewrites (`SourceMapJson`).
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

    /// Rewrites each `sources` entry, keeping every other field (including the shared
    /// `sourcesContent` ropes) intact. `rewrite` returns `None` to leave an entry unchanged.
    ///
    /// `sources` is only decoded if a rewrite actually changes an entry; if it cannot be decoded
    /// (e.g. non-string entries in an external map) the map is returned unchanged. (The previous
    /// rewriters dropped such maps from the output entirely; keeping the map verbatim loses no
    /// information, and this branch is unreachable for internally generated maps anyway.)
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
        // Hashing the serialized form covers every field and matches the previous behavior of
        // hashing the serialized map rope.
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
