//! This is forked from rust-sourcemap crate.
//!
//! https://github.com/getsentry/rust-sourcemap/tree/696899f4ca92f1fc133237c74ca1a54cf7448e49
//!
//! We skip deserializing all the fields that we don't need. (unlike the original crate)

use std::{
    collections::{BTreeSet, HashMap},
    io,
};

use bitvec::{field::BitField, order::Lsb0, vec::BitVec};
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use sourcemap::{RawToken, vlq::parse_vlq_segment};

#[derive(Serialize, Deserialize, Debug)]
pub struct RawSourceMap<'a> {
    #[serde(borrow)]
    pub version: &'a RawValue,
    #[serde(default, borrow)]
    pub file: Option<&'a RawValue>,
    #[serde(borrow)]
    pub sources: &'a RawValue,
    #[serde(default, borrow)]
    pub source_root: Option<&'a RawValue>,
    #[serde(borrow)]
    pub sources_content: &'a RawValue,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sections: Option<Vec<RawSection<'a>>>,
    #[serde(borrow)]
    pub names: &'a RawValue,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range_mappings: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mappings: Option<String>,
    #[serde(default, borrow)]
    pub ignore_list: Option<&'a RawValue>,
}

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone, Copy)]
pub struct RawSectionOffset {
    pub line: u32,
    pub column: u32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RawSection<'a> {
    pub offset: RawSectionOffset,
    #[serde(borrow)]
    pub url: Option<&'a RawValue>,
    #[serde(borrow)]
    pub map: Option<&'a RawValue>,
}

