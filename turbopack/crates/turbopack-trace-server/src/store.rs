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

    /// Returns up to `limit` memory samples in the range `[start, end]`.
    /// When more samples exist, groups of consecutive samples are merged by
    /// taking the maximum memory value in each group.
    pub fn memory_samples_for_range(
        &self,
        start: Timestamp,
        end: Timestamp,
        limit: usize,
    ) -> Vec<u64> {
        self.memory_samples_for_range_with_ts(start, end, limit)
            .into_iter()
            .map(|(_, mem, _, _)| mem)
            .collect()
    }

    /// Like `memory_samples_for_range` but keeps the timestamps and the
    /// memory-pressure byte and active worker count. Timestamps are absolute
    /// store timestamps (same reference frame as span start/end). When the raw
    /// slice exceeds `limit`, each merged group is represented by the sample
    /// whose memory value was the group's max (its timestamp, pressure, and
    /// worker count are kept alongside it).
    pub fn memory_samples_for_range_with_ts(
        &self,
        start: Timestamp,
        end: Timestamp,
        limit: usize,
    ) -> Vec<MemorySample> {
        if limit == 0 {
            return Vec::new();
        }
        let slice = self.memory_samples_slice(start, end);
        let count = slice.len();
        if count == 0 {
            return Vec::new();
        }

        if count <= limit {
            return slice.to_vec();
        }

        // Merge groups of N samples, taking the max memory in each group and
        // keeping the timestamp and pressure of that max sample.
        let n = count.div_ceil(limit);
        slice
            .chunks(n)
            .map(|chunk| *chunk.iter().max_by_key(|(_, mem, _, _)| *mem).unwrap())
            .collect()
    }

    /// Returns worker counts from the same max-memory samples selected by
    /// [`Self::memory_samples_for_range`] with the same `limit`, in the same order.
    pub fn active_worker_threads_samples_for_range(
        &self,
        start: Timestamp,
        end: Timestamp,
        limit: usize,
    ) -> Vec<u64> {
        self.memory_samples_for_range_with_ts(start, end, limit)
            .into_iter()
            .map(|(_, _, _, workers)| workers)
            .collect()
    }

    /// Returns up to `limit` memory pressure values in the range `[start, end]`.
    /// With the same `limit`, the returned slice has the same length and group
    /// boundaries as [`Self::memory_samples_for_range`] so that the two results
    /// can be rendered in parallel. Each group is downsampled by taking the
    /// maximum pressure value.
    pub fn memory_pressure_samples_for_range(
        &self,
        start: Timestamp,
        end: Timestamp,
        limit: usize,
    ) -> Vec<u8> {
        if limit == 0 {
            return Vec::new();
        }
        let slice = self.memory_samples_slice(start, end);
        let count = slice.len();
        if count == 0 {
            return Vec::new();
        }

        if count <= limit {
            return slice.iter().map(|(_, _, p, _)| *p).collect();
        }

        let n = count.div_ceil(limit);
        slice
            .chunks(n)
            .map(|chunk| chunk.iter().map(|(_, _, p, _)| *p).max().unwrap())
            .collect()
    }

    /// Average global self-time concurrency across up to `limit` equal-duration
    /// segments of `[start, end)`, independent of recorded sample timestamps.
    /// When corrected-time indexing is disabled, there is no tree to query and
    /// the series is omitted.
    pub fn concurrency_samples_for_range(
        &self,
        start: Timestamp,
        end: Timestamp,
        limit: usize,
    ) -> Vec<f64> {
        self.self_time_tree.as_ref().map_or_else(Vec::new, |tree| {
            tree.lookup_range_concurrency_samples(start, end, limit)
        })
    }

    pub(crate) fn memory_samples_slice(&self, start: Timestamp, end: Timestamp) -> &[MemorySample] {
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
            for event in span.events.iter_mut_unordered() {
                if let SpanEvent::SelfTime(self_time) = event {
                    self_time.corrected_self_time.take();
                }
            }
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
    use super::*;

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
                Timestamp::from_micros(10),
                200
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
                .concurrency_samples_for_range(Timestamp::ZERO, Timestamp::from_value(100), 200)
                .is_empty()
        );
    }

    #[test]
    fn sample_limits_are_chosen_by_the_caller() {
        let mut store = Store::new();
        let start = Timestamp::ZERO;
        let end = Timestamp::from_value(599);
        for i in 0..600 {
            store.add_memory_sample(Timestamp::from_value(i), i, (i % 100) as u8, i % 8);
        }
        for limit in [0, 1, 200, 300, 1000] {
            let samples = store.memory_samples_for_range_with_ts(start, end, limit);
            let memory = store.memory_samples_for_range(start, end, limit);
            let pressure = store.memory_pressure_samples_for_range(start, end, limit);
            let workers = store.active_worker_threads_samples_for_range(start, end, limit);
            assert!(samples.len() <= limit);
            assert_eq!(pressure.len(), samples.len());
            assert_eq!(
                memory,
                samples.iter().map(|sample| sample.1).collect::<Vec<_>>()
            );
            assert_eq!(
                workers,
                samples.iter().map(|sample| sample.3).collect::<Vec<_>>()
            );
            if limit > 0 {
                assert_eq!(samples.last().unwrap().1, 599);
                assert_eq!(samples.last().unwrap().3, 599 % 8);
            }
        }
        assert_eq!(
            store
                .memory_samples_for_range_with_ts(start, end, 300)
                .len(),
            300
        );
        assert_eq!(
            store
                .memory_samples_for_range_with_ts(start, end, 1000)
                .len(),
            600
        );
        assert_eq!(
            store.memory_samples_for_range_with_ts(start, end, 1)[0].2,
            99
        );
        assert_eq!(
            store.memory_pressure_samples_for_range(start, end, 1),
            vec![99]
        );
        assert!(
            store
                .memory_samples_for_range_with_ts(start, end, 200)
                .len()
                <= 200
        );
        assert!(
            store
                .memory_samples_for_range_with_ts(Timestamp::from_value(600), end, 1)
                .is_empty()
        );
    }

    #[test]
    fn pressure_and_workers_keep_the_viewer_reduction_semantics() {
        let mut store = Store::new();
        let start = Timestamp::ZERO;
        let end = Timestamp::from_value(10);
        store.add_memory_sample(start, 100, 80, 7);
        store.add_memory_sample(end, 900, 2, 1);
        let samples = store.memory_samples_for_range_with_ts(start, end, 1);
        assert_eq!(samples, vec![(end, 900, 2, 1)]);
        assert_eq!(
            store.memory_pressure_samples_for_range(start, end, 1),
            vec![80]
        );
        let mut outdated = FxHashSet::default();
        let span = store.add_span(
            None,
            start,
            rcstr!("test"),
            rcstr!("work"),
            SpanArgs::new(),
            &mut outdated,
        );
        store.add_self_time(span, start, Timestamp::from_value(1000), &mut outdated);
        assert_eq!(
            store.concurrency_samples_for_range(start, Timestamp::from_value(1000), 300),
            vec![1.0; 300]
        );
        assert!(
            store
                .concurrency_samples_for_range(start, end, 0)
                .is_empty()
        );
        assert_eq!(
            store.concurrency_samples_for_range(start, Timestamp::from_value(2), 300),
            vec![1.0; 2]
        );
        store.self_time_tree = None;
        assert!(
            store
                .concurrency_samples_for_range(start, end, 300)
                .is_empty()
        );
    }

    #[test]
    fn downsampling_keeps_worker_count_from_max_memory_sample() {
        let mut store = Store::new();
        let limit = 200;
        for i in 0..=limit {
            store.add_memory_sample(Timestamp::from_micros(i as u64), i as u64, 3, 1);
        }
        store.add_memory_sample(Timestamp::from_micros(201), 5000, 9, 4);
        let samples = store.memory_samples_for_range_with_ts(
            Timestamp::from_micros(0),
            Timestamp::from_micros(201),
            limit,
        );
        assert!(samples.len() <= limit);
        assert!(samples.iter().any(|(_, mem, pressure, workers)| {
            *mem == 5000 && *pressure == 9 && *workers == 4
        }));

        let start = Timestamp::from_micros(0);
        let end = Timestamp::from_micros(201);
        let memory = store.memory_samples_for_range(start, end, limit);
        let workers = store.active_worker_threads_samples_for_range(start, end, limit);
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
                .active_worker_threads_samples_for_range(Timestamp::from_micros(202), end, limit)
                .is_empty()
        );
    }
}
