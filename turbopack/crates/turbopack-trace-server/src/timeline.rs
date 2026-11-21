//! Chronological, flat lanes of active execution from the self-time tree. A span
//! may have several disjoint intervals; waiting and child execution leave gaps.
//! Neither search nor the viewport changes lane assignment or scales time.
use std::{cmp::Reverse, collections::BinaryHeap};

use rustc_hash::FxHashSet;

use crate::{
    server::ViewRect,
    store::{SpanId, Store},
    timestamp::Timestamp,
    viewer::{Update, ViewLineUpdate, ViewSpan},
};

#[derive(Clone, Copy, Debug)]
struct Interval {
    id: SpanId,
    start: u64,
    end: u64,
}

pub(super) struct Timeline {
    lanes: Vec<Vec<Interval>>,
    max: u64,
}

impl Timeline {
    pub(super) fn new(store: &Store) -> Self {
        let origin = store.root_span().start();
        let mut intervals = Vec::new();
        if let Some(tree) = &store.self_time_tree {
            tree.for_each_in_range(Timestamp::ZERO, Timestamp::MAX, &mut |start, end, index| {
                if end <= start {
                    return;
                }
                // Each tree entry is one activation, not the owning span's extent.
                // In particular, do not join separate activations across idle gaps.
                if let Some(id) = SpanId::new(index.get() << 1) {
                    intervals.push(Interval {
                        id,
                        start: *start.saturating_sub(origin),
                        end: *end.saturating_sub(origin),
                    });
                }
            });
        }
        Self::from_intervals(intervals)
    }

    fn from_intervals(mut intervals: Vec<Interval>) -> Self {
        // Longer spans first for equal starts; ID makes otherwise equal intervals
        // deterministic. Layout is computed once per store generation, not per view.
        intervals.sort_unstable_by_key(|span| (span.start, Reverse(span.end), span.id));
        let mut lanes: Vec<Vec<Interval>> = Vec::new();
        let mut active: BinaryHeap<Reverse<(u64, usize)>> = BinaryHeap::new();
        let mut available: BinaryHeap<Reverse<usize>> = BinaryHeap::new();
        let mut max = 1;
        for span in intervals {
            while let Some(&Reverse((end, lane))) = active.peek() {
                if end > span.start {
                    break;
                }
                active.pop();
                available.push(Reverse(lane));
            }
            let lane = if let Some(Reverse(lane)) = available.pop() {
                lane
            } else {
                lanes.push(Vec::new());
                lanes.len() - 1
            };
            max = max.max(span.end);
            lanes[lane].push(span);
            active.push(Reverse((span.end, lane)));
        }
        Self { lanes, max }
    }

    pub(super) fn compute_update(&self, store: &Store, rect: &ViewRect) -> Update {
        // Focus-search must not remove spans or repack time in this mode.
        let query = rect.query.strip_suffix('!').unwrap_or(&rect.query);
        let matches: FxHashSet<_> = if query.is_empty() {
            FxHashSet::default()
        } else {
            store
                .root_span()
                .search(query)
                .map(|span| span.id())
                .collect()
        };
        let width = rect.width.max(1);
        let pixels = rect.horizontal_pixels.max(1);
        let left = rect.x.saturating_sub(width / 2);
        let right = rect.x.saturating_add(width).saturating_add(width / 2);
        let first_lane = (rect.y as usize).min(self.lanes.len());
        let last_lane = rect
            .y
            .saturating_add(rect.height)
            .saturating_add(5)
            .min(self.lanes.len() as u64) as usize;
        let mut lines = Vec::new();
        for (y, lane) in self
            .lanes
            .iter()
            .enumerate()
            .take(last_lane)
            .skip(first_lane)
        {
            let first = lane.partition_point(|span| span.end < left);
            let last = lane.partition_point(|span| span.start <= right);
            let mut spans: Vec<ViewSpan> = Vec::new();
            let mut last_bucket = None;
            for interval in &lane[first..last] {
                let (span, _) = store.span(interval.id).expect("cached span still exists");
                let (category, text) = span.nice_name();
                let matched = query.is_empty() || matches.contains(&interval.id);
                let span_width = interval.end - interval.start;
                let tiny = u128::from(span_width) * u128::from(pixels) < u128::from(width);
                let bucket = (u128::from(interval.start) * u128::from(pixels)) / u128::from(width);
                if tiny && last_bucket == Some(bucket) {
                    let previous = spans.last_mut().unwrap();
                    previous.id = 0;
                    previous.width = interval.end - previous.start;
                    previous.count += 1;
                    previous.text = "Self-time intervals (zoom in)".to_string();
                    previous.category.clear();
                    previous.secondary = 0;
                    previous.kind = if matched || previous.kind == 0 || previous.kind == 1 {
                        1
                    } else {
                        11
                    };
                    continue;
                }
                spans.push(ViewSpan {
                    id: interval.id.get() as u64,
                    start: interval.start,
                    width: span_width,
                    category: category.to_string(),
                    text: text.to_string(),
                    count: 1,
                    kind: if matched { 0 } else { 10 },
                    start_in_parent: 0,
                    end_in_parent: 0,
                    // Width is this activation's time; span totals belong in details.
                    secondary: 0,
                });
                last_bucket = tiny.then_some(bucket);
            }
            lines.push(ViewLineUpdate { y: y as u64, spans });
        }
        Update {
            lines,
            max: self.max,
            count: self.lanes.len(),
        }
    }
}