#[derive(Debug)]
pub enum DecodedMap<'a> {
    Regular(SourceMap<'a>),
    Index(SourceMapIndex<'a>),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MaybeRawValue<'a, T> {
    RawValue(#[serde(borrow)] &'a RawValue),
    Data(T),
}

impl<'a, T> MaybeRawValue<'a, T>
where
    T: Deserialize<'a>,
{
    pub fn into_data(self) -> T {
        match self {
            MaybeRawValue::RawValue(s) => {
                serde_json::from_str(s.get()).expect("Failed to convert RawValue to Data")
            }
            MaybeRawValue::Data(data) => data,
        }
    }
}

impl<'a, T> Default for MaybeRawValue<'a, T>
where
    T: Default,
{
    fn default() -> Self {
        MaybeRawValue::Data(T::default())
    }
}

#[derive(Debug)]
pub(crate) struct SourceMap<'a> {
    file: Option<&'a RawValue>,
    tokens: Vec<RawToken>,
    names: MaybeRawValue<'a, Vec<&'a RawValue>>,
    source_root: Option<&'a RawValue>,
    sources: MaybeRawValue<'a, Vec<&'a RawValue>>,
    sources_prefixed: Option<&'a RawValue>,
    sources_content: MaybeRawValue<'a, Vec<Option<&'a RawValue>>>,
    ignore_list: Option<MaybeRawValue<'a, BTreeSet<u32>>>,
}

#[derive(Debug)]
pub struct SourceMapBuilder<'a> {
    file: Option<&'a RawValue>,
    name_map: HashMap<&'a str, u32>,
    names: Vec<&'a RawValue>,
    tokens: Vec<RawToken>,
    source_map: HashMap<&'a str, u32>,
    sources: Vec<&'a RawValue>,
    source_contents: Vec<Option<&'a RawValue>>,
    source_root: Option<&'a RawValue>,
    ignore_list: Option<BTreeSet<u32>>,
}

impl<'a> SourceMapBuilder<'a> {
    pub fn new(file: Option<&'a RawValue>) -> Self {
        SourceMapBuilder {
            file,
            name_map: HashMap::new(),
            names: Vec::new(),
            tokens: Vec::new(),
            source_map: HashMap::new(),
            sources: Vec::new(),
            source_contents: Vec::new(),
            source_root: None,
            ignore_list: None,
        }
    }

    pub fn add_source(&mut self, src_raw: &'a RawValue) -> u32 {
        let src_str = src_raw.get(); // RawValue provides get() -> &str
        let count = self.sources.len() as u32;
        let id = *self.source_map.entry(src_str).or_insert(count);
        if id == count {
            // New source
            self.sources.push(src_raw);
            // Ensure source_contents has a corresponding entry, defaulting to None.
            // This logic ensures source_contents is always same length as sources if new one added.
            self.source_contents.resize(self.sources.len(), None);
        }
        id
    }

    pub fn add_name(&mut self, name_raw: &'a RawValue) -> u32 {
        let name_str = name_raw.get();
        let count = self.names.len() as u32;
        let id = *self.name_map.entry(name_str).or_insert(count);
        if id == count {
            // New name
            self.names.push(name_raw);
        }
        id
    }

    pub fn set_source_contents(&mut self, src_id: u32, contents: Option<&'a RawValue>) {
        // Ensure source_contents is large enough. src_id is 0-indexed.
        if (src_id as usize) >= self.source_contents.len() {
            self.source_contents.resize(src_id as usize + 1, None);
        }
        self.source_contents[src_id as usize] = contents;
    }

    pub fn add_raw_token(
        &mut self,
        dst_line: u32,
        dst_col: u32,
        src_line: u32,
        src_col: u32,
        src_id: Option<u32>,
        name_id: Option<u32>,
        is_range: bool,
    ) -> RawToken {
        let token = RawToken {
            dst_line,
            dst_col,
            src_line,
            src_col,
            src_id: src_id.unwrap_or(!0), // Use !0 as sentinel for None, common in sourcemap crate
            name_id: name_id.unwrap_or(!0),
            is_range,
        };
        self.tokens.push(token);
        token
    }

    pub fn add_to_ignore_list(&mut self, src_id: u32) {
        self.ignore_list
            .get_or_insert_with(BTreeSet::new)
            .insert(src_id);
    }

    pub fn set_source_root(&mut self, source_root: Option<&'a RawValue>) {
        self.source_root = source_root;
    }

    pub fn into_sourcemap(self) -> SourceMap<'a> {
        SourceMap {
            file: self.file,
            tokens: self.tokens,
            names: MaybeRawValue::Data(self.names),
            source_root: self.source_root,
            sources: MaybeRawValue::Data(self.sources),
            sources_prefixed: None,
            sources_content: MaybeRawValue::Data(self.source_contents),
            ignore_list: self.ignore_list.map(MaybeRawValue::Data),
        }
    }

    /// Adds a new mapping to the builder.
    #[allow(clippy::too_many_arguments)]
    pub fn add_raw(
        &mut self,
        dst_line: u32,
        dst_col: u32,
        src_line: u32,
        src_col: u32,
        source: Option<u32>,
        name: Option<u32>,
        is_range: bool,
    ) -> RawToken {
        let src_id = source.unwrap_or(!0);
        let name_id = name.unwrap_or(!0);
        let raw = RawToken {
            dst_line,
            dst_col,
            src_line,
            src_col,
            src_id,
            name_id,
            is_range,
        };
        self.tokens.push(raw);
        raw
    }
}

#[derive(Debug)]
pub struct SourceMapSection<'a> {
    offset: (u32, u32),
    url: Option<MaybeRawValue<'a, String>>,
    map: Option<Box<MaybeRawValue<'a, RawSourceMap<'a>>>>,
}

