//! Lazily-allocated storage for the derived half of a span.
//!
//! Five per-span values — `end`, `total_time`, `corrected_self_time`,
//! `corrected_total_time`, and the subtree totals bundle — are pure functions of
//! the trace, computed on demand and thrown away when a span is invalidated.
//! Kept as fields on `Span` they cost 112 bytes on *every* span whether or not
//! anything ever asked for them, which at tens of millions of spans is over a
//! gigabyte that a headless ingest never reads.
//!
//! So they live here instead, in arrays parallel to the span array's 64K chunks,
//! allocated per chunk on first touch. During a read with no client attached
//! nothing allocates at all.
//!
//! # Why atomics and not `OnceLock`
//!
//! Every value here is a pure function of a store held under a read lock, so two
//! threads racing to compute one produce the same answer and write the same
//! bits. That is a weaker contract than `OnceLock` provides, and it is all that
//! is needed: a relaxed load, and a relaxed store of a value someone else may
//! have just stored identically. The cost of the race is duplicated work, never
//! a wrong answer. In exchange the per-value guard word disappears — which was
//! half the bytes.
//!
//! This is only sound while the invariant holds. **If a future change makes any
//! of these values depend on mutable state reachable through `&self`, this
//! scheme breaks.**
//!
//! # Encoding
//!
//! Zero means "not computed", so a freshly zeroed allocation is a valid empty
//! cache — which is the second reason for this design. Chunks come from
//! [`Box::new_zeroed_slice`], so the allocator hands back calloc'd pages and the
//! kernel faults them in only as they are written. Touching three spans in a
//! chunk commits three pages, not the whole 2 MiB.
//!
//! Timestamps are therefore stored biased by one. One timestamp collides:
//! `Timestamp::MAX`, which is the root span's `self_end` (see `store::new_root_span`)
//! and hence its `end`. Biased it wraps back to zero, so the root's `end` reads
//! as "not computed" and is recalculated on every call. That is one span out of
//! millions, and the alternative — a separate validity word per value — costs
//! more than the recomputation ever will.
//!
//! The totals bundle needs no bias: `span_count` counts the span itself, so a
//! computed bundle always has `span_count >= 1` and zero is unambiguous.

use std::sync::{
    OnceLock,
    atomic::{AtomicU64, Ordering},
};

use crate::{chunked_vec::CHUNK_SIZE, span::SpanTotals, timestamp::Timestamp};

/// Which of a span's four cached timestamps a slot holds.
#[derive(Clone, Copy)]
pub enum TimeSlot {
    End = 0,
    TotalTime = 1,
    CorrectedSelfTime = 2,
    CorrectedTotalTime = 3,
}

const TIMES_PER_SPAN: usize = 4;
/// `allocations`, `deallocations`, `persistent_allocations`, `allocation_count`,
/// `span_count` — in that order, matching [`SpanTotals`].
const TOTALS_PER_SPAN: usize = 5;
const TOTALS_SPAN_COUNT: usize = 4;

/// Allocate `len` zeroed slots without writing to them, so the pages stay
/// untouched until a span in this chunk is actually cached.
fn zeroed(len: usize) -> Box<[AtomicU64]> {
    // SAFETY: `AtomicU64` has the same size and bit validity as `u64`, and an
    // all-zero `u64` is a valid value, so a zeroed allocation is a slice of
    // initialized `AtomicU64`s holding 0.
    unsafe { Box::new_zeroed_slice(len).assume_init() }
}

#[derive(Default)]
struct ColdChunk {
    times: OnceLock<Box<[AtomicU64]>>,
    totals: OnceLock<Box<[AtomicU64]>>,
}

/// The derived-value arrays for the whole store, one entry per span chunk.
#[derive(Default)]
pub struct ColdStore {
    chunks: Vec<ColdChunk>,
}

