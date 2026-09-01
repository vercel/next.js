use std::{
    cmp::{max, min},
    env,
    num::NonZeroUsize,
    sync::{
        OnceLock, RwLock,
        atomic::{AtomicU8, AtomicU64, Ordering},
    },
};

use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks_malloc::TurboMalloc;

use crate::{
    chunked_vec::ChunkedVec,
    cold::ColdStore,
    memory_report::MemoryReport,
    self_time_tree::SelfTimeTree,
    span::{MAX_DEPTH_UNSET, Span, SpanArgs, SpanEvent, SpanExtra, SpanIndex, SpanTimeData},
    span_ref::SpanRef,
    timestamp::Timestamp,
};

pub type SpanId = NonZeroUsize;

/// This max depth is used to avoid deep recursion in the span tree,
/// which can lead to stack overflows and performance issues.
/// Spans deeper than this depth will be re-parented to an ancestor
/// at the cut-off depth (Flattening).
const CUT_OFF_DEPTH: u32 = 80;

/// A single memory usage sample: (timestamp, memory_bytes, memory_pressure).
/// Sorted by timestamp. `memory_pressure` is an OS-reported pressure value in
/// the range `0..=100`; `0` is used when the reporter platform did not expose
/// a pressure signal.
type MemorySample = (Timestamp, u64, u8);

/// Maximum number of memory samples returned in a query result.
const MAX_MEMORY_SAMPLES: usize = 200;

pub struct Store {
    pub(crate) spans: ChunkedVec<Span>,
    /// Per-span graph / bottom-up / search-index caches, keyed by span index.
    ///
    /// Held here rather than as a field on `Span` because only a handful of spans
    /// ever get one — the roots, and whatever the user expands — while a field
    /// costs 16 bytes on every span in the trace. Boxed so entries have a stable
    /// address; see [`Store::extra`].
    extra: RwLock<FxHashMap<usize, Box<SpanExtra>>>,
    /// The derived half of every span, lazily allocated per chunk. See
    /// [`crate::cold`].
    pub(crate) cold: ColdStore,
    pub(crate) self_time_tree: Option<SelfTimeTree<SpanIndex>>,
    max_self_time_lookup_time: AtomicU64,
    /// Global sorted list of memory samples (timestamp, memory_bytes).
    memory_samples: Vec<MemorySample>,
}

fn new_root_span() -> Span {
    Span {
        parent: None,
        depth: 0,
        start: Timestamp::MAX,
        category: RcStr::default(),
        name: rcstr!("(root)"),
        args: SpanArgs::new(),
        events: Default::default(),
        is_complete: true,
        max_depth: AtomicU8::new(MAX_DEPTH_UNSET),
        self_allocations: 0,
        self_allocation_count: 0,
        self_deallocations: 0,
        self_deallocation_count: 0,
        time_data: SpanTimeData {
            self_end: Timestamp::MAX,
            ..Default::default()
        },
        names: OnceLock::new(),
    }
}

impl Store {
    pub fn new() -> Self {
        let mut spans = ChunkedVec::new();
        spans.push(new_root_span());
        Self {
            spans,
            self_time_tree: env::var("NO_CORRECTED_TIME")
                .ok()
                .is_none()
                .then(SelfTimeTree::new),
            max_self_time_lookup_time: AtomicU64::new(0),
            memory_samples: Vec::new(),
            extra: RwLock::new(FxHashMap::default()),
            cold: ColdStore::new(),
        }
    }