impl<'a> SourceMapSection<'a> {
    /// Create a new sourcemap index section
    ///
    /// - `offset`: offset as line and column
    /// - `url`: optional URL of where the sourcemap is located
    /// - `map`: an optional already resolved internal sourcemap
    pub fn new(
        offset: (u32, u32),
        url: Option<MaybeRawValue<'a, String>>,
        map: Option<MaybeRawValue<'a, RawSourceMap<'a>>>,
    ) -> SourceMapSection<'a> {
        SourceMapSection {
            offset,
            url,
            map: map.map(Box::new),
        }
    }

    /// Returns the offset line
    pub fn get_offset_line(&self) -> u32 {
        self.offset.0
    }

    /// Returns the offset column
    pub fn get_offset_col(&self) -> u32 {
        self.offset.1
    }

    /// Returns the offset as tuple
    pub fn get_offset(&self) -> (u32, u32) {
        self.offset
    }

    /// Updates the URL for this section.
    pub fn set_url(&mut self, value: Option<&str>) {
        self.url = value.map(str::to_owned).map(MaybeRawValue::Data);
    }
}

#[derive(Debug)]
struct SourceMapIndex<'a> {
    file: Option<&'a RawValue>,
    sections: Vec<SourceMapSection<'a>>,
}

pub fn decode(slice: &[u8]) -> sourcemap::Result<DecodedMap> {
    let content = strip_junk_header(slice)?;
    let rsm: RawSourceMap = serde_json::from_slice(content)?;

    decode_common(rsm)
}

fn decode_common(rsm: RawSourceMap) -> sourcemap::Result<DecodedMap> {
    if rsm.sections.is_some() {
        decode_index(rsm).map(DecodedMap::Index)
    } else {
        decode_regular(rsm).map(DecodedMap::Regular)
    }
}

fn decode_index(rsm: RawSourceMap) -> sourcemap::Result<SourceMapIndex> {
    let mut sections = vec![];

    for raw_section in rsm.sections.unwrap_or_default() {
        sections.push(SourceMapSection::new(
            (raw_section.offset.line, raw_section.offset.column),
            raw_section.url.map(|v| MaybeRawValue::RawValue(v)),
            raw_section.map.map(|v| MaybeRawValue::RawValue(v)),
        ));
    }

    sections.sort_by_key(SourceMapSection::get_offset);

    // file sometimes is not a string for unexplicable reasons
    let file = rsm.file;

    Ok(SourceMapIndex { file, sections })
}

pub fn decode_regular(rsm: RawSourceMap) -> sourcemap::Result<SourceMap> {
    let mut dst_col;

    // Source IDs, lines, columns, and names are "running" values.
    // Each token (except the first) contains the delta from the previous value.
    let mut running_src_id = 0;
    let mut running_src_line = 0;
    let mut running_src_col = 0;
    let mut running_name_id = 0;

    let range_mappings = rsm.range_mappings.unwrap_or_default();
    let mappings = rsm.mappings.unwrap_or_default();
    let allocation_size = mappings.matches(&[',', ';'][..]).count() + 10;
    let mut tokens = Vec::with_capacity(allocation_size);

    let mut nums = Vec::with_capacity(6);
    let mut rmi = BitVec::new();

    for (dst_line, (line, rmi_str)) in mappings
        .split(';')
        .zip(range_mappings.split(';').chain(std::iter::repeat("")))
        .enumerate()
    {
        if line.is_empty() {
            continue;
        }

        dst_col = 0;

        decode_rmi(rmi_str, &mut rmi)?;

        for (line_index, segment) in line.split(',').enumerate() {
            if segment.is_empty() {
                continue;
            }

            nums.clear();
            nums = parse_vlq_segment(segment)?;
            match nums.len() {
                1 | 4 | 5 => {}
                _ => return Err(sourcemap::Error::BadSegmentSize(nums.len() as u32)),
            }

            dst_col = (i64::from(dst_col) + nums[0]) as u32;

            // The source file , source line, source column, and name
            // may not be present in the current token. We use `u32::MAX`
            // as the placeholder for missing values.
            let mut current_src_id = !0;
            let mut current_src_line = !0;
            let mut current_src_col = !0;
            let mut current_name_id = !0;

            if nums.len() > 1 {
                running_src_id = (i64::from(running_src_id) + nums[1]) as u32;

                running_src_line = (i64::from(running_src_line) + nums[2]) as u32;
                running_src_col = (i64::from(running_src_col) + nums[3]) as u32;

                current_src_id = running_src_id;
                current_src_line = running_src_line;
                current_src_col = running_src_col;

                if nums.len() > 4 {
                    running_name_id = (i64::from(running_name_id) + nums[4]) as u32;
                    current_name_id = running_name_id;
                }
            }

            let is_range = rmi.get(line_index).map(|v| *v).unwrap_or_default();

            tokens.push(RawToken {
                dst_line: dst_line as u32,
                dst_col,
                src_line: current_src_line,
                src_col: current_src_col,
                src_id: current_src_id,
                name_id: current_name_id,
                is_range,
            });
        }
    }

    let sm = SourceMap {
        file: rsm.file,
        tokens,
        names: MaybeRawValue::RawValue(rsm.names),
        source_root: rsm.source_root,
        sources: MaybeRawValue::RawValue(rsm.sources),
        sources_prefixed: None,
        sources_content: MaybeRawValue::RawValue(rsm.sources_content),
        ignore_list: rsm.ignore_list.map(MaybeRawValue::RawValue),
    };

    Ok(sm)
}

