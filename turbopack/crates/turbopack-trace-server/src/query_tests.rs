use std::sync::Arc;

use turbopack_trace_utils::tracing::{TraceRow, TraceValue};

use crate::{
    QueryOptions, SortMode, query_spans,
    reader::{TraceFormat, turbopack::TurbopackFormat},
    store_container::StoreContainer,
    timestamp::Timestamp,
};

#[test]
fn reads_active_workers_and_exposes_them_in_span_queries() {
    let store = Arc::new(StoreContainer::new());
    let mut format = TurbopackFormat::new(store.clone());
    let rows = [
        TraceRow::Start {
            ts: 10,
            id: 1,
            parent: None,
            name: "test".into(),
            target: "test".into(),
            values: vec![],
        },
        TraceRow::Enter {
            ts: 10,
            id: 1,
            thread_id: 1,
            allocations: None,
        },
        TraceRow::MemorySample {
            ts: 20,
            memory: 1234,
            memory_pressure: 7,
            active_worker_threads: 2,
        },
        TraceRow::Exit {
            ts: 30,
            id: 1,
            thread_id: 1,
            allocations: None,
        },
        TraceRow::End { ts: 30, id: 1 },
    ];
    let mut bytes = Vec::new();
    for row in rows {
        bytes.extend(postcard::to_stdvec(&row).unwrap());
    }
    assert_eq!(
        format
            .read(&bytes, &mut TurbopackFormat::create_reused())
            .unwrap(),
        bytes.len()
    );

    let samples = store
        .read()
        .memory_samples_for_range_with_ts(Timestamp::from_micros(10), Timestamp::from_micros(30));
    assert_eq!(samples[0].1, 1234);
    assert_eq!(samples[0].2, 7);
    assert_eq!(samples[0].3, 2);

    for aggregated in [false, true] {
        let result = query_spans(
            &store,
            QueryOptions {
                parent: None,
                aggregated,
                sort: SortMode::ExecutionOrder,
                search: None,
                max_depth: u32::MAX,
                depth: 1,
                page: 1,
                page_size: None,
            },
        );
        assert_eq!(result.spans.len(), 1);
        assert_eq!(result.spans[0].memory_samples, vec![(1000, 1234, 7, 2)]);
    }
}

fn ingest(format: &mut TurbopackFormat, rows: &[TraceRow<'_>]) {
    let bytes: Vec<_> = rows
        .iter()
        .flat_map(|row| postcard::to_stdvec(row).unwrap())
        .collect();
    assert_eq!(
        format
            .read(&bytes, &mut TurbopackFormat::create_reused())
            .unwrap(),
        bytes.len()
    );
}

fn start(
    id: u64,
    parent: Option<u64>,
    ts: u64,
    name: &'static str,
    blocking: Option<bool>,
) -> TraceRow<'static> {
    TraceRow::Start {
        ts,
        id,
        parent,
        name: name.into(),
        target: "test".into(),
        values: blocking
            .map(|b| vec![("blocking".into(), TraceValue::Bool(b))])
            .unwrap_or_default(),
    }
}

fn duration_event(
    ts: u64,
    duration: u64,
    name: &'static str,
    blocking: Option<bool>,
) -> TraceRow<'static> {
    let mut values = vec![
        ("name".into(), TraceValue::String(name.into())),
        ("duration".into(), TraceValue::UInt(duration)),
    ];
    if let Some(blocking) = blocking {
        values.push(("blocking".into(), TraceValue::Bool(blocking)));
    }
    TraceRow::Event {
        ts,
        parent: Some(1),
        values,
    }
}

