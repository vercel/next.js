use std::{env, fmt::Debug, future::Future, sync::Arc};

use anyhow::Result;
use turbo_tasks::{TurboTasks, TurboTasksApi, trace::TraceRawVcs};
use turbo_tasks_backend::{TurboBackingStorage, TurboTasksBackend};

/// Concrete `TurboTasks` arc used by every test harness in the workspace.
/// All `test_config.trs` files in this workspace produce this exact type,
/// so the test surface can hold it directly instead of going through the
/// type-erased `TurboTasksHandle`.
pub type TestTurboTasks = Arc<TurboTasks<TurboTasksBackend>>;

/// A freshly created test instance: the concrete `TurboTasks` arc and a
/// closure that, when called, takes a snapshot and evicts all evictable
/// tasks on that instance.
pub struct TestInstance {
    pub tt: TestTurboTasks,
    pub snapshot_and_evict: Box<dyn Fn() + Send + Sync>,
}

/// Factory returned by the `register!` macro.
pub struct Registration {
    create_turbo_tasks: fn(&str, bool) -> TestInstance,
}

impl Registration {
    #[doc(hidden)]
    pub const fn new(create_turbo_tasks: fn(&str, bool) -> TestInstance) -> Self {
        Registration { create_turbo_tasks }
    }

    pub fn create_turbo_tasks(&self, name: &str, initial: bool) -> TestInstance {
        (self.create_turbo_tasks)(name, initial)
    }
}

/// Wrap a concrete `Arc<TurboTasks<TurboTasksBackend>>` into a
/// [`TestInstance`]. Called from the `register!` macro — the `.trs` closure
/// returns a concrete `TurboTasks`, and this function erases the type while
/// retaining eviction access via a capturing closure.
pub fn test_instance(tt: Arc<TurboTasks<TurboTasksBackend>>) -> TestInstance {
    let tt_for_evict = tt.clone();
    let snapshot_and_evict = Box::new(move || {
        let _ = tt_for_evict
            .backend()
            .snapshot_and_evict_for_testing(&tt_for_evict);
    });
    TestInstance {
        tt,
        snapshot_and_evict,
    }
}

#[macro_export]
macro_rules! register {
    () => {{
        fn create_turbo_tasks(name: &str, initial: bool) -> turbo_tasks_testing::TestInstance {
            let inner = include!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/test_config.trs"
            ));
            turbo_tasks_testing::test_instance((inner)(name, initial))
        }
        turbo_tasks_testing::Registration::new(create_turbo_tasks)
    }};
}

pub async fn run_once_without_cache_check<T>(
    registration: &Registration,
    fut: impl Future<Output = T> + Send + 'static,
) -> T
where
    T: TraceRawVcs + Send + 'static,
{
    let name = closure_to_name(&fut);
    let instance = registration.create_turbo_tasks(&name, true);
    instance
        .tt
        .run_once(async move { Ok(fut.await) })
        .await
        .unwrap()
}

pub async fn run_without_cache_check<T>(
    registration: &Registration,
    fut: impl Future<Output = T> + Send + 'static,
) -> T
where
    T: TraceRawVcs + Send + 'static,
{
    let name = closure_to_name(&fut);
    let instance = registration.create_turbo_tasks(&name, true);
    instance.tt.run(async move { Ok(fut.await) }).await.unwrap()
}

fn closure_to_name<T>(value: &T) -> String {
    let name = std::any::type_name_of_val(value);
    name.replace("::{{closure}}", "").replace("::", "_")
}

pub async fn run_once<T, F>(
    registration: &Registration,
    mut fut: impl FnMut() -> F + Send + 'static,
) -> Result<()>
where
    F: Future<Output = Result<T>> + Send + 'static,
    T: Debug + PartialEq + Eq + TraceRawVcs + Send + 'static,
{
    run_with_tt(registration, move |tt| {
        let f = fut();
        async move { tt.run_once(f).await }
    })
    .await
}

pub async fn run<T, F>(
    registration: &Registration,
    mut fut: impl FnMut() -> F + Send + 'static,
) -> Result<()>
where
    F: Future<Output = Result<T>> + Send + 'static,
    T: Debug + PartialEq + Eq + TraceRawVcs + Send + 'static,
{
    run_with_tt(registration, move |tt| {
        let f = fut();
        async move { Ok(tt.run(f).await?) }
    })
    .await
}

pub async fn run_with_tt<T, F>(
    registration: &Registration,
    mut fut: impl FnMut(TestTurboTasks) -> F + Send + 'static,
) -> Result<()>
where
    F: Future<Output = Result<T>> + Send + 'static,
    T: Debug + PartialEq + Eq + TraceRawVcs + Send + 'static,
{
    let infinite_initial_runs = env::var("INFINITE_INITIAL_RUNS").is_ok();
    let infinite_memory_runs = !infinite_initial_runs && env::var("INFINITE_MEMORY_RUNS").is_ok();
    let single_run = infinite_initial_runs || env::var("SINGLE_RUN").is_ok();
    let name = closure_to_name(&fut);
    let mut i = 1;
    loop {
        let instance = registration.create_turbo_tasks(&name, true);
        println!("Run #{i} (without cache)");
        let start = std::time::Instant::now();
        let first = fut(instance.tt.clone()).await?;
        println!("Run #{i} took {:?}", start.elapsed());
        i += 1;
        if !single_run {
            let max_run = if infinite_memory_runs { usize::MAX } else { 10 };
            for _ in 0..max_run {
                // Snapshot + evict between runs. Forces every subsequent read to
                // go through the restore path instead of the warm in-memory cache,
                // so tests exercise persistence on every iteration — not just the
                // initial cold run and the post-`stop_and_wait` fs-cache runs.
                (instance.snapshot_and_evict)();
                println!("Run #{i} (with memory cache, same TurboTasks instance, post-evict)");
                let start = std::time::Instant::now();
                let second = fut(instance.tt.clone()).await?;
                println!("Run #{i} took {:?}", start.elapsed());
                i += 1;
                assert_eq!(first, second);
            }
        }
        let start = std::time::Instant::now();
        instance.tt.stop_and_wait().await;
        println!("Stopping TurboTasks took {:?}", start.elapsed());
        if !single_run {
            for _ in 10..20 {
                let instance = registration.create_turbo_tasks(&name, false);
                println!("Run #{i} (with filesystem cache if available, new TurboTasks instance)");
                let start = std::time::Instant::now();
                let third = fut(instance.tt.clone()).await?;
                println!("Run #{i} took {:?}", start.elapsed());
                i += 1;
                let start = std::time::Instant::now();
                instance.tt.stop_and_wait().await;
                println!("Stopping TurboTasks took {:?}", start.elapsed());
                assert_eq!(first, third);
            }
        }
        if !infinite_initial_runs {
            break;
        }
    }
    Ok(())
}
