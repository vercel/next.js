use std::{
    fs,
    sync::{Arc, mpsc::channel},
    thread,
    time::{Duration, Instant},
};

use criterion::{
    BenchmarkId, Criterion, criterion_group, criterion_main,
    measurement::{Measurement, WallTime},
};
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::runtime::Runtime;
use turbo_tasks::event::Event;
use turbo_tasks_fs::rope::{Rope, RopeBuilder};

fn bench_file_watching(c: &mut Criterion) {
    let mut g = c.benchmark_group("turbo-tasks-fs");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(10));

    let temp = tempfile::TempDir::new().unwrap();
    let start = Instant::now();
    let temp_path = temp.path();
    fs::write(
        temp_path.join("file.txt"),
        start.elapsed().as_micros().to_string(),
    )
    .unwrap();

    g.bench_function(
        BenchmarkId::new("bench_file_watching", "change file"),
        move |b| {
            let (tx, rx) = channel();
            let event = Arc::new(Event::new(|| || "test event".to_string()));

            let mut watcher = RecommendedWatcher::new(tx, Config::default()).unwrap();
            watcher.watch(temp_path, RecursiveMode::Recursive).unwrap();

            let t = thread::spawn({
                let event = event.clone();
                move || loop {
                    match rx.recv() {
                        Ok(_) => event.notify(usize::MAX),
                        Err(_) => return,
                    }
                }
            });

            b.to_async(Runtime::new().unwrap())
                .iter_custom(move |iters| {
                    let event = event.clone();
                    async move {
                        let m = WallTime;
                        let mut value = m.zero();
                        for _ in 0..iters {
                            std::thread::sleep(Duration::from_millis(1));
                            let l = event.listen();
                            let path = temp_path.join("file.txt");
                            let content = start.elapsed().as_micros().to_string();
                            let s = m.start();
                            fs::write(path, content).unwrap();
                            l.await;
                            let duration = m.end(s);
                            value = m.add(&value, &duration);
                        }
                        value
                    }
                });

            drop(watcher);
            t.join().unwrap();
        },
    );
}

fn bench_rope_iteration(c: &mut Criterion) {
    let mut g = c.benchmark_group("turbo-tasks-fs");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(10));

    g.bench_function(
        BenchmarkId::new("bench_rope_iteration", "next collect"),
        move |b| {
            b.iter(|| {
                let mut root = RopeBuilder::default();
                for _ in 0..5 {
                    let mut inner = RopeBuilder::default();
                    for _ in 0..5 {
                        let r = Rope::from("abc".to_string().into_bytes());
                        inner += &r;
                    }
                    root += &inner.build();
                }

                let rope = root.build();
                let _v = rope.read().collect::<Vec<_>>();
            })
        },
    );
}

criterion_group!(
    name = benches;
    config = Criterion::default();
    targets = bench_file_watching, bench_rope_iteration
);
criterion_main!(benches);