    /// The [`SpanExtra`] for a span, creating it on first touch.
    ///
    /// Returns a reference tied to `&self` even though the entry is created
    /// behind a lock. That is what lets `SpanRef::extra` keep its signature, so
    /// `span_graph_ref` and `span_bottom_up_ref` need no changes.
    pub(crate) fn extra(&self, index: usize) -> &SpanExtra {
        // Fast path: already present. Under a read lock so the viewer's parallel
        // warm-up does not serialize on a mutex.
        if let Some(extra) = self.extra.read().unwrap().get(&index) {
            let ptr: *const SpanExtra = &**extra;
            // SAFETY: as below.
            return unsafe { &*ptr };
        }
        let ptr: *const SpanExtra = {
            let mut map = self.extra.write().unwrap();
            &**map.entry(index).or_default()
        };
        // SAFETY: the pointee is a `Box` on the heap, so its address is stable
        // for as long as it stays in the map — rehashing moves the `Box`, not
        // what it points to. Entries are removed only by
        // `invalidate_outdated_spans` and `reset`, both of which take `&mut self`
        // and so cannot run while the `&self` borrow this reference is tied to is
        // alive.
        //
        // The lock is released before returning, and deliberately before any
        // caller runs a `get_or_init` closure on the result: those closures
        // recurse into other spans' `extra`, which would deadlock otherwise.
        unsafe { &*ptr }
    }

    pub fn reset(&mut self) {
        self.spans = ChunkedVec::new();
        self.spans.push(new_root_span());
        if let Some(tree) = self.self_time_tree.as_mut() {
            *tree = SelfTimeTree::new();
        }
        *self.max_self_time_lookup_time.get_mut() = 0;
        self.memory_samples.clear();
        self.extra.write().unwrap().clear();
        self.cold.clear();
    }

    /// Walk the store and add up where its bytes actually went. See
    /// [`crate::memory_report`]. Takes `&mut self` so the per-span `SmallVec`
    /// capacities can be read without going through `LazySortedVec`'s sorting
    /// `Deref` (which would also mutate) and without unsafe.
    pub fn memory_report(&mut self) -> MemoryReport {
        let mut report = MemoryReport {
            spans: self.spans.len(),
            span_size: std::mem::size_of::<Span>(),
            span_chunk_bytes: self.spans.allocated_bytes(),
            event_size: std::mem::size_of::<SpanEvent>(),
            self_time_entries: self.self_time_tree.as_ref().map_or(0, |t| t.len()),
            self_time_bytes: self
                .self_time_tree
                .as_ref()
                .map_or(0, |t| t.allocated_bytes()),
            memory_sample_bytes: self.memory_samples.capacity()
                * std::mem::size_of::<MemorySample>(),
            allocator_live_bytes: TurboMalloc::memory_usage(),
            extra_populated: self.extra.read().unwrap().len(),
            cold_bytes: self.cold.allocated_bytes(),
            cold_chunks: self.cold.materialized_chunks(),
            ..Default::default()
        };

        for span in self.spans.iter_mut() {
            report.names_populated += span.names.get().is_some() as usize;

            report.args += span.args.len();
            if span.args.spilled() {
                report.arg_spilled_spans += 1;
                report.arg_heap_bytes +=
                    span.args.capacity() * std::mem::size_of::<(RcStr, RcStr)>();
            }

            let (len, capacity, spilled) = span.events.storage_stats();
            report.events += len;
            if spilled {
                report.event_spilled_spans += 1;
                report.event_heap_bytes += capacity * std::mem::size_of::<SpanEvent>();
            }
        }

        report
    }

    pub fn optimize(&mut self) {
        if let Some(tree) = self.self_time_tree.as_mut() {
            tree.optimize();
        }
    }

    pub fn has_time_info(&self) -> bool {
        self.self_time_tree
            .as_ref()
            .is_none_or(|tree| tree.len() > 0)
    }

