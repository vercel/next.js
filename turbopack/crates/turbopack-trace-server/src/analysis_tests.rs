//! Tests for group parents, example spans, absolute times, depth limits, the
//! flat profile and the memory timeline.

use std::sync::Arc;

use rustc_hash::FxHashSet;
use turbo_rcstr::RcStr;

use crate::{
    FlatProfileOptions, MemoryPoint, MemoryReading, MemoryTimelineOptions, ProfileSort,
    QueryOptions, QueryResult, SortMode, flat_profile, memory_timeline, query_spans,
    span::{SpanArgs, SpanIndex},
    store::Store,
    store_container::StoreContainer,
    timestamp::Timestamp,
};

struct Spans {
    build: SpanIndex,
    task_a: SpanIndex,
    task_b: SpanIndex,
    analyze_b: SpanIndex,
    parse: SpanIndex,
}

/// Times in µs:
///
/// ```text
/// build                                     (no self time)
///  ├─ task              [0, 10)             trivial first member
///  │   └─ analyze ecmascript module a.js [1, 2)
///  └─ task              [10, 90)            heavy second member
///      ├─ analyze ecmascript module b.js [11, 50)
///      │   └─ analyze ecmascript module c.js [20, 30)
///      └─ parse         [50, 89)
/// ```
///
/// Memory samples (bytes, footprint) at 0 µs (100, 1000), 50 µs (500, 2000)
/// and 100 µs (300, 5000).
fn timed_store() -> (Arc<StoreContainer>, Spans) {
    let container = Arc::new(StoreContainer::new());
    let spans = {
        let mut store = container.write();
        let mut outdated = FxHashSet::default();
        let mut span = |store: &mut Store,
                        parent: Option<SpanIndex>,
                        start: u64,
                        name: &str,
                        module: Option<&str>,
                        self_times: &[(u64, u64)]| {
            let mut args = SpanArgs::new();
            if let Some(module) = module {
                args.push((RcStr::from("name"), RcStr::from(module)));
            }
            let index = store.add_span(
                parent,
                Timestamp::from_micros(start),
                RcStr::default(),
                RcStr::from(name),
                args,
                &mut outdated,
            );
            for &(start, end) in self_times {
                store.add_self_time(
                    index,
                    Timestamp::from_micros(start),
                    Timestamp::from_micros(end),
                    &mut outdated,
                );
            }
            index
        };
        let build = span(&mut store, None, 0, "build", None, &[]);
        let task_a = span(&mut store, Some(build), 0, "task", None, &[(0, 1), (2, 10)]);
        let analyze_a = span(
            &mut store,
            Some(task_a),
            1,
            "analyze ecmascript module",
            Some("a.js"),
            &[(1, 2)],
        );
        let task_b = span(
            &mut store,
            Some(build),
            10,
            "task",
            None,
            &[(10, 11), (89, 90)],
        );
        let analyze_b = span(
            &mut store,
            Some(task_b),
            11,
            "analyze ecmascript module",
            Some("b.js"),
            &[(11, 20), (30, 50)],
        );
        let analyze_c = span(
            &mut store,
            Some(analyze_b),
            20,
            "analyze ecmascript module",
            Some("c.js"),
            &[(20, 30)],
        );
        let parse = span(&mut store, Some(task_b), 50, "parse", None, &[(50, 89)]);
        for index in [
            build, task_a, analyze_a, task_b, analyze_b, analyze_c, parse,
        ] {
            store.complete_span(index);
        }
        store.add_memory_sample(Timestamp::from_micros(0), 100, 0, 1000, 1);
        store.add_memory_sample(Timestamp::from_micros(50), 500, 0, 2000, 1);
        store.add_memory_sample(Timestamp::from_micros(100), 300, 0, 5000, 1);
        store.invalidate_outdated_spans(&outdated);
        Spans {
            build,
            task_a,
            task_b,
            analyze_b,
            parse,
        }
    };
    (container, spans)
}