#[cfg(test)]
mod tests {
    use rustc_hash::FxHashSet;
    use turbo_rcstr::rcstr;

    use super::*;
    use crate::{span::SpanArgs, timestamp::Timestamp};

    fn interval(id: usize, start: u64, end: u64) -> Interval {
        Interval {
            id: SpanId::new(id * 2).unwrap(),
            start,
            end,
        }
    }

    fn rect() -> ViewRect {
        ViewRect {
            x: 0,
            y: 0,
            width: 1000,
            height: 100,
            horizontal_pixels: 1000,
            query: String::new(),
            view_mode: "timeline".into(),
            value_mode: "count".into(),
            value_filter: None,
            count_filter: None,
        }
    }

    #[test]
    fn overlaps_and_gaps_use_real_intervals() {
        let spans = vec![
            interval(1, 0, 100),
            interval(2, 10, 30),
            interval(1, 10, 20), // the same span can execute concurrently
            interval(4, 30, 50),
            interval(1, 110, 120), // and resume after a waiting gap
            interval(6, 110, 130),
        ];
        let layout = Timeline::from_intervals(spans.clone());
        assert_eq!(layout.max, 130);
        assert_eq!(layout.lanes.len(), 3);
        for lane in &layout.lanes {
            assert!(lane.windows(2).all(|pair| pair[0].end <= pair[1].start));
        }
        let mut reversed = spans;
        reversed.reverse();
        let other = Timeline::from_intervals(reversed);
        let ids = |layout: &Timeline| {
            layout
                .lanes
                .iter()
                .map(|lane| {
                    lane.iter()
                        .map(|span| (span.id, span.start, span.end))
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(ids(&layout), ids(&other));
        assert_eq!(layout.lanes[1][1].start, 30); // adjacent intervals reuse a lane
        assert_eq!(layout.lanes[0][1].start, 110); // ten-tick gap is not packed away
    }

    #[test]
    fn empty_trace_has_valid_bounds() {
        let layout = Timeline::new(&Store::new());
        assert_eq!(layout.max, 1);
        assert!(layout.lanes.is_empty());
    }

    fn add(store: &mut Store, start: u64, duration: u64) {
        let mut outdated = FxHashSet::default();
        let index = store.add_span(
            None,
            Timestamp::from_value(start),
            rcstr!("test"),
            rcstr!("work"),
            SpanArgs::new(),
            &mut outdated,
        );
        store.set_total_time(
            index,
            Timestamp::from_value(start),
            Timestamp::from_value(duration),
            &mut outdated,
        );
        store.complete_span(index);
    }

    #[test]
    fn viewport_filter_and_metric_do_not_relayout() {
        let mut store = Store::new();
        add(&mut store, 100, 100);
        add(&mut store, 150, 200);
        add(&mut store, 400, 0);
        let layout = Timeline::new(&store);
        let full = layout.compute_update(&store, &rect());
        assert_eq!(full.max, 250); // the zero-duration span contributes no work
        assert_eq!(full.count, 2);
        assert_eq!(full.lines[0].spans[0].start, 0);
        assert_eq!(full.lines[1].spans[0].start, 50);
        assert_eq!(full.lines[1].spans[0].width, 200); // count mode cannot distort wall time
        let mut filtered_rect = rect();
        filtered_rect.query = "no-match!".into();
        filtered_rect.x = 30;
        filtered_rect.width = 300;
        let filtered = layout.compute_update(&store, &filtered_rect);
        for (original, filtered) in full.lines.iter().zip(&filtered.lines) {
            for (a, b) in original.spans.iter().zip(&filtered.spans) {
                assert_eq!((a.id, a.start, a.width), (b.id, b.start, b.width));
                assert_eq!(b.kind, 10);
            }
        }
        filtered_rect.y = 1;
        let scrolled = layout.compute_update(&store, &filtered_rect);
        assert_eq!(scrolled.count, 2);
        assert_eq!(scrolled.lines[0].y, 1);
    }

    #[test]
    fn children_outliving_a_parent_keep_their_own_self_time() {
        let mut store = Store::new();
        let mut outdated = FxHashSet::default();
        let parent = store.add_span(
            None,
            Timestamp::from_value(100),
            rcstr!("test"),
            rcstr!("parent"),
            SpanArgs::new(),
            &mut outdated,
        );
        store.set_total_time(
            parent,
            Timestamp::from_value(100),
            Timestamp::from_value(10),
            &mut outdated,
        );
        store.complete_span(parent);
        let child = store.add_span(
            Some(parent),
            Timestamp::from_value(200),
            rcstr!("test"),
            rcstr!("child"),
            SpanArgs::new(),
            &mut outdated,
        );
        store.set_total_time(
            child,
            Timestamp::from_value(200),
            Timestamp::from_value(20),
            &mut outdated,
        );
        store.complete_span(child);
        let layout = Timeline::new(&store);
        assert_eq!(layout.lanes.len(), 1);
        assert_eq!((layout.lanes[0][0].start, layout.lanes[0][0].end), (0, 10));
        assert_eq!(
            (layout.lanes[0][1].start, layout.lanes[0][1].end),
            (100, 120)
        );
    }

    #[test]
    fn generation_invalidation_refreshes_bounds_and_ignores_flame_overrides() {
        use crate::viewer::{SortMode, ViewMode, Viewer};
        let mut store = Store::new();
        add(&mut store, 100, 100);
        let mut viewer = Viewer::new();
        viewer.set_view_mode(
            SpanId::new(2).unwrap(),
            Some((
                ViewMode::Aggregated {
                    sort_mode: SortMode::Value,
                },
                true,
            )),
        );
        let initial = viewer.compute_update(&store, &rect());
        assert_eq!(initial.lines[0].spans[0].width, 100);
        add(&mut store, 150, 200);
        viewer.invalidate_timeline();
        let update = viewer.compute_update(&store, &rect());
        assert_eq!(update.max, 250);
        assert_eq!(update.count, 2);
        assert_eq!(update.lines[1].spans[0].start, 50);
    }

    #[test]
    fn tree_entries_not_span_extents_are_the_geometry_source() {
        let mut store = Store::new();
        let mut outdated = FxHashSet::default();
        let owner = store.add_span(
            None,
            Timestamp::from_value(100),
            rcstr!("test"),
            rcstr!("resumed"),
            SpanArgs::new(),
            &mut outdated,
        );
        let tree = store.self_time_tree.as_mut().unwrap();
        // Deliberately keep these out of the span's events/extent: the tree alone
        // must determine the bars, including repeated and simultaneous owners.
        for (start, end) in [(110, 120), (115, 118), (150, 160), (170, 170)] {
            tree.insert(
                Timestamp::from_value(start),
                Timestamp::from_value(end),
                owner,
            );
        }
        let layout = Timeline::new(&store);
        assert_eq!(layout.max, 60);
        assert_eq!(layout.lanes.len(), 2);
        assert_eq!(
            layout.lanes[0]
                .iter()
                .map(|i| (i.start, i.end))
                .collect::<Vec<_>>(),
            [(10, 20), (50, 60)]
        );
        assert_eq!((layout.lanes[1][0].start, layout.lanes[1][0].end), (15, 18));
        assert!(
            layout
                .lanes
                .iter()
                .flatten()
                .all(|i| i.id.get() == owner.get() * 2)
        );
        let update = layout.compute_update(&store, &rect());
        assert!(
            update
                .lines
                .iter()
                .flat_map(|line| &line.spans)
                .all(|span| span.secondary == 0)
        );
    }

    #[test]
    fn missing_tree_and_lifecycle_only_spans_do_not_fabricate_work() {
        let mut store = Store::new();
        add(&mut store, 100, 500);
        store.self_time_tree = None;
        let layout = Timeline::new(&store);
        assert_eq!(layout.max, 1);
        assert!(layout.lanes.is_empty());
        store.self_time_tree = Some(Default::default());
        assert!(Timeline::new(&store).lanes.is_empty());
    }

    #[test]
    fn appended_activation_invalidates_the_layout_without_bridging_the_gap() {
        use crate::viewer::Viewer;
        let mut store = Store::new();
        add(&mut store, 100, 10);
        let owner = crate::span::SpanIndex::new(1).unwrap();
        let mut viewer = Viewer::new();
        let initial = viewer.compute_update(&store, &rect());
        assert_eq!(initial.max, 10);
        let mut outdated = FxHashSet::default();
        store.add_self_time(
            owner,
            Timestamp::from_value(200),
            Timestamp::from_value(220),
            &mut outdated,
        );
        viewer.invalidate_timeline();
        let update = viewer.compute_update(&store, &rect());
        assert_eq!(update.count, 1);
        assert_eq!(update.max, 120);
        assert_eq!(update.lines[0].spans.len(), 2);
        assert_eq!(update.lines[0].spans[0].id, update.lines[0].spans[1].id);
        assert_eq!(
            (
                update.lines[0].spans[1].start,
                update.lines[0].spans[1].width
            ),
            (100, 20)
        );
    }

    #[test]
    fn dense_spans_are_preserved_as_zoomable_placeholders() {
        let mut store = Store::new();
        for start in 0..100 {
            add(&mut store, start * 2, 1);
        }
        let layout = Timeline::new(&store);
        let mut zoomed_out = rect();
        zoomed_out.horizontal_pixels = 1;
        let update = layout.compute_update(&store, &zoomed_out);
        assert_eq!(update.lines[0].spans.len(), 1);
        assert_eq!(update.lines[0].spans[0].count, 100);
        assert_eq!(update.lines[0].spans[0].kind, 1);
        assert_eq!(
            layout.compute_update(&store, &rect()).lines[0].spans.len(),
            100
        );
    }
}
