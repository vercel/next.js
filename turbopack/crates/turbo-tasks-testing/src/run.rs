use std::{fmt::Debug, future::Future, sync::Arc};

use anyhow::Result;
use turbo_tasks::{TurboTasksApi, trace::TraceRawVcs};

pub struct Registration {
    create_turbo_tasks: fn(&str, bool) -> Arc<dyn TurboTasksApi>,
}

impl Registration {
    #[doc(hidden)]
    pub const fn new(create_turbo_tasks: fn(&str, bool) -> Arc<dyn TurboTasksApi>) -> Self {
        Registration { create_turbo_tasks }
    }

    pub fn create_turbo_tasks(&self, name: &str, initial: bool) -> Arc<dyn TurboTasksApi> {
        (self.create_turbo_tasks)(name, initial)
    }
}

#[macro_export]
macro_rules! register {
    ($($other_register_fns:expr),* $(,)?) => {{
        use std::sync::Arc;

        use turbo_tasks::TurboTasksApi;
        fn create_turbo_tasks(name: &str, initial: bool) -> Arc<dyn TurboTasksApi> {
            let inner = include!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/test_config.trs"
            ));
            (inner)(name, initial)
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
    let tt = registration.create_turbo_tasks(&name, true);
    turbo_tasks::run_once(tt, async move { Ok(fut.await) })
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
    let tt = registration.create_turbo_tasks(&name, true);
    turbo_tasks::run(tt, async move { Ok(fut.await) })
        .await
        .unwrap()
}

fn closure_to_name<T>(value: &T) -> String {
    let name = std::any::type_name_of_val(value);
    name.replace("::{{closure}}", "").replace("::", "_")
}

pub async fn run_once<T, F>(
    registration: &Registration,
    fut: impl Fn() -> F + Send + 'static,
) -> Result<()>
where
    F: Future<Output = Result<T>> + Send + 'static,
    T: Debug + PartialEq + Eq + TraceRawVcs + Send + 'static,
{
    run_with_tt(registration, move |tt| turbo_tasks::run_once(tt, fut())).await
}

pub async fn run<T, F>(
    registration: &Registration,
    fut: impl Fn() -> F + Send + 'static,
) -> Result<()>
where
    F: Future<Output = Result<T>> + Send + 'static,
    T: Debug + PartialEq + Eq + TraceRawVcs + Send + 'static,
{
    run_with_tt(registration, move |tt| turbo_tasks::run(tt, fut())).await
}

pub async fn run_with_tt<T, F>(
    registration: &Registration,
    fut: impl Fn(Arc<dyn TurboTasksApi>) -> F + Send + 'static,
) -> Result<()>
where
    F: Future<Output = Result<T>> + Send + 'static,
    T: Debug + PartialEq + Eq + TraceRawVcs + Send + 'static,
{
    let name = closure_to_name(&fut);
    let tt = registration.create_turbo_tasks(&name, true);
    println!("Run #1 (without cache)");
    let start = std::time::Instant::now();
    let first = fut(tt.clone()).await?;
    println!("Run #1 took {:?}", start.elapsed());
    for i in 2..10 {
        println!("Run #{i} (with memory cache, same TurboTasks instance)");
        let start = std::time::Instant::now();
        let second = fut(tt.clone()).await?;
        println!("Run #{i} took {:?}", start.elapsed());
        assert_eq!(first, second);
    }
    let start = std::time::Instant::now();
    tt.stop_and_wait().await;
    println!("Stopping TurboTasks took {:?}", start.elapsed());
    for i in 10..20 {
        let tt = registration.create_turbo_tasks(&name, false);
        println!("Run #{i} (with filesystem cache if available, new TurboTasks instance)");
        let start = std::time::Instant::now();
        let third = fut(tt.clone()).await?;
        println!("Run #{i} took {:?}", start.elapsed());
        let start = std::time::Instant::now();
        tt.stop_and_wait().await;
        println!("Stopping TurboTasks took {:?}", start.elapsed());
        assert_eq!(first, third);
    }
    Ok(())
}