fn options() -> QueryOptions {
    QueryOptions {
        parent: None,
        aggregated: true,
        sort: SortMode::ExecutionOrder,
        search: None,
        recursive: false,
        max_depth: u32::MAX,
        depth: 1,
        page: 1,
        page_size: None,
        include_memory_samples: true,
    }
}

fn names(result: &QueryResult) -> Vec<&str> {
    result.spans.iter().map(|span| span.name.as_str()).collect()
}

fn ticks(micros: u64) -> u64 {
    *Timestamp::from_micros(micros)
}

/// The `task` group below `build`.
fn task_group(store: &Arc<StoreContainer>, spans: &Spans) -> String {
    let result = query_spans(
        store,
        QueryOptions {
            parent: Some(spans.build.get().to_string()),
            ..options()
        },
    );
    assert_eq!(names(&result), ["task"]);
    assert_eq!(result.spans[0].count, Some(2));
    result.spans[0].id.clone()
}

#[test]
fn group_parent_lists_the_children_of_every_member() {
    let (store, spans) = timed_store();
    let group = task_group(&store, &spans);

    // Only the second member has a `parse` child, and both have an analysis.
    let children = query_spans(
        &store,
        QueryOptions {
            parent: Some(group.clone()),
            ..options()
        },
    );
    assert_eq!(names(&children), ["analyze ecmascript module", "parse"]);
    // a.js, b.js and c.js, which nests in b.js under the same name.
    assert_eq!(children.spans[0].count, Some(3));

    let raw = query_spans(
        &store,
        QueryOptions {
            parent: Some(group.clone()),
            aggregated: false,
            ..options()
        },
    );
    assert_eq!(raw.total_count, 3);

    // A raw search below a group covers every member too, and its IDs resolve.
    let found = query_spans(
        &store,
        QueryOptions {
            parent: Some(group),
            aggregated: false,
            search: Some("parse".to_string()),
            ..options()
        },
    );
    assert_eq!(names(&found), ["parse"]);
    let below = query_spans(
        &store,
        QueryOptions {
            parent: Some(found.spans[0].id.clone()),
            ..options()
        },
    );
    assert_eq!(below.total_count, 0);
}

#[test]
fn group_example_is_the_longest_member() {
    let (store, spans) = timed_store();
    let result = query_spans(
        &store,
        QueryOptions {
            parent: Some(spans.build.get().to_string()),
            ..options()
        },
    );
    let group = &result.spans[0];
    assert_eq!(
        group.example_span_id.as_deref(),
        Some(spans.task_b.get().to_string().as_str())
    );
    assert_eq!(
        group.first_span_id.as_deref(),
        Some(spans.task_a.get().to_string().as_str())
    );
    assert_eq!(group.cpu_duration, ticks(80));
    // The group's extent covers both members.
    assert_eq!((group.start, group.end), (0, ticks(90)));
}

#[test]
fn spans_report_absolute_times_and_interpolated_memory() {
    let (store, spans) = timed_store();
    let result = query_spans(
        &store,
        QueryOptions {
            aggregated: false,
            search: Some("parse".to_string()),
            ..options()
        },
    );
    let parse = &result.spans[0];
    assert_eq!(
        parse.id.split('-').next_back(),
        Some(spans.parse.get().to_string().as_str())
    );
    assert_eq!((parse.start, parse.end), (ticks(50), ticks(89)));
    assert_eq!(
        parse.memory_at_start,
        Some(MemoryPoint {
            bytes: 500,
            footprint: 2000
        })
    );
    // 39 of the 50 µs from the 50 µs sample to the 100 µs one.
    assert_eq!(
        parse.memory_at_end,
        Some(MemoryPoint {
            bytes: 344,
            footprint: 4340
        })
    );
    // The only sample inside the span, with an absolute timestamp.
    assert_eq!(parse.memory_samples, vec![(ticks(50), 500, 0, 2000, 1)]);

    // Group names drop the module path that display names carry.
    let analyze = query_spans(
        &store,
        QueryOptions {
            aggregated: false,
            search: Some("b.js".to_string()),
            ..options()
        },
    );
    assert_eq!(analyze.spans[0].name, "analyze ecmascript module b.js");
    assert_eq!(analyze.spans[0].group_name, "analyze ecmascript module");
}

