//! Size analysis for Turbopack trace files (`trace-turbopack.bin`).
//!
//! A trace file is a `TRACEv0` magic header followed by a stream of
//! [`postcard`]-serialized [`TraceRow`]s, optionally gzip or zstd compressed.
//! [`TraceSizeAnalyzer`] decodes that stream and attributes the bytes of every
//! row to its row type and span, and the bytes of attributes and strings to
//! their key and kind, so it is possible to see what makes a trace file large.
//!
//! All sizes are sizes of the decompressed stream. For compressed files, the
//! share of the compressed file a row type takes up can differ.

use std::{
    cmp::Reverse,
    fmt::Write as _,
    fs::File,
    io::{self, BufRead, BufReader, Read, Write},
    path::Path,
};

use anyhow::{Context, Result, bail};
use flate2::bufread::MultiGzDecoder;
use rustc_hash::{FxHashMap, FxHashSet};
use turbopack_trace_utils::tracing::{Allocations, TraceRow, TraceValue};

/// The magic bytes at the start of every (uncompressed) trace file.
pub const TRACE_HEADER: &[u8] = b"TRACEv0";

const READ_CHUNK_SIZE: usize = 16 * 1024 * 1024;

/// The variants of [`TraceRow`], in declaration order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RowKind {
    Start,
    End,
    Enter,
    Exit,
    Event,
    Record,
    MemorySample,
}

impl RowKind {
    pub const ALL: [RowKind; 7] = [
        RowKind::Start,
        RowKind::End,
        RowKind::Enter,
        RowKind::Exit,
        RowKind::Event,
        RowKind::Record,
        RowKind::MemorySample,
    ];

    pub fn of(row: &TraceRow<'_>) -> Self {
        match row {
            TraceRow::Start { .. } => RowKind::Start,
            TraceRow::End { .. } => RowKind::End,
            TraceRow::Enter { .. } => RowKind::Enter,
            TraceRow::Exit { .. } => RowKind::Exit,
            TraceRow::Event { .. } => RowKind::Event,
            TraceRow::Record { .. } => RowKind::Record,
            TraceRow::MemorySample { .. } => RowKind::MemorySample,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            RowKind::Start => "Start",
            RowKind::End => "End",
            RowKind::Enter => "Enter",
            RowKind::Exit => "Exit",
            RowKind::Event => "Event",
            RowKind::Record => "Record",
            RowKind::MemorySample => "MemorySample",
        }
    }
}

/// A number of occurrences and the bytes they take up.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Counter {
    pub count: u64,
    pub bytes: u64,
}

impl Counter {
    fn add(&mut self, bytes: u64) {
        self.count += 1;
        self.bytes += bytes;
    }
}

/// Bytes of a single span name (identified by target and name).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SpanStats {
    pub target: String,
    pub name: String,
    /// The `Start` rows of this span.
    pub start: Counter,
    /// All rows referencing an instance of this span after it was started
    /// (`End`, `Enter`, `Exit`, `Record` and `Event`s with this span as parent).
    pub other: Counter,
}

impl SpanStats {
    pub fn total_bytes(&self) -> u64 {
        self.start.bytes + self.other.bytes
    }
}

/// Bytes of a single attribute key across `Start`, `Event` and `Record` rows.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FieldStats {
    pub key: String,
    pub count: u64,
    /// Bytes of the encoded key string.
    pub key_bytes: u64,
    /// Bytes of the encoded value (including the value type tag).
    pub value_bytes: u64,
}

impl FieldStats {
    pub fn total_bytes(&self) -> u64 {
        self.key_bytes + self.value_bytes
    }
}

/// The kinds of strings that are repeated inline in every row.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StringKind {
    SpanName,
    SpanTarget,
    FieldKey,
    StringValue,
}

impl StringKind {
    pub const ALL: [StringKind; 4] = [
        StringKind::SpanName,
        StringKind::SpanTarget,
        StringKind::FieldKey,
        StringKind::StringValue,
    ];

    pub fn name(self) -> &'static str {
        match self {
            StringKind::SpanName => "span name",
            StringKind::SpanTarget => "span target",
            StringKind::FieldKey => "field key",
            StringKind::StringValue => "string value",
        }
    }
}

/// How often strings of a [`StringKind`] are written and how much they would
/// take up if every distinct string were stored only once.
#[derive(Clone, Debug, Default)]
pub struct StringStats {
    pub occurrences: u64,
    /// Encoded bytes (length prefix + UTF-8) of all occurrences.
    pub total_bytes: u64,
    /// Encoded bytes of every distinct string, counted once.
    pub distinct_bytes: u64,
    distinct: FxHashSet<Box<str>>,
}

impl StringStats {
    pub fn distinct_count(&self) -> u64 {
        self.distinct.len() as u64
    }

    /// Bytes spent on repeating a string that was already written before.
    pub fn redundant_bytes(&self) -> u64 {
        self.total_bytes - self.distinct_bytes
    }

    fn add(&mut self, s: &str) {
        let bytes = str_size(s);
        self.occurrences += 1;
        self.total_bytes += bytes;
        if !self.distinct.contains(s) {
            self.distinct.insert(s.into());
            self.distinct_bytes += bytes;
        }
    }
}

