use std::{future::Future, sync::OnceLock};

use turbo_tasks::{trace::TraceRawVcs, TurboTasks};
use turbo_tasks_memory::MemoryBackend;

pub struct Registration {
    execution_lock: OnceLock<()>,
    func: fn(),
}

impl Registration {
    #[doc(hidden)]
    pub const fn new(func: fn()) -> Self {
        Registration {
            execution_lock: OnceLock::new(),
            func,
        }
    }

    /// Called by [`run`]. You can call this manually if you're not using
    /// [`run`] (e.g. because you're using a customized `turbo_tasks`
    /// implementation or tokio runtime).
    pub fn ensure_registered(&self) {
        self.execution_lock.get_or_init(self.func);
    }
}

#[macro_export]
macro_rules! register {
    ($($other_register_fns:expr),* $(,)?) => {{
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
        turbo_tasks_testing::Registration::new(register_impl)
    }};
}

pub async fn run<T>(registration: &Registration, fut: impl Future<Output = T> + Send + 'static) -> T
where
    T: TraceRawVcs + Send + 'static,
{
    registration.ensure_registered();
    let tt = TurboTasks::new(MemoryBackend::default());
    tt.run_once(async move { Ok(fut.await) }).await.unwrap()
}