    pub fn add_span(
        &mut self,
        parent: Option<SpanIndex>,
        start: Timestamp,
        category: RcStr,
        name: RcStr,
        args: SpanArgs,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) -> SpanIndex {
        let id = SpanIndex::new(self.spans.len()).unwrap();
        self.cold.reserve_for(id.get());
        let ignore_self_time = &name == "thread" || &name == "blocking";
        self.spans.push(Span {
            parent,
            depth: 0,
            start,
            category,
            name,
            args,
            events: Default::default(),
            is_complete: false,
            max_depth: AtomicU8::new(MAX_DEPTH_UNSET),
            self_allocations: 0,
            self_allocation_count: 0,
            self_deallocations: 0,
            self_deallocation_count: 0,
            time_data: SpanTimeData {
                self_end: start,
                ignore_self_time,
                ..Default::default()
            },
            names: OnceLock::new(),
        });
        let mut parent = if let Some(parent) = parent {
            outdated_spans.insert(parent);
            &mut self.spans[parent.get()]
        } else {
            &mut self.spans[0]
        };
        let mut depth = parent.depth + 1;
        if depth >= CUT_OFF_DEPTH
            && let Some(parent_of_parent) = parent.parent
        {
            outdated_spans.insert(parent_of_parent);
            self.spans[id.get()].parent = Some(parent_of_parent);
            parent = &mut self.spans[parent_of_parent.get()];
            depth = CUT_OFF_DEPTH - 1;
        }
        if depth < CUT_OFF_DEPTH {
            parent.events.push(SpanEvent::child(start, id));
        }
        parent.start = min(parent.start, start);
        let span = &mut self.spans[id.get()];
        span.depth = depth;
        id
    }

    pub fn add_args(
        &mut self,
        span_index: SpanIndex,
        args: SpanArgs,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        let span = &mut self.spans[span_index.get()];
        span.args.extend(args);
        outdated_spans.insert(span_index);
    }

    pub fn set_max_self_time_lookup(&self, time: Timestamp) {
        let time = *time;
        let mut old = self
            .max_self_time_lookup_time
            .load(std::sync::atomic::Ordering::Relaxed);
        while old < time {
            match self.max_self_time_lookup_time.compare_exchange(
                old,
                time,
                std::sync::atomic::Ordering::Relaxed,
                std::sync::atomic::Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(real_old) => old = real_old,
            }
        }
    }

    fn insert_self_time(
        &mut self,
        start: Timestamp,
        end: Timestamp,
        span_index: SpanIndex,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        if let Some(tree) = self.self_time_tree.as_mut() {
            if Timestamp::from_value(*self.max_self_time_lookup_time.get_mut()) >= start {
                tree.for_each_in_range_optimize(start, end, &mut |_, _, span| {
                    outdated_spans.insert(*span);
                });
            }
            tree.insert(start, end, span_index);
        }
    }

    pub fn add_self_time(
        &mut self,
        span_index: SpanIndex,
        start: Timestamp,
        end: Timestamp,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        let event = SpanEvent::self_time(start, end);
        let span = &mut self.spans[span_index.get()];
        let time_data = &mut span.time_data;
        if time_data.ignore_self_time {
            return;
        }
        outdated_spans.insert(span_index);
        time_data.self_time += end - start;
        time_data.self_end = max(time_data.self_end, end);
        if let Some(event) = event {
            span.events.push(event);
            self.insert_self_time(start, end, span_index, outdated_spans);
        }
    }

    pub fn set_total_time(
        &mut self,
        span_index: SpanIndex,
        start_time: Timestamp,
        total_time: Timestamp,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        let span = SpanRef {
            span: &self.spans[span_index.get()],
            store: self,
            index: span_index.get(),
        };
        let mut children = span
            .children()
            .map(|c| (c.span.start, c.span.time_data.self_end, c.index()))
            .collect::<Vec<_>>();
        children.sort();
        let self_end = start_time + total_time;
        let mut self_time = Timestamp::ZERO;
        let mut current = start_time;
        let mut events = Vec::new();
        for (start, end, index) in children {
            if start > current {
                if start > self_end {
                    if let Some(event) = SpanEvent::self_time(current, self_end) {
                        events.push(event);
                        self.insert_self_time(current, self_end, span_index, outdated_spans);
                        self_time += self_end - current;
                    }
                    break;
                }
                if let Some(event) = SpanEvent::self_time(current, start) {
                    events.push(event);
                    self.insert_self_time(current, start, span_index, outdated_spans);
                    self_time += start - current;
                }
            }
            events.push(SpanEvent::child(start, index));
            current = max(current, end);
        }
        current -= start_time;
        if current < total_time {
            self_time += total_time - current;
            let st = current + start_time;
            let en = start_time + total_time;
            if let Some(event) = SpanEvent::self_time(st, en) {
                events.push(event);
                self.insert_self_time(st, en, span_index, outdated_spans);
            }
        }
        let span = &mut self.spans[span_index.get()];
        outdated_spans.insert(span_index);
        let time_data = &mut span.time_data;
        time_data.self_time = self_time;
        time_data.self_end = self_end;
        span.events = events.into();
        span.start = start_time;
    }

