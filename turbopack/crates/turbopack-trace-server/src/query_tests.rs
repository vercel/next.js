use std::sync::Arc;

use turbopack_trace_utils::tracing::TraceRow;

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
                page: 1,
            },
        );
        assert_eq!(result.spans.len(), 1);
        assert_eq!(result.spans[0].memory_samples, vec![(1000, 1234, 7, 2)]);
    }
}
