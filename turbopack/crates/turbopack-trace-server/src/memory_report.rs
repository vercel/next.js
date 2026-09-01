//! A computed — not sampled — breakdown of where the store's bytes go.
//!
//! Peak RSS is far too noisy to optimize against directly, and the allocator's
//! live-bytes counter tells you the total without saying which structure owns
//! it. This walks the store and adds up the parts, so a change in one of them
//! is attributable to the change that caused it.
//!
//! The numbers here are *live* bytes as the program understands them. The gap
//! between this total and peak RSS is allocator slack and fragmentation, which
//! is itself a useful signal: it is what moving small per-span allocations into
//! arenas is supposed to reclaim.
//!
//! Enable with `MEMORY_REPORT=1`. Walking every span costs a fraction of a
//! second at 13M spans, so it only runs at the end of the initial read.

use std::fmt;

const MB: usize = 1024 * 1024;

#[derive(Default)]
pub struct MemoryReport {
    pub spans: usize,

    /// `size_of::<Span>()` — the per-span constant the whole plan turns on.
    pub span_size: usize,
    /// What the `ChunkedVec` chunks actually cost, including the tail chunk's
    /// unused slots.
    pub span_chunk_bytes: usize,

    pub events: usize,
    pub event_size: usize,
    /// Spans whose events outgrew the single inline `SmallVec` slot.
    pub event_spilled_spans: usize,
    /// Heap bytes held by those spilled event vectors, at real capacity.
    pub event_heap_bytes: usize,

    pub args: usize,
    pub arg_spilled_spans: usize,
    pub arg_heap_bytes: usize,

    pub self_time_entries: usize,
    pub self_time_bytes: usize,

    pub memory_sample_bytes: usize,

    /// How much of the lazily-computed half has actually been materialized.
    /// Zero across all three during a headless ingest; that gap is what the
    /// cold-side work targets.
    pub totals_populated: usize,
    pub names_populated: usize,
    pub extra_populated: usize,

    /// `TurboMalloc::memory_usage()` at the same instant, for comparison.
    pub allocator_live_bytes: usize,
}

impl MemoryReport {
    /// Everything above that is a real allocation (excludes the populated
    /// counts, which are counts rather than bytes).
    pub fn accounted_bytes(&self) -> usize {
        self.span_chunk_bytes
            + self.event_heap_bytes
            + self.arg_heap_bytes
            + self.self_time_bytes
            + self.memory_sample_bytes
    }
}

/// `1234 MB` with the value right-aligned so the column scans vertically.
struct Mb(usize);

impl fmt::Display for Mb {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:>7} MB", self.0 / MB)
    }
}

impl fmt::Display for MemoryReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let spans = self.spans.max(1);
        // Bytes per span is the figure that stays comparable across STOP_AT
        // truncation points, so every row carries it.
        let per_span = |bytes: usize| bytes as f64 / spans as f64;

        writeln!(f, "memory report — {} spans", self.spans)?;
        writeln!(
            f,
            "  {:<22} {} {:>8.1} B/span   size_of::<Span>() = {}",
            "span chunks",
            Mb(self.span_chunk_bytes),
            per_span(self.span_chunk_bytes),
            self.span_size,
        )?;
        writeln!(
            f,
            "  {:<22} {} {:>8.1} B/span   {} events, {} spans spilled, size_of::<SpanEvent>() = {}",
            "events (heap)",
            Mb(self.event_heap_bytes),
            per_span(self.event_heap_bytes),
            self.events,
            self.event_spilled_spans,
            self.event_size,
        )?;
        writeln!(
            f,
            "  {:<22} {} {:>8.1} B/span   {} args, {} spans spilled",
            "args (heap)",
            Mb(self.arg_heap_bytes),
            per_span(self.arg_heap_bytes),
            self.args,
            self.arg_spilled_spans,
        )?;
        writeln!(
            f,
            "  {:<22} {} {:>8.1} B/span   {} entries",
            "self time tree",
            Mb(self.self_time_bytes),
            per_span(self.self_time_bytes),
            self.self_time_entries,
        )?;
        writeln!(
            f,
            "  {:<22} {} {:>8.1} B/span",
            "memory samples",
            Mb(self.memory_sample_bytes),
            per_span(self.memory_sample_bytes),
        )?;
        writeln!(
            f,
            "  {:<22} {} {:>8.1} B/span",
            "accounted",
            Mb(self.accounted_bytes()),
            per_span(self.accounted_bytes()),
        )?;
        writeln!(
            f,
            "  {:<22} {} {:>8.1} B/span   unaccounted (interner, reader buffers, id_mapping, \
             allocator slack) = {}",
            "allocator live",
            Mb(self.allocator_live_bytes),
            per_span(self.allocator_live_bytes),
            Mb(self
                .allocator_live_bytes
                .saturating_sub(self.accounted_bytes())),
        )?;
        write!(
            f,
            "  lazily computed: totals {}/{}, names {}/{}, extra {}/{}",
            self.totals_populated,
            self.spans,
            self.names_populated,
            self.spans,
            self.extra_populated,
            self.spans,
        )
    }
}