#[test]
fn blocking_duration_events_keep_ranges_without_inflating_work() {
    let store = Arc::new(StoreContainer::new());
    let mut format = TurbopackFormat::new(store.clone());
    ingest(
        &mut format,
        &[
            start(1, None, 0, "root", None),
            TraceRow::Enter {
                ts: 0,
                id: 1,
                thread_id: 1,
                allocations: None,
            },
            TraceRow::Exit {
                ts: 10,
                id: 1,
                thread_id: 1,
                allocations: None,
            },
            duration_event(100, 90, "fetch request", Some(true)),
            duration_event(100, 90, "fetch attempt", Some(true)),
            TraceRow::Enter {
                ts: 100,
                id: 1,
                thread_id: 1,
                allocations: None,
            },
            TraceRow::Exit {
                ts: 110,
                id: 1,
                thread_id: 1,
                allocations: None,
            },
            TraceRow::End { ts: 110, id: 1 },
        ],
    );
    let store = store.read();
    let root = store.root_spans().next().unwrap();
    assert_eq!(root.total_time(), Timestamp::from_micros(20));
    assert_eq!(root.corrected_total_time(), Timestamp::from_micros(20));
    assert_eq!(root.end(), Timestamp::from_micros(110));
    assert_eq!(
        store
            .concurrency_samples_for_range(Timestamp::from_micros(10), Timestamp::from_micros(100)),
        vec![0.0; 200]
    );
    let mut count = 0;
    for event in root.children() {
        count += 1;
        assert_eq!(event.start(), Timestamp::from_micros(10));
        assert_eq!(event.end(), Timestamp::from_micros(100));
        assert_eq!(event.total_time(), Timestamp::ZERO);
        assert_eq!(event.corrected_total_time(), Timestamp::ZERO);
        assert!(event.is_complete());
        assert!(
            event
                .args()
                .any(|(key, value)| key.as_str() == "blocking" && value.as_str() == "true")
        );
    }
    assert_eq!(count, 2);
}

#[test]
fn blocking_events_do_not_change_counted_work_correction() {
    let store = Arc::new(StoreContainer::new());
    let mut format = TurbopackFormat::new(store.clone());
    ingest(
        &mut format,
        &[
            start(1, None, 0, "root", None),
            TraceRow::Enter {
                ts: 0,
                id: 1,
                thread_id: 1,
                allocations: None,
            },
            duration_event(100, 100, "waiting", Some(true)),
            TraceRow::Exit {
                ts: 100,
                id: 1,
                thread_id: 1,
                allocations: None,
            },
            TraceRow::End { ts: 100, id: 1 },
        ],
    );
    let store = store.read();
    let root = store.root_spans().next().unwrap();
    assert_eq!(root.self_time(), Timestamp::from_micros(100));
    assert_eq!(root.corrected_self_time(), Timestamp::from_micros(100));
    assert_eq!(root.total_time(), Timestamp::from_micros(100));
    assert_eq!(root.corrected_total_time(), Timestamp::from_micros(100));
    assert_eq!(
        store.concurrency_samples_for_range(Timestamp::ZERO, Timestamp::from_micros(100)),
        vec![1.0; 200]
    );
}

#[test]
fn non_blocking_and_legacy_duration_events_still_count() {
    let store = Arc::new(StoreContainer::new());
    let mut format = TurbopackFormat::new(store.clone());
    ingest(
        &mut format,
        &[
            start(1, None, 0, "root", None),
            TraceRow::Enter {
                ts: 0,
                id: 1,
                thread_id: 1,
                allocations: None,
            },
            duration_event(80, 50, "external work", Some(false)),
            duration_event(80, 50, "legacy external work", None),
            TraceRow::Exit {
                ts: 100,
                id: 1,
                thread_id: 1,
                allocations: None,
            },
            TraceRow::End { ts: 100, id: 1 },
        ],
    );
    let store = store.read();
    let root = store.root_spans().next().unwrap();
    assert_eq!(root.total_time(), Timestamp::from_micros(200));
    assert!(root.corrected_self_time() < root.self_time());
    assert_eq!(
        store.concurrency_samples_for_range(Timestamp::from_micros(30), Timestamp::from_micros(80)),
        vec![3.0; 200]
    );
    for event in root.children() {
        assert_eq!(event.total_time(), Timestamp::from_micros(50));
        assert!(event.corrected_total_time() > Timestamp::ZERO);
    }
}