/// Bytes of the variable-length parts of the rows that carry strings and
/// attributes. Everything else in those rows (timestamps, ids, the row tag)
/// is the fixed "header" part.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Components {
    pub start_name: u64,
    pub start_target: u64,
    pub start_values: u64,
    pub event_values: u64,
    pub record_values: u64,
    /// The `allocations` field of `Enter` rows (including the `None` tag).
    pub enter_allocations: u64,
    /// The `allocations` field of `Exit` rows (including the `None` tag).
    pub exit_allocations: u64,
}

/// Collects size statistics of a trace file.
#[derive(Default)]
pub struct TraceSizeAnalyzer {
    /// Size of the file on disk (might be compressed), if known.
    pub file_size: Option<u64>,
    /// The compression format that was detected for the file.
    pub compression: Compression,
    /// Size of the decompressed trace stream, including the header.
    pub uncompressed_size: u64,
    /// Bytes of the `TRACEv0` header.
    pub header_bytes: u64,
    /// Bytes at the end of the stream that don't form a complete row (e.g.
    /// when the process was killed while writing the trace).
    pub trailing_bytes: u64,
    pub row_kinds: [Counter; RowKind::ALL.len()],
    pub components: Components,
    spans: Vec<SpanStats>,
    span_index: FxHashMap<Box<str>, FxHashMap<Box<str>, usize>>,
    /// Maps span ids to an index in `spans`. Like the trace server, mappings
    /// are not removed on `End`: rows are written from per-thread buffers, so
    /// rows of another thread might still follow. A reused id overwrites the
    /// mapping on its next `Start`.
    span_ids: FxHashMap<u64, usize>,
    /// Rows referencing a span id whose `Start` hasn't been read yet (it can
    /// be in a buffer of another thread that is flushed later).
    pending: FxHashMap<u64, Counter>,
    fields: Vec<FieldStats>,
    field_index: FxHashMap<Box<str>, usize>,
    strings: [StringStats; StringKind::ALL.len()],
}

/// Name used for rows that reference a span that was never started.
pub const UNKNOWN_SPAN: &str = "<unknown span>";
/// Name used for events that are not inside of any span.
pub const NO_SPAN: &str = "<no span>";

impl TraceSizeAnalyzer {
    pub fn new() -> Self {
        Self::default()
    }

    /// Opens the trace file at `path` (raw, gzip or zstd) and analyzes it.
    pub fn analyze_file(path: &Path) -> Result<Self> {
        let file =
            File::open(path).with_context(|| format!("Unable to open {}", path.display()))?;
        let file_size = file.metadata().ok().map(|m| m.len());
        let mut file = BufReader::with_capacity(1 << 20, file);
        let compression = Compression::detect(file.fill_buf()?);
        let mut analyzer = Self {
            file_size,
            compression,
            ..Default::default()
        };
        match compression {
            Compression::None => analyzer.analyze_reader(file)?,
            Compression::Gzip => analyzer.analyze_reader(MultiGzDecoder::new(file))?,
            Compression::Zstd => analyzer.analyze_reader(zstd::Decoder::with_buffer(file)?)?,
        }
        Ok(analyzer)
    }