#[test]
fn recursive_lists_the_whole_subtree() {
    let (store, spans) = timed_store();
    let result = query_spans(
        &store,
        QueryOptions {
            parent: Some(spans.build.get().to_string()),
            aggregated: false,
            recursive: true,
            page_size: Some(100),
            ..options()
        },
    );
    assert_eq!(result.total_count, 6);
    assert!(!result.depth_limited);
}

#[test]
fn max_depth_cut_off_is_reported() {
    let (store, _) = timed_store();
    for aggregated in [false, true] {
        let shallow = query_spans(
            &store,
            QueryOptions {
                aggregated,
                recursive: true,
                max_depth: 2,
                ..options()
            },
        );
        assert!(shallow.depth_limited, "aggregated={aggregated}");

        // A search with an index hit below the limit is cut off too.
        let searched = query_spans(
            &store,
            QueryOptions {
                aggregated,
                search: Some("parse".to_string()),
                max_depth: 2,
                ..options()
            },
        );
        assert_eq!(searched.total_count, 0, "aggregated={aggregated}");
        assert!(searched.depth_limited, "aggregated={aggregated}");

        let full = query_spans(
            &store,
            QueryOptions {
                aggregated,
                recursive: true,
                ..options()
            },
        );
        assert!(!full.depth_limited, "aggregated={aggregated}");
    }
}

#[test]
fn deep_spans_are_found_without_a_depth_cap() {
    let container = Arc::new(StoreContainer::new());
    {
        let mut store = container.write();
        let mut outdated = FxHashSet::default();
        let mut parent = None;
        // Deeper than the old cap of 32, shallower than the store's cut-off.
        for depth in 0..50 {
            let name = if depth == 49 { "leaf" } else { "level" };
            let index = store.add_span(
                parent,
                Timestamp::from_micros(depth),
                RcStr::default(),
                RcStr::from(name),
                SpanArgs::new(),
                &mut outdated,
            );
            store.complete_span(index);
            parent = Some(index);
        }
        store.invalidate_outdated_spans(&outdated);
    }
    for aggregated in [false, true] {
        let result = query_spans(
            &container,
            QueryOptions {
                aggregated,
                search: Some("leaf".to_string()),
                ..options()
            },
        );
        assert_eq!(result.total_count, 1, "aggregated={aggregated}");
        assert!(!result.depth_limited);
    }
}

#[test]
fn flat_profile_groups_by_name_across_the_subtree() {
    let (store, spans) = timed_store();
    let result = flat_profile(
        &store,
        FlatProfileOptions {
            parent: None,
            search: None,
            sort: ProfileSort::SelfTime,
            page: 1,
            page_size: None,
        },
    );
    assert_eq!(result.span_count, 7);
    assert_eq!(result.total_corrected_self_duration, ticks(90));
    let names: Vec<_> = result.entries.iter().map(|e| e.name.as_str()).collect();
    assert_eq!(
        names,
        ["analyze ecmascript module", "parse", "task", "build"],
        "sorted by corrected self time"
    );

    let analyze = &result.entries[0];
    // Each module's analysis lands in one entry, wherever it sits.
    assert_eq!(analyze.count, 3);
    assert_eq!(analyze.self_duration, ticks(40));
    assert_eq!(analyze.corrected_self_duration, ticks(40));
    // c.js nests inside b.js, so only b.js (39 µs) and a.js (1 µs) count.
    assert_eq!(analyze.total_duration, ticks(40));
    assert_eq!(analyze.corrected_total_duration, ticks(40));
    assert_eq!(analyze.example_span_id, spans.analyze_b.get().to_string());

    let task = &result.entries[2];
    assert_eq!(task.count, 2);
    assert_eq!(task.self_duration, ticks(11));
    assert_eq!(task.total_duration, ticks(90));

    // Scoped to the heavy member, filtered by name.
    let scoped = flat_profile(
        &store,
        FlatProfileOptions {
            parent: Some(spans.task_b.get().to_string()),
            search: Some("analyze".to_string()),
            sort: ProfileSort::Count,
            page: 1,
            page_size: None,
        },
    );
    assert_eq!(scoped.span_count, 3);
    assert_eq!(scoped.entries.len(), 1);
    assert_eq!(scoped.entries[0].count, 2);
}