    pub fn set_parent(
        &mut self,
        span_index: SpanIndex,
        parent: SpanIndex,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        outdated_spans.insert(span_index);
        let span = &mut self.spans[span_index.get()];
        let span_start = span.start;

        let old_parent = span.parent.replace(parent);
        let old_parent = if let Some(parent) = old_parent {
            outdated_spans.insert(parent);
            &mut self.spans[parent.get()]
        } else {
            &mut self.spans[0]
        };
        old_parent
            .events
            .retain_unordered(|event: &SpanEvent| event.child_index() != Some(span_index));

        outdated_spans.insert(parent);
        let parent = &mut self.spans[parent.get()];
        parent.events.push(SpanEvent::child(span_start, span_index));
    }

    pub fn add_allocation(
        &mut self,
        span_index: SpanIndex,
        allocation: u64,
        count: u64,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        let span = &mut self.spans[span_index.get()];
        outdated_spans.insert(span_index);
        span.self_allocations += allocation;
        span.self_allocation_count += count;
    }

    pub fn add_deallocation(
        &mut self,
        span_index: SpanIndex,
        deallocation: u64,
        count: u64,
        outdated_spans: &mut FxHashSet<SpanIndex>,
    ) {
        let span = &mut self.spans[span_index.get()];
        outdated_spans.insert(span_index);
        span.self_deallocations += deallocation;
        span.self_deallocation_count += count;
    }

    pub fn add_memory_sample(&mut self, ts: Timestamp, memory: u64, memory_pressure: u8) {
        // Samples arrive nearly sorted (roughly chronological from the trace
        // writer), so an insertion-sort step is efficient: push to the end
        // then swap backward until the timestamp ordering is restored.
        self.memory_samples.push((ts, memory, memory_pressure));
        let mut i = self.memory_samples.len() - 1;
        while i > 0 && self.memory_samples[i - 1].0 > ts {
            self.memory_samples.swap(i, i - 1);
            i -= 1;
        }
    }

    /// Returns up to `MAX_MEMORY_SAMPLES` memory samples in the range
    /// `[start, end]`. When more samples exist, groups of N consecutive
    /// samples are merged by taking the maximum memory value in each group.
    pub fn memory_samples_for_range(&self, start: Timestamp, end: Timestamp) -> Vec<u64> {
        self.memory_samples_for_range_with_ts(start, end)
            .into_iter()
            .map(|(_, mem, _)| mem)
            .collect()
    }

    /// Like `memory_samples_for_range` but keeps the timestamps and the
    /// memory-pressure byte. Timestamps are absolute store timestamps (same
    /// reference frame as span start/end). When the raw slice exceeds
    /// `MAX_MEMORY_SAMPLES`, each merged group is represented by the sample
    /// whose memory value was the group's max (its timestamp and pressure
    /// byte are kept alongside it).
    pub fn memory_samples_for_range_with_ts(
        &self,
        start: Timestamp,
        end: Timestamp,
    ) -> Vec<MemorySample> {
        let slice = self.memory_samples_slice(start, end);
        let count = slice.len();
        if count == 0 {
            return Vec::new();
        }

        if count <= MAX_MEMORY_SAMPLES {
            return slice.to_vec();
        }

        // Merge groups of N samples, taking the max memory in each group and
        // keeping the timestamp and pressure of that max sample.
        let n = count.div_ceil(MAX_MEMORY_SAMPLES);
        slice
            .chunks(n)
            .map(|chunk| *chunk.iter().max_by_key(|(_, mem, _)| *mem).unwrap())
            .collect()
    }