#[test]
fn blocking_entered_spans_ignore_own_work_but_count_children() {
    for (name, blocking, ignored) in [
        ("flagged", Some(true), true),
        ("regular", Some(false), false),
        ("legacy", None, false),
        ("blocking", Some(false), true),
        ("thread", None, true),
    ] {
        let store = Arc::new(StoreContainer::new());
        let mut format = TurbopackFormat::new(store.clone());
        ingest(
            &mut format,
            &[
                start(1, None, 0, name, blocking),
                TraceRow::Enter {
                    ts: 0,
                    id: 1,
                    thread_id: 1,
                    allocations: None,
                },
                start(2, Some(1), 10, "child work", None),
                TraceRow::Enter {
                    ts: 10,
                    id: 2,
                    thread_id: 1,
                    allocations: None,
                },
                TraceRow::Exit {
                    ts: 20,
                    id: 2,
                    thread_id: 1,
                    allocations: None,
                },
                TraceRow::End { ts: 20, id: 2 },
                TraceRow::Exit {
                    ts: 30,
                    id: 1,
                    thread_id: 1,
                    allocations: None,
                },
                TraceRow::End { ts: 30, id: 1 },
            ],
        );
        let store = store.read();
        let parent = store.root_spans().next().unwrap();
        assert_eq!(parent.end(), Timestamp::from_micros(30), "{name}");
        let own_time = if ignored { 0 } else { 20 };
        assert_eq!(
            parent.self_time(),
            Timestamp::from_micros(own_time),
            "{name}"
        );
        assert_eq!(
            parent.total_time(),
            Timestamp::from_micros(own_time + 10),
            "{name}"
        );
        assert_eq!(parent.corrected_total_time(), parent.total_time(), "{name}");
        assert_eq!(
            store.concurrency_samples_for_range(Timestamp::ZERO, Timestamp::from_micros(10)),
            vec![if ignored { 0.0 } else { 1.0 }; 200],
            "{name}"
        );
        assert_eq!(
            store.concurrency_samples_for_range(
                Timestamp::from_micros(10),
                Timestamp::from_micros(20)
            ),
            vec![1.0; 200],
            "{name}"
        );
    }
}

#[test]
fn blocking_elapsed_ranges_invalidate_cached_ends() {
    let store = Arc::new(StoreContainer::new());
    let mut format = TurbopackFormat::new(store.clone());
    ingest(
        &mut format,
        &[
            start(1, None, 0, "parent", None),
            start(2, Some(1), 0, "waiting", Some(true)),
            TraceRow::Enter {
                ts: 0,
                id: 2,
                thread_id: 1,
                allocations: None,
            },
            TraceRow::Exit {
                ts: 10,
                id: 2,
                thread_id: 1,
                allocations: None,
            },
        ],
    );
    {
        let store = store.read();
        let parent = store.root_spans().next().unwrap();
        let span = parent.children().next().unwrap();
        assert_eq!(span.end(), Timestamp::from_micros(10));
        assert_eq!(parent.end(), Timestamp::from_micros(10));
        assert_eq!(span.corrected_total_time(), Timestamp::ZERO);
    }
    ingest(
        &mut format,
        &[
            TraceRow::Enter {
                ts: 20,
                id: 2,
                thread_id: 1,
                allocations: None,
            },
            TraceRow::Exit {
                ts: 30,
                id: 2,
                thread_id: 1,
                allocations: None,
            },
            TraceRow::End { ts: 30, id: 2 },
        ],
    );
    let store = store.read();
    let parent = store.root_spans().next().unwrap();
    let span = parent.children().next().unwrap();
    assert_eq!(span.end(), Timestamp::from_micros(30));
    assert_eq!(parent.end(), Timestamp::from_micros(30));
    assert_eq!(span.total_time(), Timestamp::ZERO);
    assert_eq!(span.corrected_total_time(), Timestamp::ZERO);
    assert!(span.is_complete());
}