    /// Reads and analyzes an uncompressed trace stream until its end.
    pub fn analyze_reader(&mut self, mut reader: impl Read) -> Result<()> {
        let mut buffer: Vec<u8> = Vec::new();
        let mut chunk = vec![0; READ_CHUNK_SIZE];
        // Index into `buffer` up to which rows have been consumed.
        let mut start = 0;
        let mut header_checked = false;
        loop {
            let bytes_read = match reader.read(&mut chunk) {
                Ok(n) => n,
                Err(err) if err.kind() == io::ErrorKind::Interrupted => continue,
                Err(err) => return Err(err).context("Unable to read trace file"),
            };
            let eof = bytes_read == 0;
            if !eof {
                buffer.drain(..start);
                start = 0;
                buffer.extend_from_slice(&chunk[..bytes_read]);
                self.uncompressed_size += bytes_read as u64;
            }
            if !header_checked {
                if buffer.len() < TRACE_HEADER.len() && !eof {
                    continue;
                }
                // Old trace files don't have a header
                if buffer.starts_with(TRACE_HEADER) {
                    start = TRACE_HEADER.len();
                    self.header_bytes = TRACE_HEADER.len() as u64;
                }
                header_checked = true;
            }
            loop {
                let remaining = &buffer[start..];
                match postcard::take_from_bytes::<TraceRow<'_>>(remaining) {
                    Ok((row, rest)) => {
                        let row_bytes = remaining.len() - rest.len();
                        self.add_row(&row, row_bytes as u64);
                        start += row_bytes;
                    }
                    Err(postcard::Error::DeserializeUnexpectedEnd) => break,
                    Err(err) => {
                        let offset = self.uncompressed_size - (buffer.len() - start) as u64;
                        bail!("Invalid trace row at uncompressed offset {offset}: {err}");
                    }
                }
            }
            if eof {
                self.trailing_bytes = (buffer.len() - start) as u64;
                self.finish();
                return Ok(());
            }
        }
    }

    /// Accounts a single decoded row that took `bytes` bytes in the stream.
    pub fn add_row(&mut self, row: &TraceRow<'_>, bytes: u64) {
        self.row_kinds[RowKind::of(row) as usize].add(bytes);
        match row {
            TraceRow::Start {
                id,
                name,
                target,
                values,
                ..
            } => {
                let span = self.span_for_name(target, name);
                self.spans[span].start.add(bytes);
                self.span_ids.insert(*id, span);
                if let Some(pending) = self.pending.remove(id) {
                    let other = &mut self.spans[span].other;
                    other.count += pending.count;
                    other.bytes += pending.bytes;
                }
                self.components.start_name += str_size(name);
                self.components.start_target += str_size(target);
                self.components.start_values += self.add_values(values);
                self.strings[StringKind::SpanName as usize].add(name);
                self.strings[StringKind::SpanTarget as usize].add(target);
            }
            TraceRow::End { id, .. } => {
                self.add_span_row(*id, bytes);
            }
            TraceRow::Enter {
                id, allocations, ..
            } => {
                self.add_span_row(*id, bytes);
                self.components.enter_allocations += allocations_size(allocations);
            }
            TraceRow::Exit {
                id, allocations, ..
            } => {
                self.add_span_row(*id, bytes);
                self.components.exit_allocations += allocations_size(allocations);
            }
            TraceRow::Record { id, values } => {
                self.add_span_row(*id, bytes);
                self.components.record_values += self.add_values(values);
            }
            TraceRow::Event { parent, values, .. } => {
                match parent {
                    Some(id) => self.add_span_row(*id, bytes),
                    None => {
                        let span = self.span_for_name("", NO_SPAN);
                        self.spans[span].other.add(bytes);
                    }
                }
                self.components.event_values += self.add_values(values);
            }
            TraceRow::MemorySample { .. } => {}
        }
    }

    /// Accounts the attributes and returns their encoded size including the
    /// length prefix of the list.
    fn add_values(&mut self, values: &[(std::borrow::Cow<'_, str>, TraceValue<'_>)]) -> u64 {
        let mut total = varint_size(values.len() as u64);
        for (key, value) in values {
            let key_bytes = str_size(key);
            let value_bytes = value_size(value);
            total += key_bytes + value_bytes;
            let index = match self.field_index.get(&**key) {
                Some(&index) => index,
                None => {
                    let index = self.fields.len();
                    self.fields.push(FieldStats {
                        key: key.to_string(),
                        ..Default::default()
                    });
                    self.field_index.insert((&**key).into(), index);
                    index
                }
            };
            let field = &mut self.fields[index];
            field.count += 1;
            field.key_bytes += key_bytes;
            field.value_bytes += value_bytes;
            self.strings[StringKind::FieldKey as usize].add(key);
            if let TraceValue::String(s) = value {
                self.strings[StringKind::StringValue as usize].add(s);
            }
        }
        total
    }

    fn span_for_name(&mut self, target: &str, name: &str) -> usize {
        if let Some(&index) = self
            .span_index
            .get(target)
            .and_then(|names| names.get(name))
        {
            return index;
        }
        let index = self.spans.len();
        self.spans.push(SpanStats {
            target: target.to_string(),
            name: name.to_string(),
            ..Default::default()
        });
        self.span_index
            .entry(target.into())
            .or_default()
            .insert(name.into(), index);
        index
    }

    /// Attributes a non-`Start` row to the span with the given id, or queues
    /// it until the `Start` of that span is read.
    fn add_span_row(&mut self, id: u64, bytes: u64) {
        match self.span_ids.get(&id) {
            Some(&index) => self.spans[index].other.add(bytes),
            None => self.pending.entry(id).or_default().add(bytes),
        }
    }

    /// Attributes rows whose span was never started to [`UNKNOWN_SPAN`].
    /// Called at the end of the stream.
    fn finish(&mut self) {
        if self.pending.is_empty() {
            return;
        }
        let span = self.span_for_name("", UNKNOWN_SPAN);
        for (_, pending) in self.pending.drain() {
            let other = &mut self.spans[span].other;
            other.count += pending.count;
            other.bytes += pending.bytes;
        }
    }

    /// Total number of decoded rows.
    pub fn row_count(&self) -> u64 {
        self.row_kinds.iter().map(|c| c.count).sum()
    }

    /// Total bytes of all decoded rows.
    pub fn row_bytes(&self) -> u64 {
        self.row_kinds.iter().map(|c| c.bytes).sum()
    }

    pub fn row_kind(&self, kind: RowKind) -> Counter {
        self.row_kinds[kind as usize]
    }

    /// Spans sorted by their total bytes, largest first.
    pub fn spans_by_size(&self) -> Vec<&SpanStats> {
        let mut spans: Vec<_> = self.spans.iter().collect();
        spans.sort_by_key(|s| Reverse(s.total_bytes()));
        spans
    }

    /// Attribute keys sorted by their total bytes, largest first.
    pub fn fields_by_size(&self) -> Vec<&FieldStats> {
        let mut fields: Vec<_> = self.fields.iter().collect();
        fields.sort_by_key(|f| Reverse(f.total_bytes()));
        fields
    }

    pub fn strings(&self, kind: StringKind) -> &StringStats {
        &self.strings[kind as usize]
    }

    /// Writes a human readable report. Tables with an unbounded number of
    /// entries are limited to the `top` largest entries.
    pub fn write_report(&self, out: &mut impl Write, top: usize) -> io::Result<()> {
        let total = self.uncompressed_size;
        let pct = |bytes: u64| percent(bytes, total);

        writeln!(out, "# Overview")?;
        writeln!(out)?;
        let size_row = |label: &str, bytes: u64, with_pct: bool| {
            vec![
                label.to_string(),
                format_bytes(bytes),
                format_count(bytes),
                if with_pct { pct(bytes) } else { String::new() },
            ]
        };
        let mut rows = Vec::new();
        if let Some(file_size) = self.file_size {
            rows.push(size_row("file size", file_size, false));
        }
        rows.push(vec![
            "compression".into(),
            self.compression.name().into(),
            String::new(),
            String::new(),
        ]);
        rows.push(size_row("uncompressed size", total, true));
        rows.push(size_row("rows", self.row_bytes(), true));
        rows.push(size_row("header", self.header_bytes, true));
        rows.push(size_row(
            "incomplete trailing data",
            self.trailing_bytes,
            true,
        ));
        rows.push(vec![
            "row count".into(),
            format_count(self.row_count()),
            String::new(),
            String::new(),
        ]);
        write_table(out, &["", "size", "bytes", "%"], 1, rows)?;

        writeln!(out)?;
        writeln!(out, "# By row type")?;
        writeln!(out)?;
        let mut kinds: Vec<_> = RowKind::ALL
            .iter()
            .map(|&kind| (kind, self.row_kind(kind)))
            .filter(|(_, c)| c.count > 0)
            .collect();
        kinds.sort_by_key(|(_, c)| Reverse(c.bytes));
        let rows = kinds
            .into_iter()
            .map(|(kind, c)| {
                vec![
                    kind.name().into(),
                    format_count(c.count),
                    format_bytes(c.bytes),
                    format_avg(c.bytes, c.count),
                    pct(c.bytes),
                ]
            })
            .collect();
        write_table(out, &["row type", "count", "bytes", "avg", "%"], 1, rows)?;

        writeln!(out)?;
        writeln!(out, "# Row components")?;
        writeln!(out)?;
        let c = &self.components;
        let start = self.row_kind(RowKind::Start).bytes;
        let event = self.row_kind(RowKind::Event).bytes;
        let record = self.row_kind(RowKind::Record).bytes;
        let enter = self.row_kind(RowKind::Enter).bytes;
        let exit = self.row_kind(RowKind::Exit).bytes;
        let rows = [
            ("Start", "name", c.start_name),
            ("Start", "target", c.start_target),
            ("Start", "values", c.start_values),
            (
                "Start",
                "fixed (tag, ts, id, parent)",
                start - c.start_name - c.start_target - c.start_values,
            ),
            ("Enter", "allocations", c.enter_allocations),
            (
                "Enter",
                "fixed (tag, ts, id, thread)",
                enter - c.enter_allocations,
            ),
            ("Exit", "allocations", c.exit_allocations),
            (
                "Exit",
                "fixed (tag, ts, id, thread)",
                exit - c.exit_allocations,
            ),
            ("Event", "values", c.event_values),
            ("Event", "fixed (tag, ts, parent)", event - c.event_values),
            ("Record", "values", c.record_values),
            ("Record", "fixed (tag, id)", record - c.record_values),
        ]
        .into_iter()
        .map(|(kind, component, bytes)| {
            vec![
                kind.into(),
                component.into(),
                format_bytes(bytes),
                pct(bytes),
            ]
        })
        .collect();
        write_table(out, &["row type", "component", "bytes", "%"], 2, rows)?;

        writeln!(out)?;
        writeln!(out, "# By span name (top {top})")?;
        writeln!(out)?;
        writeln!(
            out,
            "`other` are the End/Enter/Exit/Record rows of the span and the Events inside of it."
        )?;
        writeln!(out)?;
        let spans = self.spans_by_size();
        let mut rows: Vec<Vec<String>> = spans
            .iter()
            .take(top)
            .map(|s| {
                vec![
                    s.target.clone(),
                    s.name.clone(),
                    format_count(s.start.count),
                    format_bytes(s.start.bytes),
                    format_avg(s.start.bytes, s.start.count),
                    format_bytes(s.other.bytes),
                    format_bytes(s.total_bytes()),
                    pct(s.total_bytes()),
                ]
            })
            .collect();
        if spans.len() > top {
            let rest = &spans[top..];
            let starts: u64 = rest.iter().map(|s| s.start.count).sum();
            let start_bytes: u64 = rest.iter().map(|s| s.start.bytes).sum();
            let other_bytes: u64 = rest.iter().map(|s| s.other.bytes).sum();
            rows.push(vec![
                String::new(),
                format!("<{} others>", rest.len()),
                format_count(starts),
                format_bytes(start_bytes),
                format_avg(start_bytes, starts),
                format_bytes(other_bytes),
                format_bytes(start_bytes + other_bytes),
                pct(start_bytes + other_bytes),
            ]);
        }
        write_table(
            out,
            &[
                "target",
                "name",
                "count",
                "start",
                "avg start",
                "other",
                "total",
                "% of file",
            ],
            2,
            rows,
        )?;

        writeln!(out)?;
        writeln!(out, "# By field key (top {top})")?;
        writeln!(out)?;
        let fields = self.fields_by_size();
        let mut rows: Vec<Vec<String>> = fields
            .iter()
            .take(top)
            .map(|f| {
                vec![
                    f.key.clone(),
                    format_count(f.count),
                    format_bytes(f.key_bytes),
                    format_bytes(f.value_bytes),
                    format_avg(f.value_bytes, f.count),
                    format_bytes(f.total_bytes()),
                    pct(f.total_bytes()),
                ]
            })
            .collect();
        if fields.len() > top {
            let rest = &fields[top..];
            let count: u64 = rest.iter().map(|f| f.count).sum();
            let key_bytes: u64 = rest.iter().map(|f| f.key_bytes).sum();
            let value_bytes: u64 = rest.iter().map(|f| f.value_bytes).sum();
            rows.push(vec![
                format!("<{} others>", rest.len()),
                format_count(count),
                format_bytes(key_bytes),
                format_bytes(value_bytes),
                format_avg(value_bytes, count),
                format_bytes(key_bytes + value_bytes),
                pct(key_bytes + value_bytes),
            ]);
        }
        write_table(
            out,
            &["key", "count", "key", "value", "avg value", "total", "%"],
            1,
            rows,
        )?;

        writeln!(out)?;
        writeln!(out, "# Repeated strings")?;
        writeln!(out)?;
        writeln!(
            out,
            "`redundant` is the upper bound of what could be saved if every distinct string were \
             written only once, before the cost of referencing it."
        )?;
        writeln!(out)?;
        let rows = StringKind::ALL
            .iter()
            .map(|&kind| {
                let s = self.strings(kind);
                vec![
                    kind.name().into(),
                    format_count(s.occurrences),
                    format_count(s.distinct_count()),
                    format_bytes(s.total_bytes),
                    format_bytes(s.distinct_bytes),
                    format_bytes(s.redundant_bytes()),
                    pct(s.redundant_bytes()),
                ]
            })
            .collect();
        write_table(
            out,
            &[
                "kind",
                "occurrences",
                "distinct",
                "bytes",
                "distinct bytes",
                "redundant",
                "%",
            ],
            1,
            rows,
        )?;
        Ok(())
    }
}