#[test]
fn memory_timeline_reports_peaks_gap_and_phases() {
    let (store, spans) = timed_store();
    let timeline = memory_timeline(
        &store,
        MemoryTimelineOptions {
            parent: None,
            start: None,
            end: None,
            max_samples: None,
            max_phases: None,
        },
    );
    assert_eq!((timeline.start, timeline.end), (0, ticks(100)));
    assert_eq!(timeline.raw_sample_count, 3);
    assert_eq!(timeline.samples.len(), 3);
    assert_eq!(
        timeline.peak_bytes,
        Some(MemoryReading {
            ts: ticks(50),
            bytes: 500,
            footprint: 2000
        })
    );
    assert_eq!(timeline.peak_footprint.map(|r| r.ts), Some(ticks(100)));
    assert_eq!(timeline.max_gap.map(|r| r.ts), Some(ticks(100)));
    let phases: Vec<_> = timeline.phases.iter().map(|p| p.name.as_str()).collect();
    assert_eq!(phases, ["build"]);

    // Below `build`, each `task` is its own phase: as a group they would cover
    // one span from the start of the first to the end of the second.
    let scoped = memory_timeline(
        &store,
        MemoryTimelineOptions {
            parent: Some(spans.build.get().to_string()),
            start: None,
            end: None,
            max_samples: Some(1),
            max_phases: None,
        },
    );
    assert_eq!((scoped.start, scoped.end), (0, ticks(90)));
    // Downsampled to the max-memory sample.
    assert_eq!(scoped.samples, vec![(ticks(50), 500, 0, 2000, 1)]);
    let phases: Vec<_> = scoped
        .phases
        .iter()
        .map(|p| (p.name.as_str(), p.start, p.end, p.peak_bytes))
        .collect();
    assert_eq!(
        phases,
        [
            ("task", 0, ticks(10), Some(100)),
            ("task", ticks(10), ticks(90), Some(500)),
        ]
    );
    // The phase IDs navigate to the spans.
    let build = spans.build.get();
    assert_eq!(
        scoped.phases[0].id,
        format!("{build}-{}", spans.task_a.get())
    );

    // Phases are the ones with the largest corrected duration.
    let longest = memory_timeline(
        &store,
        MemoryTimelineOptions {
            parent: Some(spans.build.get().to_string()),
            start: None,
            end: None,
            max_samples: None,
            max_phases: Some(1),
        },
    );
    assert_eq!(longest.phases.len(), 1);
    assert_eq!(longest.phases[0].start, ticks(10));
}

#[test]
fn raw_search_returns_execution_order_with_and_without_a_depth_limit() {
    let (store, _) = timed_store();
    // A multi-word term and a single word, both answered through the index.
    for search in ["analyze ecmascript", "analyze"] {
        let mut results = Vec::new();
        for max_depth in [u32::MAX, 10] {
            let result = query_spans(
                &store,
                QueryOptions {
                    aggregated: false,
                    search: Some(search.to_string()),
                    max_depth,
                    ..options()
                },
            );
            let ids: Vec<_> = result.spans.iter().map(|span| span.id.clone()).collect();
            let leaves: Vec<usize> = ids
                .iter()
                .map(|id| id.split('-').next_back().unwrap().parse().unwrap())
                .collect();
            assert_eq!(leaves.len(), 3, "{search:?}");
            assert!(leaves.is_sorted(), "{search:?}: {leaves:?}");
            results.push(ids);
        }
        assert_eq!(
            results[0], results[1],
            "{search:?}: the limit changed results"
        );
    }
}