impl<'a> SourceMap<'a> {
    /// Adjusts the mappings in `self` using the mappings in `adjustment`.
    ///
    /// Here is the intended use case for this function:
    /// * You have a source file (for example, minified JS) `foo.js` and a corresponding sourcemap
    ///   `foo.js.map`.
    /// * You modify `foo.js` in some way and generate a sourcemap `transform.js.map` representing
    ///   this modification. This can be done using `magic-string`, for example.
    /// * You want a sourcemap that is "like" `foo.js.map`, but takes the changes you made to
    ///   `foo.js` into account.
    ///
    /// Then `foo.js.map.adjust_mappings(transform.js.map)` is the desired sourcemap.
    ///
    /// This function assumes that `adjustment` contains no relevant information except for
    /// mappings.  All information about sources and names is copied from `self`.
    ///
    /// Note that the resulting sourcemap will be at most as fine-grained as `self.`.
    pub fn adjust_mappings(&mut self, adjustment: Self) {
        // The algorithm works by going through the tokens in `self` in order and adjusting
        // them depending on the token in `adjustment` they're "covered" by.
        // For example:
        // Let `l` be a token in `adjustment` mapping `(17, 23)` to `(8, 30)` and let
        // `r₁ : (8, 28) -> (102, 35)`, `r₂ : (8, 40) -> (102, 50)`, and
        // `r₃ : (9, 10) -> (103, 12)` be the tokens in `self` that fall in the range of `l`.
        // `l` offsets these tokens by `(+9, -7)`, so `r₁, … , r₃` must be offset by the same
        // amount. Thus, the adjusted sourcemap will contain the tokens
        // `c₁ : (17, 23) -> (102, 35)`, `c₂ : (17, 33) -> (102, 50)`, and
        // `c3 : (18, 3) -> (103, 12)`.
        //
        // Or, in diagram form:
        //
        //    (17, 23)                                    (position in the edited source file)
        //    ↓ l
        //    (8, 30)
        // (8, 28)        (8, 40)        (9, 10)          (positions in the original source file)
        // ↓ r₁           ↓ r₂           ↓ r₃
        // (102, 35)      (102, 50)      (103, 12)        (positions in the target file)
        //
        // becomes
        //
        //    (17, 23)       (17, 33)       (18, 3)       (positions in the edited source file)
        //    ↓ c₁           ↓ c₂           ↓ c₃
        //    (102, 35)      (102, 50)      (103, 12)     (positions in the target file)

        // Helper struct that makes it easier to compare tokens by the start and end
        // of the range they cover.
        #[derive(Debug, Clone, Copy)]
        struct Range<'a> {
            start: (u32, u32),
            end: (u32, u32),
            value: &'a RawToken,
        }