/// Compression formats of trace files.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Compression {
    #[default]
    None,
    Gzip,
    Zstd,
}

impl Compression {
    /// Detects the compression from the magic bytes at the start of a file.
    pub fn detect(start: &[u8]) -> Self {
        if start.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
            Compression::Zstd
        } else if start.starts_with(&[0x1f, 0x8b]) {
            Compression::Gzip
        } else {
            Compression::None
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Compression::None => "none",
            Compression::Gzip => "gzip",
            Compression::Zstd => "zstd",
        }
    }
}

/// Size of a LEB128 varint as used by postcard for integers.
fn varint_size(value: u64) -> u64 {
    let bits = 64 - value.leading_zeros() as u64;
    bits.div_ceil(7).max(1)
}

/// Size of a postcard encoded string (length prefix + UTF-8 bytes).
fn str_size(s: &str) -> u64 {
    varint_size(s.len() as u64) + s.len() as u64
}

/// Size of the postcard encoded `allocations` field of `Enter`/`Exit` rows.
fn allocations_size(allocations: &Option<Allocations>) -> u64 {
    1 + match allocations {
        Some(a) => {
            varint_size(a.allocations)
                + varint_size(a.allocation_count)
                + varint_size(a.deallocations)
                + varint_size(a.deallocation_count)
        }
        None => 0,
    }
}

