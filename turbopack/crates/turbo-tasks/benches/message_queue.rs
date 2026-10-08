use std::{sync::Arc, time::Duration};

use criterion::{BenchmarkId, Criterion};
use turbo_tasks::message_queue::{CompilationEventQueue, TimingEvent};

pub fn history_replay(c: &mut Criterion) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let queue = CompilationEventQueue::default();
    rt.block_on(async {
        for _ in 0..256 {
            queue
                .send(Arc::new(TimingEvent::new(String::new(), Duration::ZERO)))
                .unwrap();
        }
        queue.flush_and_close().await;
    });
    let mut group = c.benchmark_group("compilation_event_history_replay");
    for event_type in ["NoSuchEvent", "TimingEvent"] {
        group.bench_with_input(
            BenchmarkId::from_parameter(event_type),
            &event_type,
            |b, ty| {
                b.to_async(&rt).iter(|| async {
                    let mut rx = queue.subscribe(Some(vec![(*ty).to_owned()]));
                    let mut count = 0;
                    while rx.recv().await.is_some() {
                        count += 1;
                    }
                    assert_eq!(count, if *ty == "TimingEvent" { 256 } else { 0 });
                });
            },
        );
    }
    group.finish();
}