    /// Returns up to `MAX_MEMORY_SAMPLES` memory pressure values in the range
    /// `[start, end]`. The returned slice has the same length and group
    /// boundaries as [`Self::memory_samples_for_range`] so that the two
    /// results can be rendered in parallel. Each group is downsampled by
    /// taking the maximum pressure value.
    pub fn memory_pressure_samples_for_range(&self, start: Timestamp, end: Timestamp) -> Vec<u8> {
        let slice = self.memory_samples_slice(start, end);
        let count = slice.len();
        if count == 0 {
            return Vec::new();
        }

        if count <= MAX_MEMORY_SAMPLES {
            return slice.iter().map(|(_, _, p)| *p).collect();
        }

        let n = count.div_ceil(MAX_MEMORY_SAMPLES);
        slice
            .chunks(n)
            .map(|chunk| chunk.iter().map(|(_, _, p)| *p).max().unwrap())
            .collect()
    }

    fn memory_samples_slice(&self, start: Timestamp, end: Timestamp) -> &[MemorySample] {
        // Binary search for the first sample >= start
        let lo = self
            .memory_samples
            .partition_point(|(ts, _, _)| *ts < start);
        // Binary search for the first sample > end
        let hi = self.memory_samples.partition_point(|(ts, _, _)| *ts <= end);
        &self.memory_samples[lo..hi]
    }

    pub fn complete_span(&mut self, span_index: SpanIndex) {
        let span = &mut self.spans[span_index.get()];
        span.is_complete = true;
    }

    pub fn invalidate_outdated_spans(&mut self, outdated_spans: &FxHashSet<SpanId>) {
        // Events hold no cache of their own, and the derived timestamps and
        // totals are no longer fields, so per-span invalidation is now: reset the
        // `max_depth` byte, drop the side-table entry, and zero the cold slots.
        // During a headless ingest the cold chunks were never allocated, so that
        // last step short-circuits and this whole pass — which runs over every
        // ancestor of every touched span after each read batch — does almost
        // nothing.
        let spans = &mut self.spans;
        let extra = self.extra.get_mut().unwrap();
        let cold = &mut self.cold;

        // The walk carries the index rather than just the reference, because both
        // side structures are keyed by it.
        for id in outdated_spans.iter() {
            let mut index = id.get();
            loop {
                extra.remove(&index);
                cold.invalidate(index);
                let span = &mut spans[index];
                span.max_depth.store(MAX_DEPTH_UNSET, Ordering::Relaxed);
                let Some(parent) = span.parent else {
                    break;
                };
                if outdated_spans.contains(&parent) {
                    break;
                }
                index = parent.get();
            }
        }

        extra.remove(&0);
        cold.invalidate(0);
        spans[0].max_depth.store(MAX_DEPTH_UNSET, Ordering::Relaxed);
    }

    /// Force every derived value, as a client rendering the whole trace would.
    ///
    /// Diagnostic only, for `MEMORY_REPORT=warm`. Headless ingest leaves the
    /// derived half entirely unallocated, so without this the report only ever
    /// shows the ingest peak — but the server also has to *serve*, and that is
    /// the number that decides whether it fits on a small machine.
    pub fn warm_all_derived(&self) {
        let root = self.root_span();
        root.max_depth();
        root.end();
        root.total_time();
        root.corrected_total_time();
        root.total_span_count();
    }

    pub fn root_spans(&self) -> impl Iterator<Item = SpanRef<'_>> {
        self.spans[0].events.iter().filter_map(|event| {
            let id = event.child_index()?;
            Some(SpanRef {
                span: &self.spans[id.get()],
                store: self,
                index: id.get(),
            })
        })
    }

    pub fn root_span(&self) -> SpanRef<'_> {
        SpanRef {
            span: &self.spans[0],
            store: self,
            index: 0,
        }
    }

    pub fn span(&self, id: SpanId) -> Option<(SpanRef<'_>, bool)> {
        let id = id.get();
        let is_graph = id & 1 == 1;
        let index = id >> 1;
        self.spans.get(index).map(|span| {
            (
                SpanRef {
                    span,
                    store: self,
                    index,
                },
                is_graph,
            )
        })
    }
}
