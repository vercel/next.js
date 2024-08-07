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
    create_turbo_tasks: fn() -> Arc<dyn TurboTasksApi>,
}

impl Registration {
    #[doc(hidden)]
    pub const fn new(create_turbo_tasks: fn() -> Arc<dyn TurboTasksApi>, func: fn()) -> Self {
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

    pub fn create_turbo_tasks(&self) -> Arc<dyn TurboTasksApi> {
        (self.create_turbo_tasks)()
    }
}

#[macro_export]
macro_rules! register {
    ($($other_register_fns:expr),* $(,)?) => {{
        use turbo_tasks::TurboTasksApi;
        use std::sync::Arc;
        fn create_turbo_tasks() -> Arc<dyn TurboTasksApi> {
            include!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/test_config.trs"
            ))
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
    let tt = registration.create_turbo_tasks();
    run_once(tt, async move { Ok(fut.await) }).await.unwrap()
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
    let tt = registration.create_turbo_tasks();
    let first = run_once(tt.clone(), fut()).await?;
    let second = run_once(tt, fut()).await?;
    assert_eq!(first, second);
    let tt = registration.create_turbo_tasks();
    let third = run_once(tt, fut()).await?;
    assert_eq!(first, third);
    Ok(())
}
