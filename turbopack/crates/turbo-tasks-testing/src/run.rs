use std::{
    fmt::Debug,
    future::Future,
    sync::{Arc, OnceLock},
};

use anyhow::Result;
use turbo_tasks::{run_once, trace::TraceRawVcs, TurboTasksApi};

pub struct Registration {
    execution_lock: OnceLock<()>,
    func: fn(),
    create_turbo_tasks: fn(&str, bool) -> Arc<dyn TurboTasksApi>,
}

impl Registration {
    #[doc(hidden)]
    pub const fn new(
        create_turbo_tasks: fn(&str, bool) -> Arc<dyn TurboTasksApi>,
        func: fn(),
    ) -> Self {
        Registration {
            execution_lock: OnceLock::new(),
            func,
            create_turbo_tasks,
        }
    }

    /// Called by [`run`]. You can call this manually if you're not using
    /// [`run`] (e.g. because you're using a customized `turbo_tasks`
    /// implementation or tokio runtime).
    pub fn ensure_registered(&self) {
        self.execution_lock.get_or_init(self.func);
    }

    pub fn create_turbo_tasks(&self, name: &str, initial: bool) -> Arc<dyn TurboTasksApi> {
        (self.create_turbo_tasks)(name, initial)
    }
}

#[macro_export]
macro_rules! register {
    ($($other_register_fns:expr),* $(,)?) => {{
        use turbo_tasks::TurboTasksApi;
        use std::sync::Arc;
        fn create_turbo_tasks(name: &str, initial: bool) -> Arc<dyn TurboTasksApi> {
            let inner = include!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/test_config.trs"
            ));
            (inner)(name, initial)
        }
        fn register_impl() {
            $($other_register_fns();)*
            turbo_tasks::register();
            include!(concat!(
                env!("OUT_DIR"),
                "/register_test_",
                module_path!(),
                ".rs",
            ));
        }
        turbo_tasks_testing::Registration::new(create_turbo_tasks, register_impl)
    }};
}

pub async fn run_without_cache_check<T>(
    registration: &Registration,
    fut: impl Future<Output = T> + Send + 'static,
) -> T
where
    T: TraceRawVcs + Send + 'static,
{
    registration.ensure_registered();
    let name = closure_to_name(&fut);
    let tt = registration.create_turbo_tasks(&name, true);
    run_once(tt, async move { Ok(fut.await) }).await.unwrap()
}

fn closure_to_name<T>(value: &T) -> String {
    let name = std::any::type_name_of_val(value);
    name.replace("::{{closure}}", "").replace("::", "_")
}

pub async fn run<T, F>(
    registration: &Registration,
    fut: impl Fn() -> F + Send + 'static,
) -> Result<()>
where
    F: Future<Output = Result<T>> + Send + 'static,
    T: Debug + PartialEq + Eq + TraceRawVcs + Send + 'static,
{
    registration.ensure_registered();

    let name = closure_to_name(&fut);
    let tt = registration.create_turbo_tasks(&name, true);
    println!("Run #1 (without cache)");
    let first = run_once(tt.clone(), fut()).await?;
    println!("Run #2 (with memory cache, same TurboTasks instance)");
    let second = run_once(tt, fut()).await?;
    assert_eq!(first, second);
    let tt = registration.create_turbo_tasks(&name, false);
    println!("Run #3 (with persistent cache if available, new TurboTasks instance)");
    let third = run_once(tt.clone(), fut()).await?;
    tt.stop_and_wait().await;
    assert_eq!(first, third);
    Ok(())
}