        /// Turns a list of tokens into a list of ranges, using the provided `key` function to
        /// determine the order of the tokens.
        #[allow(clippy::ptr_arg)]
        fn create_ranges(
            tokens: &mut [RawToken],
            key: fn(&RawToken) -> (u32, u32),
        ) -> Vec<Range<'_>> {
            tokens.sort_unstable_by_key(key);

            let mut token_iter = tokens.iter().peekable();
            let mut ranges = Vec::new();

            while let Some(t) = token_iter.next() {
                let start = key(t);
                let next_start = token_iter.peek().map_or((u32::MAX, u32::MAX), |t| key(t));
                // A token extends either to the start of the next token or the end of the line,
                // whichever comes sooner
                let end = std::cmp::min(next_start, (start.0, u32::MAX));
                ranges.push(Range {
                    start,
                    end,
                    value: t,
                });
            }

            ranges
        }

        // Turn `self.tokens` and `adjustment.tokens` into vectors of ranges so we have easy access
        // to both start and end.
        // We want to compare `self` and `adjustment` tokens by line/column numbers in the "original
        // source" file. These line/column numbers are the `dst_line/col` for
        // the `self` tokens and `src_line/col` for the `adjustment` tokens.
        let mut self_tokens = std::mem::take(&mut self.tokens);
        let original_ranges = create_ranges(&mut self_tokens, |t| (t.dst_line, t.dst_col));
        let mut adjustment_tokens = adjustment.tokens.clone();
        let adjustment_ranges = create_ranges(&mut adjustment_tokens, |t| (t.src_line, t.src_col));

        let mut original_ranges_iter = original_ranges.iter();

        let mut original_range = match original_ranges_iter.next() {
            Some(r) => r,
            None => return,
        };

        // Iterate over `adjustment_ranges` (sorted by `src_line/col`). For each such range,
        // consider all `original_ranges` which overlap with it.
        'outer: for &adjustment_range in &adjustment_ranges {
            // The `adjustment_range` offsets lines and columns by a certain amount. All
            // `original_ranges` it covers will get the same offset.
            let (line_diff, col_diff) = (
                adjustment_range.value.dst_line as i32 - adjustment_range.value.src_line as i32,
                adjustment_range.value.dst_col as i32 - adjustment_range.value.src_col as i32,
            );

            // Skip `original_ranges` that are entirely before the `adjustment_range`.
            while original_range.end <= adjustment_range.start {
                match original_ranges_iter.next() {
                    Some(r) => original_range = r,
                    None => break 'outer,
                }
            }

            // At this point `original_range.end` > `adjustment_range.start`

            // Iterate over `original_ranges` that fall at least partially within the
            // `adjustment_range`.
            while original_range.start < adjustment_range.end {
                // If `original_range` started before `adjustment_range`, cut off the token's start.
                let (dst_line, dst_col) =
                    std::cmp::max(original_range.start, adjustment_range.start);
                let mut token = RawToken {
                    dst_line,
                    dst_col,
                    ..*original_range.value
                };

                token.dst_line = (token.dst_line as i32 + line_diff) as u32;
                token.dst_col = (token.dst_col as i32 + col_diff) as u32;

                self.tokens.push(token);

                if original_range.end >= adjustment_range.end {
                    // There are surely no more `original_ranges` for this `adjustment_range`.
                    // Break the loop without advancing the `original_range`.
                    break;
                } else {
                    //  Advance the `original_range`.
                    match original_ranges_iter.next() {
                        Some(r) => original_range = r,
                        None => break 'outer,
                    }
                }
            }
        }

        self.tokens
            .sort_unstable_by_key(|t| (t.dst_line, t.dst_col));
    }
}