/// Size of a postcard encoded [`TraceValue`] including its variant tag.
fn value_size(value: &TraceValue<'_>) -> u64 {
    1 + match value {
        TraceValue::String(s) => str_size(s),
        TraceValue::Bool(_) => 1,
        TraceValue::UInt(u) => varint_size(*u),
        TraceValue::Int(i) => varint_size(((i << 1) ^ (i >> 63)) as u64),
        TraceValue::Float(_) => 8,
    }
}

fn percent(bytes: u64, total: u64) -> String {
    if total == 0 {
        return "-".into();
    }
    format!("{:.1}%", bytes as f64 * 100.0 / total as f64)
}

fn format_avg(bytes: u64, count: u64) -> String {
    if count == 0 {
        return "-".into();
    }
    format!("{:.1} B", bytes as f64 / count as f64)
}

/// Formats a byte count with a binary unit, e.g. `1.5 MiB`.
pub fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KiB", "MiB", "GiB", "TiB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.2} {}", UNITS[unit])
    }
}

/// Formats a count with thousands separators, e.g. `1,234,567`.
pub fn format_count(count: u64) -> String {
    let digits = count.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

/// Writes a markdown-style table. The first `left_aligned` columns are left
/// aligned, all others are right aligned.
fn write_table(
    out: &mut impl Write,
    headers: &[&str],
    left_aligned: usize,
    rows: Vec<Vec<String>>,
) -> io::Result<()> {
    let mut widths: Vec<usize> = headers.iter().map(|h| h.chars().count().max(3)).collect();
    for row in &rows {
        for (width, cell) in widths.iter_mut().zip(row) {
            *width = (*width).max(cell.chars().count());
        }
    }
    let format_row = |cells: &mut dyn Iterator<Item = &str>| {
        let mut line = String::from("|");
        for (i, (cell, &width)) in cells.zip(&widths).enumerate() {
            if i < left_aligned {
                let _ = write!(line, " {cell:<width$} |");
            } else {
                let _ = write!(line, " {cell:>width$} |");
            }
        }
        line
    };
    writeln!(out, "{}", format_row(&mut headers.iter().copied()))?;
    let mut separator = String::from("|");
    for (i, &width) in widths.iter().enumerate() {
        if i < left_aligned {
            let _ = write!(separator, " {} |", "-".repeat(width));
        } else {
            let _ = write!(separator, " {}: |", "-".repeat(width - 1));
        }
    }
    writeln!(out, "{separator}")?;
    for row in &rows {
        writeln!(out, "{}", format_row(&mut row.iter().map(|s| s.as_str())))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use flate2::{Compression as GzLevel, write::GzEncoder};
    use turbopack_trace_utils::tracing::{Allocations, TraceRow, TraceValue};

    use crate::{
        Compression, NO_SPAN, RowKind, StringKind, TRACE_HEADER, TraceSizeAnalyzer, UNKNOWN_SPAN,
        allocations_size, value_size,
    };

    fn sample_rows() -> Vec<TraceRow<'static>> {
        vec![
            TraceRow::Start {
                ts: 1,
                id: 1,
                parent: None,
                name: Cow::Borrowed("build"),
                target: Cow::Borrowed("next"),
                values: vec![(
                    Cow::Borrowed("path"),
                    TraceValue::String(Cow::Borrowed("/app/page.tsx")),
                )],
            },
            TraceRow::Enter {
                ts: 2,
                id: 1,
                thread_id: 1,
                allocations: Some(Allocations {
                    allocations: 1 << 40,
                    allocation_count: 3,
                    deallocations: 0,
                    deallocation_count: 0,
                }),
            },
            TraceRow::Start {
                ts: 300,
                id: 2,
                parent: Some(1),
                name: Cow::Borrowed("build"),
                target: Cow::Borrowed("next"),
                values: vec![
                    (
                        Cow::Borrowed("path"),
                        TraceValue::String(Cow::Borrowed("/app/layout.tsx")),
                    ),
                    (Cow::Borrowed("count"), TraceValue::UInt(100_000)),
                    (Cow::Borrowed("delta"), TraceValue::Int(-5)),
                    (Cow::Borrowed("ratio"), TraceValue::Float(0.5)),
                    (Cow::Borrowed("ok"), TraceValue::Bool(true)),
                ],
            },
            TraceRow::Event {
                ts: 400,
                parent: Some(2),
                values: vec![(
                    Cow::Borrowed("message"),
                    TraceValue::String(Cow::Borrowed("hello")),
                )],
            },
            TraceRow::Record {
                id: 2,
                values: vec![(Cow::Borrowed("count"), TraceValue::UInt(1))],
            },
            TraceRow::End { ts: 500, id: 2 },
            TraceRow::Exit {
                ts: 600,
                id: 1,
                thread_id: 1,
                allocations: None,
            },
            TraceRow::End { ts: 700, id: 1 },
            // This span is never started
            TraceRow::End { ts: 800, id: 99 },
            TraceRow::MemorySample {
                ts: 900,
                memory: 1,
                memory_pressure: 0,
                active_worker_threads: 1,
            },
            TraceRow::MemorySample {
                ts: 950,
                memory: 1 << 20,
                memory_pressure: 100,
                active_worker_threads: 2,
            },
            TraceRow::MemorySample {
                ts: 1000,
                memory: 1 << 30,
                memory_pressure: 200,
                active_worker_threads: 3,
            },
            // Rows of other threads can be written before the `Start` of their span
            TraceRow::Exit {
                ts: 1200,
                id: 3,
                thread_id: 2,
                allocations: Some(Allocations::default()),
            },
            TraceRow::Start {
                ts: 1100,
                id: 3,
                parent: None,
                name: Cow::Borrowed("late"),
                target: Cow::Borrowed("next"),
                values: vec![],
            },
        ]
    }

    fn encode(rows: &[TraceRow<'_>]) -> (Vec<u8>, Vec<u64>) {
        let mut data = TRACE_HEADER.to_vec();
        let mut sizes = Vec::new();
        for row in rows {
            let bytes = postcard::to_stdvec(row).unwrap();
            sizes.push(bytes.len() as u64);
            data.extend_from_slice(&bytes);
        }
        (data, sizes)
    }

    #[test]
    fn accounts_every_byte_per_row_type() {
        let rows = sample_rows();
        let (data, sizes) = encode(&rows);
        let mut analyzer = TraceSizeAnalyzer::new();
        analyzer.analyze_reader(&data[..]).unwrap();

        assert_eq!(analyzer.uncompressed_size, data.len() as u64);
        assert_eq!(analyzer.header_bytes, TRACE_HEADER.len() as u64);
        assert_eq!(analyzer.trailing_bytes, 0);
        assert_eq!(analyzer.row_count(), rows.len() as u64);
        assert_eq!(
            analyzer.row_bytes() + analyzer.header_bytes,
            data.len() as u64
        );
        for kind in RowKind::ALL {
            let (count, bytes) = rows
                .iter()
                .zip(&sizes)
                .filter(|(row, _)| RowKind::of(row) == kind)
                .fold((0, 0), |(c, b), (_, s)| (c + 1, b + s));
            let counter = analyzer.row_kind(kind);
            assert_eq!(counter.count, count, "{kind:?}");
            assert_eq!(counter.bytes, bytes, "{kind:?}");
        }
    }

    #[test]
    fn computed_component_sizes_match_postcard() {
        for value in [
            TraceValue::String(Cow::Owned("x".repeat(200))),
            TraceValue::Bool(false),
            TraceValue::UInt(0),
            TraceValue::UInt(u64::MAX),
            TraceValue::Int(-1),
            TraceValue::Int(i64::MIN),
            TraceValue::Float(1.0),
        ] {
            assert_eq!(
                value_size(&value),
                postcard::to_stdvec(&value).unwrap().len() as u64,
                "{value:?}"
            );
        }
        for allocations in [
            None,
            Some(Allocations::default()),
            Some(Allocations {
                allocations: u64::MAX,
                allocation_count: 1 << 20,
                deallocations: 127,
                deallocation_count: 128,
            }),
        ] {
            assert_eq!(
                allocations_size(&allocations),
                postcard::to_stdvec(&allocations).unwrap().len() as u64,
                "{allocations:?}"
            );
        }

        let rows = sample_rows();
        let mut analyzer = TraceSizeAnalyzer::new();
        analyzer.analyze_reader(&encode(&rows).0[..]).unwrap();
        let start_values: u64 = rows
            .iter()
            .filter_map(|row| match row {
                TraceRow::Start { values, .. } => {
                    Some(postcard::to_stdvec(values).unwrap().len() as u64)
                }
                _ => None,
            })
            .sum();
        assert_eq!(analyzer.components.start_values, start_values);
        // "build" and "next" are written twice, "late" and "next" once, each
        // with a 1 byte length prefix
        assert_eq!(analyzer.components.start_name, 12 + 5);
        assert_eq!(analyzer.components.start_target, 10 + 5);
        let (enter, exit) = rows.iter().fold((0, 0), |(enter, exit), row| match row {
            TraceRow::Enter { allocations, .. } => (
                enter + postcard::to_stdvec(allocations).unwrap().len() as u64,
                exit,
            ),
            TraceRow::Exit { allocations, .. } => (
                enter,
                exit + postcard::to_stdvec(allocations).unwrap().len() as u64,
            ),
            _ => (enter, exit),
        });
        assert_eq!(analyzer.components.enter_allocations, enter);
        assert_eq!(analyzer.components.exit_allocations, exit);
    }

    #[test]
    fn attributes_rows_to_spans_fields_and_strings() {
        let rows = sample_rows();
        let (data, sizes) = encode(&rows);
        let mut analyzer = TraceSizeAnalyzer::new();
        analyzer.analyze_reader(&data[..]).unwrap();

        let spans = analyzer.spans_by_size();
        let build = spans.iter().find(|s| s.name == "build").unwrap();
        assert_eq!(build.target, "next");
        assert_eq!(build.start.count, 2);
        assert_eq!(build.start.bytes, sizes[0] + sizes[2]);
        // Enter, Event, Record, End, Exit, End
        assert_eq!(build.other.count, 6);
        assert_eq!(
            build.other.bytes,
            sizes[1] + sizes[3..8].iter().sum::<u64>()
        );
        let unknown = spans.iter().find(|s| s.name == UNKNOWN_SPAN).unwrap();
        assert_eq!(unknown.other.count, 1);
        assert_eq!(unknown.other.bytes, sizes[8]);
        let late = spans.iter().find(|s| s.name == "late").unwrap();
        assert_eq!(late.start.bytes, sizes[13]);
        assert_eq!(late.other.count, 1);
        assert_eq!(late.other.bytes, sizes[12]);

        let fields = analyzer.fields_by_size();
        let path = fields.iter().find(|f| f.key == "path").unwrap();
        assert_eq!(path.count, 2);
        assert_eq!(path.key_bytes, 10);
        // tag + length prefix + string
        assert_eq!(path.value_bytes, (2 + 13) + (2 + 15));
        let count = fields.iter().find(|f| f.key == "count").unwrap();
        assert_eq!(count.count, 2);
        // tag + 3 byte varint, tag + 1 byte varint
        assert_eq!(count.value_bytes, 4 + 2);

        let names = analyzer.strings(StringKind::SpanName);
        assert_eq!(names.occurrences, 3);
        assert_eq!(names.distinct_count(), 2);
        assert_eq!(names.total_bytes, 17);
        assert_eq!(names.redundant_bytes(), 6);
        let keys = analyzer.strings(StringKind::FieldKey);
        assert_eq!(keys.occurrences, 8);
        assert_eq!(keys.distinct_count(), 6);
        let values = analyzer.strings(StringKind::StringValue);
        assert_eq!(values.occurrences, 3);
        assert_eq!(values.redundant_bytes(), 0);
    }

    #[test]
    fn reports_incomplete_trailing_row() {
        let (mut data, sizes) = encode(&sample_rows());
        let last = *sizes.last().unwrap();
        data.truncate(data.len() - 1);
        let mut analyzer = TraceSizeAnalyzer::new();
        analyzer.analyze_reader(&data[..]).unwrap();
        assert_eq!(analyzer.row_count(), sizes.len() as u64 - 1);
        assert_eq!(analyzer.trailing_bytes, last - 1);
    }

    /// A reader that returns at most one byte per `read` call, so rows and the
    /// header are split across reads.
    struct ByteReader<'a>(&'a [u8]);

    impl std::io::Read for ByteReader<'_> {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let Some((&first, rest)) = self.0.split_first() else {
                return Ok(0);
            };
            buf[0] = first;
            self.0 = rest;
            Ok(1)
        }
    }

    #[test]
    fn handles_rows_split_across_reads() {
        let rows = sample_rows();
        let (data, _) = encode(&rows);
        let mut expected = TraceSizeAnalyzer::new();
        expected.analyze_reader(&data[..]).unwrap();
        let mut analyzer = TraceSizeAnalyzer::new();
        analyzer.analyze_reader(ByteReader(&data)).unwrap();
        assert_eq!(analyzer.header_bytes, TRACE_HEADER.len() as u64);
        assert_eq!(analyzer.row_kinds, expected.row_kinds);
        assert_eq!(analyzer.components, expected.components);
        assert_eq!(analyzer.spans_by_size(), expected.spans_by_size());
        assert_eq!(analyzer.fields_by_size(), expected.fields_by_size());
    }

    #[test]
    fn reads_files_without_header() {
        let (data, _) = encode(&sample_rows());
        let mut analyzer = TraceSizeAnalyzer::new();
        analyzer
            .analyze_reader(&data[TRACE_HEADER.len()..])
            .unwrap();
        assert_eq!(analyzer.header_bytes, 0);
        assert_eq!(analyzer.row_count(), sample_rows().len() as u64);
        assert_eq!(analyzer.row_bytes(), analyzer.uncompressed_size);
    }

    #[test]
    fn fails_on_invalid_rows() {
        let (mut data, _) = encode(&sample_rows());
        let offset = data.len();
        // There is no `TraceRow` variant with this tag
        data.push(0x7f);
        let mut analyzer = TraceSizeAnalyzer::new();
        let err = analyzer.analyze_reader(&data[..]).unwrap_err();
        assert!(
            err.to_string()
                .contains(&format!("uncompressed offset {offset}")),
            "{err}"
        );
    }

    #[test]
    fn attributes_reused_ids_and_events_without_span() {
        let rows = vec![
            TraceRow::Start {
                ts: 1,
                id: 5,
                parent: None,
                name: Cow::Borrowed("a"),
                target: Cow::Borrowed("t"),
                values: vec![],
            },
            TraceRow::End { ts: 2, id: 5 },
            TraceRow::Start {
                ts: 3,
                id: 5,
                parent: None,
                name: Cow::Borrowed("b"),
                target: Cow::Borrowed("t"),
                values: vec![],
            },
            TraceRow::Enter {
                ts: 4,
                id: 5,
                thread_id: 1,
                allocations: None,
            },
            TraceRow::Event {
                ts: 5,
                parent: None,
                values: vec![],
            },
        ];
        let (data, sizes) = encode(&rows);
        let mut analyzer = TraceSizeAnalyzer::new();
        analyzer.analyze_reader(&data[..]).unwrap();
        let spans = analyzer.spans_by_size();
        let span = |name: &str| *spans.iter().find(|s| s.name == name).unwrap();
        assert_eq!(span("a").other.bytes, sizes[1]);
        assert_eq!(span("b").other.bytes, sizes[3]);
        assert_eq!(span(NO_SPAN).other.bytes, sizes[4]);
        assert!(spans.iter().all(|s| s.name != UNKNOWN_SPAN));
    }

    fn temp_file(name: &str, content: &[u8]) -> (std::path::PathBuf, std::path::PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("turbo-trace-size-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, content).unwrap();
        (dir, path)
    }

    #[test]
    fn reads_multi_member_gzip_files() {
        use std::io::Write;

        let (data, _) = encode(&sample_rows());
        // Write two gzip members, as appending to a gzip file would do
        let (first, second) = data.split_at(data.len() / 2);
        let mut compressed = Vec::new();
        for part in [first, second] {
            let mut encoder = GzEncoder::new(Vec::new(), GzLevel::fast());
            encoder.write_all(part).unwrap();
            compressed.extend(encoder.finish().unwrap());
        }
        let (dir, path) = temp_file("trace.bin.gz", &compressed);

        let analyzer = TraceSizeAnalyzer::analyze_file(&path).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(analyzer.compression, Compression::Gzip);
        assert_eq!(analyzer.file_size, Some(compressed.len() as u64));
        assert_eq!(analyzer.uncompressed_size, data.len() as u64);
        assert_eq!(analyzer.row_count(), sample_rows().len() as u64);
        assert_eq!(analyzer.trailing_bytes, 0);

        let mut report = Vec::new();
        analyzer.write_report(&mut report, 3).unwrap();
        let report = String::from_utf8(report).unwrap();
        assert!(report.contains("# By row type"), "{report}");
        assert!(report.contains("| Start "), "{report}");
        assert!(report.contains("<3 others>"), "{report}");
    }

    #[test]
    fn reads_zstd_files() {
        let (data, _) = encode(&sample_rows());
        let compressed = zstd::encode_all(&data[..], 3).unwrap();
        let (dir, path) = temp_file("trace.bin.zst", &compressed);

        let analyzer = TraceSizeAnalyzer::analyze_file(&path).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(analyzer.compression, Compression::Zstd);
        assert_eq!(analyzer.uncompressed_size, data.len() as u64);
        assert_eq!(analyzer.row_count(), sample_rows().len() as u64);
    }
}