impl ColdStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clear(&mut self) {
        self.chunks.clear();
    }

    /// Make room for `span_index`. Called from span creation, which holds
    /// `&mut Store`, so no reader can observe the `Vec` reallocating.
    pub fn reserve_for(&mut self, span_index: usize) {
        let needed = span_index / CHUNK_SIZE + 1;
        if self.chunks.len() < needed {
            self.chunks.resize_with(needed, ColdChunk::default);
        }
    }

    fn split(span_index: usize) -> (usize, usize) {
        (span_index / CHUNK_SIZE, span_index % CHUNK_SIZE)
    }

    /// One cached timestamp slot. Allocates this chunk's array on first touch.
    pub fn time(&self, span_index: usize, slot: TimeSlot) -> &AtomicU64 {
        let (chunk, offset) = Self::split(span_index);
        let times = self.chunks[chunk]
            .times
            .get_or_init(|| zeroed(TIMES_PER_SPAN * CHUNK_SIZE));
        &times[offset * TIMES_PER_SPAN + slot as usize]
    }

    fn totals_slots(&self, span_index: usize) -> &[AtomicU64] {
        let (chunk, offset) = Self::split(span_index);
        let totals = self.chunks[chunk]
            .totals
            .get_or_init(|| zeroed(TOTALS_PER_SPAN * CHUNK_SIZE));
        &totals[offset * TOTALS_PER_SPAN..(offset + 1) * TOTALS_PER_SPAN]
    }

    pub fn totals(&self, span_index: usize) -> Option<SpanTotals> {
        let s = self.totals_slots(span_index);
        // `span_count` is the validity marker: a computed bundle counts at least
        // the span itself.
        if s[TOTALS_SPAN_COUNT].load(Ordering::Relaxed) == 0 {
            return None;
        }
        Some(SpanTotals {
            allocations: s[0].load(Ordering::Relaxed),
            deallocations: s[1].load(Ordering::Relaxed),
            persistent_allocations: s[2].load(Ordering::Relaxed),
            allocation_count: s[3].load(Ordering::Relaxed),
            span_count: s[4].load(Ordering::Relaxed),
        })
    }

    pub fn set_totals(&self, span_index: usize, totals: &SpanTotals) {
        let s = self.totals_slots(span_index);
        debug_assert!(
            totals.span_count >= 1,
            "span_count is the validity marker and must count the span itself"
        );
        // Store `span_count` last: it is what makes the bundle readable, so the
        // other four are already in place by the time any reader accepts it.
        s[0].store(totals.allocations, Ordering::Relaxed);
        s[1].store(totals.deallocations, Ordering::Relaxed);
        s[2].store(totals.persistent_allocations, Ordering::Relaxed);
        s[3].store(totals.allocation_count, Ordering::Relaxed);
        s[TOTALS_SPAN_COUNT].store(totals.span_count, Ordering::Release);
    }

    /// Drop every cached value for one span. Takes `&mut self`, so `get_mut`
    /// avoids the atomic loads and — more usefully — a chunk that was never
    /// allocated short-circuits to nothing at all. That is why invalidation
    /// during a headless ingest costs a pointer check per ancestor rather than
    /// clearing 112 bytes.
    pub fn invalidate(&mut self, span_index: usize) {
        let (chunk, offset) = Self::split(span_index);
        let Some(chunk) = self.chunks.get_mut(chunk) else {
            return;
        };
        if let Some(times) = chunk.times.get_mut() {
            for slot in &mut times[offset * TIMES_PER_SPAN..(offset + 1) * TIMES_PER_SPAN] {
                *slot.get_mut() = 0;
            }
        }
        if let Some(totals) = chunk.totals.get_mut() {
            for slot in &mut totals[offset * TOTALS_PER_SPAN..(offset + 1) * TOTALS_PER_SPAN] {
                *slot.get_mut() = 0;
            }
        }
    }

    /// Bytes committed so far. Counts whole arrays, so it is an upper bound on
    /// resident memory when only part of a chunk has been touched.
    pub fn allocated_bytes(&self) -> usize {
        self.chunks
            .iter()
            .map(|chunk| {
                let times = chunk.times.get().map_or(0, |t| t.len());
                let totals = chunk.totals.get().map_or(0, |t| t.len());
                (times + totals) * std::mem::size_of::<AtomicU64>()
            })
            .sum()
    }

    /// How many chunks have materialized each array, for the memory report.
    pub fn materialized_chunks(&self) -> (usize, usize) {
        let times = self
            .chunks
            .iter()
            .filter(|c| c.times.get().is_some())
            .count();
        let totals = self
            .chunks
            .iter()
            .filter(|c| c.totals.get().is_some())
            .count();
        (times, totals)
    }
}

/// Read a biased timestamp slot. `None` means "not computed".
pub fn load_time(slot: &AtomicU64) -> Option<Timestamp> {
    match slot.load(Ordering::Relaxed) {
        0 => None,
        biased => Some(Timestamp::from_value(biased - 1)),
    }
}

/// Write a timestamp slot, biased by one so zero stays free as "not computed".
///
/// `Timestamp::MAX` wraps to zero and so never caches; see the module docs.
pub fn store_time(slot: &AtomicU64, value: Timestamp) {
    slot.store((*value).wrapping_add(1), Ordering::Relaxed);
}