impl<'a> SourceMapIndex<'a> {
    pub fn flatten(self) -> sourcemap::Result<SourceMap<'a>> {
        let mut builder = SourceMapBuilder::new(self.file);

        for section in self.sections {
            let (off_line, off_col) = section.get_offset();

            let map = match section.map {
                Some(map) => match decode_common(map.into_data())? {
                    DecodedMap::Regular(sm) => sm,
                    DecodedMap::Index(idx) => idx.flatten()?,
                },
                None => {
                    return Err(sourcemap::Error::CannotFlatten(format!(
                        "Section has an unresolved sourcemap: {}",
                        section
                            .url
                            .map(|v| v.into_data())
                            .as_deref()
                            .unwrap_or("<unknown url>")
                    )));
                }
            };

            let sources = map.sources.into_data();
            let source_contents = map.sources_content.into_data();
            let ignore_list = map.ignore_list.unwrap_or_default().into_data();

            let mut src_id_map = Vec::<u32>::with_capacity(sources.len());

            for (original_id, (source, contents)) in
                sources.into_iter().zip(source_contents).enumerate()
            {
                debug_assert_eq!(original_id, src_id_map.len());
                let src_id = builder.add_source(source);

                src_id_map.push(src_id);

                if let Some(contents) = contents {
                    builder.set_source_contents(src_id, Some(contents));
                }
            }

            let names = map.names.into_data();
            let mut name_id_map = Vec::<u32>::with_capacity(names.len());

            for (original_id, name) in names.into_iter().enumerate() {
                debug_assert_eq!(original_id, name_id_map.len());
                let name_id = builder.add_name(name);
                name_id_map.push(name_id);
            }

            for token in map.tokens {
                let dst_col = if token.dst_line == 0 {
                    token.dst_col + off_col
                } else {
                    token.dst_col
                };

                // Use u32 -> u32 map instead of using the hash map in SourceMapBuilder for better
                // performance
                let original_src_id = token.src_id;
                let src_id = if original_src_id == !0 {
                    None
                } else {
                    src_id_map.get(original_src_id as usize).copied()
                };

                let original_name_id = token.name_id;
                let name_id = if original_name_id == !0 {
                    None
                } else {
                    name_id_map.get(original_name_id as usize).copied()
                };

                let raw = builder.add_raw(
                    token.dst_line + off_line,
                    dst_col,
                    token.src_line,
                    token.src_col,
                    src_id,
                    name_id,
                    token.is_range,
                );

                if ignore_list.contains(&token.src_id) {
                    builder.add_to_ignore_list(raw.src_id);
                }
            }
        }

        Ok(builder.into_sourcemap())
    }
}

pub fn strip_junk_header(slice: &[u8]) -> io::Result<&[u8]> {
    if slice.is_empty() || !is_junk_json(slice[0]) {
        return Ok(slice);
    }
    let mut need_newline = false;
    for (idx, &byte) in slice.iter().enumerate() {
        if need_newline && byte != b'\n' {
            Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "expected newline",
            ))?
        } else if is_junk_json(byte) {
            continue;
        } else if byte == b'\r' {
            need_newline = true;
        } else if byte == b'\n' {
            return Ok(&slice[idx..]);
        }
    }
    Ok(&slice[slice.len()..])
}

fn is_junk_json(byte: u8) -> bool {
    byte == b')' || byte == b']' || byte == b'}' || byte == b'\''
}

/// Decodes range mappping bitfield string into index
fn decode_rmi(rmi_str: &str, val: &mut BitVec<u8, Lsb0>) -> sourcemap::Result<()> {
    val.clear();
    val.resize(rmi_str.len() * 6, false);

    for (idx, &byte) in rmi_str.as_bytes().iter().enumerate() {
        let byte = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => {
                return Err(sourcemap::Error::InvalidBase64(byte as char));
            }
        };

        val[6 * idx..6 * (idx + 1)].store_le::<u8>(byte);
    }

    Ok(())
}
