use anyhow::Context;
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use next_api::project::{ProjectContainer, ProjectOptions};
use turbo_tasks::TurboTasks;
use turbo_tasks_malloc::TurboMalloc;
use turbopack_binding::turbo::tasks_memory::MemoryBackend;

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

struct Executor(tokio::runtime::Runtime);

impl Executor {
    fn new() -> Self {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .on_thread_stop(|| {
                TurboMalloc::thread_stop();
            })
            .build()
            .unwrap();
        Self(rt)
    }
}

struct TurboBencher {
    executor: Executor,
}

/// run each future with its own memory backend
impl criterion::async_executor::AsyncExecutor for Executor {
    type Output<T> = impl futures_util::Future<Output = T>;

    fn block_on<T>(&self, future: Self::Output<T>) -> T {
        self.0.block_on(async {
            let tt = TurboTasks::new(MemoryBackend::new(usize::MAX));
            tt.run_once(async { Ok(future) }).await.unwrap()
        })
    }
}

pub fn criterion_benchmark(c: &mut Criterion) {
    next_build_test::register();

    let mut file = std::fs::File::open("project_options.json")
        .with_context(|| {
            let path = std::env::current_dir()
                .unwrap()
                .join("project_options.json");
            format!("loading file at {}", path.display())
        })
        .unwrap();

    let data: ProjectOptions = serde_json::from_reader(&mut file).unwrap();

    let options = ProjectOptions { ..data };

    c.bench_function("entrypoints", |b| {
        b.to_async(Executor::new()).iter(|| async {
            let project = ProjectContainer::new(options.clone());
            black_box(project.entrypoints().await);
        });
    });
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);
