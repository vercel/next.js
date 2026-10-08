use std::{
    cmp::{max, min},
    env,
    num::NonZeroUsize,
    sync::{OnceLock, atomic::AtomicU64},
};

use rustc_hash::FxHashSet;
use turbo_rcstr::{RcStr, rcstr};

use crate::{
    chunked_vec::ChunkedVec,
    self_time_tree::SelfTimeTree,
    span::{Span, SpanArgs, SpanEvent, SpanIndex, SpanTimeData},
    span_ref::SpanRef,
    timestamp::Timestamp,
};

pub type SpanId = NonZeroUsize;

/// This max depth is used to avoid deep recursion in the span tree,
/// which can lead to stack overflows and performance issues.
/// Spans deeper than this depth will be re-parented to an ancestor
/// at the cut-off depth (Flattening).
const CUT_OFF_DEPTH: u32 = 80;

/// A single process sample: (timestamp, memory_bytes, memory_pressure,
/// active_worker_threads). Sorted by timestamp. `memory_pressure` is an
/// OS-reported value in `0..=100`; `0` is used if unavailable.
type MemorySample = (Timestamp, u64, u8, u64);

/// Maximum number of memory samples returned in a query result.
const MAX_MEMORY_SAMPLES: usize = 200;
/// Maximum number of equal-duration concurrency segments in a span query.
const MAX_CONCURRENCY_SAMPLES: usize = 200;

pub struct Store {
    pub(crate) spans: ChunkedVec<Span>,
    pub(crate) self_time_tree: Option<SelfTimeTree<SpanIndex>>,
    max_self_time_lookup_time: AtomicU64,
    /// Global sorted list of process memory and worker samples.
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
        self_allocations: 0,
        self_allocation_count: 0,
        self_deallocations: 0,
        self_deallocation_count: 0,
        totals: OnceLock::new(),
        time_data: SpanTimeData {
            self_end: Timestamp::MAX,
            ..Default::default()
        },
        extra: OnceLock::new(),
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
        }
    }

    pub fn reset(&mut self) {
        self.spans = ChunkedVec::new();
        self.spans.push(new_root_span());
        if let Some(tree) = self.self_time_tree.as_mut() {
            *tree = SelfTimeTree::new();
        }
        *self.max_self_time_lookup_time.get_mut() = 0;
        self.memory_samples.clear();
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
        let ignore_self_time = &name == "thread"
            || &name == "blocking"
            || args
                .iter()
                .any(|(key, value)| key.as_str() == "blocking" && value.as_str() == "true");
        self.spans.push(Span {
            parent,
            depth: 0,
            start,
            category,
            name,
            args,
            events: Default::default(),
            is_complete: false,
            self_allocations: 0,
            self_allocation_count: 0,
            self_deallocations: 0,
            self_deallocation_count: 0,
            totals: OnceLock::new(),
            time_data: SpanTimeData {
                self_end: start,
                ignore_self_time,
                ..Default::default()
            },
            extra: OnceLock::new(),
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
            parent.events.push(SpanEvent::Child { start, index: id });
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
        // Waiting intervals still extend the elapsed range, but contribute no
        // work and must not affect other intervals' concurrency correction.
        outdated_spans.insert(span_index);
        time_data.self_end = max(time_data.self_end, end);
        if time_data.ignore_self_time {
            return;
        }
        time_data.self_time += end - start;
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
        if self.spans[span_index.get()].time_data.ignore_self_time {
            let span = &mut self.spans[span_index.get()];
            span.start = start_time;
            span.time_data.self_end = start_time + total_time;
            outdated_spans.insert(span_index);
            return;
        }
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
            events.push(SpanEvent::Child { start, index });
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
        old_parent.events.retain_unordered(
            |event: &SpanEvent| !matches!(event, SpanEvent::Child { index, .. } if *index == span_index),
        );

        outdated_spans.insert(parent);
        let parent = &mut self.spans[parent.get()];
        parent.events.push(SpanEvent::Child {
            start: span_start,
            index: span_index,
        });
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

    pub fn add_memory_sample(
        &mut self,
        ts: Timestamp,
        memory: u64,
        memory_pressure: u8,
        active_worker_threads: u64,
    ) {
        // Samples arrive nearly sorted (roughly chronological from the trace
        // writer), so an insertion-sort step is efficient: push to the end
        // then swap backward until the timestamp ordering is restored.
        self.memory_samples
            .push((ts, memory, memory_pressure, active_worker_threads));
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
            .map(|(_, mem, _, _)| mem)
            .collect()
    }

    /// Like `memory_samples_for_range` but keeps the timestamps and the
    /// memory-pressure byte and active worker count. Timestamps are absolute
    /// store timestamps (same reference frame as span start/end). When the raw
    /// slice exceeds `MAX_MEMORY_SAMPLES`, each merged group is represented by
    /// the sample whose memory value was the group's max (its timestamp,
    /// pressure, and worker count are kept alongside it).
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
            .map(|chunk| *chunk.iter().max_by_key(|(_, mem, _, _)| *mem).unwrap())
            .collect()
    }

    /// Returns worker counts from the same max-memory samples selected by
    /// [`Self::memory_samples_for_range`], in the same order.
    pub fn active_worker_threads_samples_for_range(
        &self,
        start: Timestamp,
        end: Timestamp,
    ) -> Vec<u64> {
        self.memory_samples_for_range_with_ts(start, end)
            .into_iter()
            .map(|(_, _, _, workers)| workers)
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
            return slice.iter().map(|(_, _, p, _)| *p).collect();
        }

        let n = count.div_ceil(MAX_MEMORY_SAMPLES);
        slice
            .chunks(n)
            .map(|chunk| chunk.iter().map(|(_, _, p, _)| *p).max().unwrap())
            .collect()
    }

    /// Average global self-time concurrency across equal-duration segments
    /// of `[start, end)`. When corrected-time indexing is disabled, there is
    /// no tree to query and the series is omitted.
    pub fn concurrency_samples_for_range(&self, start: Timestamp, end: Timestamp) -> Vec<f64> {
        self.self_time_tree.as_ref().map_or_else(Vec::new, |tree| {
            tree.lookup_range_concurrency_samples(start, end, MAX_CONCURRENCY_SAMPLES)
        })
    }

    fn memory_samples_slice(&self, start: Timestamp, end: Timestamp) -> &[MemorySample] {
        // Binary search for the first sample >= start
        let lo = self
            .memory_samples
            .partition_point(|(ts, _, _, _)| *ts < start);
        // Binary search for the first sample > end
        let hi = self
            .memory_samples
            .partition_point(|(ts, _, _, _)| *ts <= end);
        &self.memory_samples[lo..hi]
    }

    pub fn complete_span(&mut self, span_index: SpanIndex) {
        let span = &mut self.spans[span_index.get()];
        span.is_complete = true;
    }

    pub fn invalidate_outdated_spans(&mut self, outdated_spans: &FxHashSet<SpanId>) {
        fn invalidate_span(span: &mut Span) {
            span.time_data.end.take();
            span.time_data.total_time.take();
            span.time_data.corrected_self_time.take();
            span.time_data.corrected_total_time.take();
            // Invalidates the cached corrected self time of all self-time events of this span
            // in O(1). Iterating the events here made loading quadratic for spans with many
            // events, as this runs for every batch read from the trace file.
            span.time_data.self_time_events_generation += 1;
            span.totals.take();
            span.extra.take();
        }

        for id in outdated_spans.iter() {
            let mut span = &mut self.spans[id.get()];
            loop {
                invalidate_span(span);
                let Some(parent) = span.parent else {
                    break;
                };
                if outdated_spans.contains(&parent) {
                    break;
                }
                span = &mut self.spans[parent.get()];
            }
        }

        invalidate_span(&mut self.spans[0]);
    }

    pub fn root_spans(&self) -> impl Iterator<Item = SpanRef<'_>> {
        self.spans[0].events.iter().filter_map(|event| match event {
            &SpanEvent::Child { index: id, .. } => Some(SpanRef {
                span: &self.spans[id.get()],
                store: self,
                index: id.get(),
            }),
            _ => None,
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

#[cfg(test)]
mod tests {
    use std::thread;

    use super::*;
    use crate::span_ref::SpanEventRef;

    #[test]
    fn blocking_total_time_preserves_ranges_and_counted_children() {
        let mut store = Store::new();
        let mut outdated = FxHashSet::default();
        let parent = store.add_span(
            None,
            Timestamp::from_micros(5),
            rcstr!("test"),
            rcstr!("waiting"),
            vec![(rcstr!("blocking"), rcstr!("true"))].into(),
            &mut outdated,
        );
        let child = store.add_span(
            Some(parent),
            Timestamp::from_micros(10),
            rcstr!("test"),
            rcstr!("external work"),
            SpanArgs::new(),
            &mut outdated,
        );
        store.set_total_time(
            child,
            Timestamp::from_micros(10),
            Timestamp::from_micros(10),
            &mut outdated,
        );
        store.set_total_time(
            parent,
            Timestamp::from_micros(5),
            Timestamp::from_micros(25),
            &mut outdated,
        );
        store.invalidate_outdated_spans(&outdated);
        let parent = store.root_spans().next().unwrap();
        assert_eq!(parent.start(), Timestamp::from_micros(5));
        assert_eq!(parent.end(), Timestamp::from_micros(30));
        assert_eq!(parent.self_time(), Timestamp::ZERO);
        assert_eq!(parent.total_time(), Timestamp::from_micros(10));
        assert_eq!(parent.corrected_total_time(), Timestamp::from_micros(10));
        assert_eq!(
            store.concurrency_samples_for_range(
                Timestamp::from_micros(5),
                Timestamp::from_micros(10)
            ),
            vec![0.0; 200]
        );
    }

    #[test]
    fn concurrency_samples_are_empty_without_a_self_time_tree() {
        let mut store = Store::new();
        store.self_time_tree = None;
        assert!(
            store
                .concurrency_samples_for_range(Timestamp::ZERO, Timestamp::from_value(100))
                .is_empty()
        );
    }

    #[test]
    fn downsampling_keeps_worker_count_from_max_memory_sample() {
        let mut store = Store::new();
        for i in 0..=MAX_MEMORY_SAMPLES {
            store.add_memory_sample(Timestamp::from_micros(i as u64), i as u64, 3, 1);
        }
        store.add_memory_sample(Timestamp::from_micros(201), 5000, 9, 4);
        let samples = store.memory_samples_for_range_with_ts(
            Timestamp::from_micros(0),
            Timestamp::from_micros(201),
        );
        assert!(samples.len() <= MAX_MEMORY_SAMPLES);
        assert!(samples.iter().any(|(_, mem, pressure, workers)| {
            *mem == 5000 && *pressure == 9 && *workers == 4
        }));

        let start = Timestamp::from_micros(0);
        let end = Timestamp::from_micros(201);
        let memory = store.memory_samples_for_range(start, end);
        let workers = store.active_worker_threads_samples_for_range(start, end);
        assert_eq!(workers.len(), memory.len());
        assert_eq!(
            workers,
            samples.iter().map(|sample| sample.3).collect::<Vec<_>>()
        );
        assert_eq!(
            memory
                .iter()
                .position(|&value| value == 5000)
                .map(|i| workers[i]),
            Some(4)
        );
        assert!(
            store
                .active_worker_threads_samples_for_range(Timestamp::from_micros(202), end)
                .is_empty()
        );
    }

    fn ts(micros: u64) -> Timestamp {
        Timestamp::from_micros(micros)
    }

    fn add_span(store: &mut Store, parent: Option<SpanIndex>, start: u64) -> SpanIndex {
        store.add_span(
            parent,
            ts(start),
            RcStr::default(),
            RcStr::from("span"),
            SpanArgs::new(),
            &mut FxHashSet::default(),
        )
    }

    /// Adds a self time and drops the resulting outdated spans, so tests control exactly
    /// which spans get invalidated.
    fn add_self_time_without_invalidation(
        store: &mut Store,
        span: SpanIndex,
        start: u64,
        end: u64,
    ) {
        store.add_self_time(span, ts(start), ts(end), &mut FxHashSet::default());
    }

    fn invalidate(store: &mut Store, spans: &[SpanIndex]) {
        store.invalidate_outdated_spans(&spans.iter().copied().collect());
    }

    /// Corrected self times of the self-time events of `span`.
    fn event_corrected_self_times(store: &Store, span: SpanIndex) -> Vec<Timestamp> {
        corrected_self_times_of(SpanRef {
            span: &store.spans[span.get()],
            store,
            index: span.get(),
        })
    }

    fn corrected_self_times_of(span: SpanRef<'_>) -> Vec<Timestamp> {
        span.events()
            .filter_map(|event| match event {
                SpanEventRef::SelfTime { self_time } => Some(self_time.corrected_self_time()),
                SpanEventRef::Child { .. } => None,
            })
            .collect()
    }

    #[test]
    fn corrected_self_time_cached_until_invalidated() {
        let mut store = Store::new();
        let a = add_span(&mut store, None, 0);
        add_self_time_without_invalidation(&mut store, a, 0, 10);
        invalidate(&mut store, &[a]);
        assert_eq!(event_corrected_self_times(&store, a), vec![ts(10)]);

        // A concurrent self time halves the corrected self time of `a`...
        let b = add_span(&mut store, None, 0);
        add_self_time_without_invalidation(&mut store, b, 0, 10);
        invalidate(&mut store, &[b]);
        assert_eq!(event_corrected_self_times(&store, b), vec![ts(5)]);
        // ...but `a` was not invalidated, so its cached value is still used.
        assert_eq!(event_corrected_self_times(&store, a), vec![ts(10)]);

        invalidate(&mut store, &[a]);
        assert_eq!(event_corrected_self_times(&store, a), vec![ts(5)]);
    }

    #[test]
    fn invalidation_propagates_to_ancestors() {
        let mut store = Store::new();
        let grandparent = add_span(&mut store, None, 0);
        let parent = add_span(&mut store, Some(grandparent), 0);
        let child = add_span(&mut store, Some(parent), 0);
        add_self_time_without_invalidation(&mut store, grandparent, 0, 10);
        add_self_time_without_invalidation(&mut store, parent, 10, 20);
        add_self_time_without_invalidation(&mut store, child, 20, 30);
        invalidate(&mut store, &[grandparent, parent, child]);
        for span in [grandparent, parent, child] {
            assert_eq!(event_corrected_self_times(&store, span), vec![ts(10)]);
        }

        // Concurrent self time in an unrelated span, overlapping all three self times.
        let other = add_span(&mut store, None, 0);
        add_self_time_without_invalidation(&mut store, other, 0, 30);
        for span in [grandparent, parent, child] {
            assert_eq!(event_corrected_self_times(&store, span), vec![ts(10)]);
        }

        // Invalidating only the child invalidates its ancestors too.
        invalidate(&mut store, &[child]);
        for span in [grandparent, parent, child] {
            assert_eq!(event_corrected_self_times(&store, span), vec![ts(5)]);
        }
    }

    #[test]
    fn invalidation_always_includes_root() {
        let mut store = Store::new();
        // The public API never adds self time to the root span (its index is 0), but its
        // self-time event caches must still be invalidated like any other span's.
        store.spans[0]
            .events
            .push(SpanEvent::self_time(ts(0), ts(10)).unwrap());
        let a = add_span(&mut store, None, 0);
        add_self_time_without_invalidation(&mut store, a, 0, 10);
        invalidate(&mut store, &[a]);
        assert_eq!(corrected_self_times_of(store.root_span()), vec![ts(10)]);

        // A second concurrent self time halves the corrected time of the root's event, which
        // is only picked up once the root is invalidated.
        let b = add_span(&mut store, None, 0);
        add_self_time_without_invalidation(&mut store, b, 0, 10);
        assert_eq!(corrected_self_times_of(store.root_span()), vec![ts(10)]);

        // Invalidating any span invalidates the root.
        let child = add_span(&mut store, Some(a), 20);
        invalidate(&mut store, &[child]);
        assert_eq!(corrected_self_times_of(store.root_span()), vec![ts(5)]);
    }

    /// Builds a store with many overlapping self times.
    fn overlapping_store() -> (Store, Vec<SpanIndex>) {
        let mut store = Store::new();
        let mut spans = Vec::new();
        let mut outdated = FxHashSet::default();
        for i in 0..200u64 {
            let parent = spans.get((i / 10) as usize).copied();
            let span = add_span(&mut store, parent, i);
            for j in 0..5 {
                let start = (i * 7 + j * 13) % 500;
                store.add_self_time(span, ts(start), ts(start + 20 + i % 30), &mut outdated);
            }
            spans.push(span);
        }
        store.invalidate_outdated_spans(&outdated);
        (store, spans)
    }

    #[test]
    fn concurrent_corrected_self_time_matches_serial() {
        let (serial_store, spans) = overlapping_store();
        let serial: Vec<_> = spans
            .iter()
            .map(|&span| event_corrected_self_times(&serial_store, span))
            .collect();

        let (store, spans) = overlapping_store();
        thread::scope(|scope| {
            let handles: Vec<_> = (0..8)
                .map(|offset| {
                    let store = &store;
                    let spans = &spans;
                    scope.spawn(move || {
                        // Each thread visits the spans in a different order.
                        let mut result = vec![Vec::new(); spans.len()];
                        for i in 0..spans.len() {
                            let i = (i + offset * 25) % spans.len();
                            result[i] = event_corrected_self_times(store, spans[i]);
                        }
                        result
                    })
                })
                .collect();
            for handle in handles {
                assert_eq!(handle.join().unwrap(), serial);
            }
        });
    }
}
