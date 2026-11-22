//! Process-local cleanup that must finish before the project's task engine stops.

use std::sync::Mutex;

use anyhow::Result;
use futures::future::BoxFuture;
use turbo_tasks::NonLocalValue;

#[derive(Default, NonLocalValue)]
pub struct ShutdownHooks {
    hooks: Mutex<Vec<Box<dyn PendingShutdown>>>,
}

trait PendingShutdown: NonLocalValue + Send {
    fn run(self: Box<Self>) -> BoxFuture<'static, Result<()>>;
}

#[derive(NonLocalValue)]
struct ShutdownHook<T: NonLocalValue> {
    resource: T,
    shutdown: fn(T) -> BoxFuture<'static, Result<()>>,
}

impl<T: NonLocalValue + Send + 'static> PendingShutdown for ShutdownHook<T> {
    fn run(self: Box<Self>) -> BoxFuture<'static, Result<()>> {
        (self.shutdown)(self.resource)
    }
}

impl ShutdownHooks {
    /// Avoid scheduling new task work when cleanup has already run, including exit fallbacks
    /// after the engine has stopped.
    pub fn is_empty(&self) -> bool {
        self.hooks.lock().unwrap().is_empty()
    }

    /// Register cleanup when a project resource is created. Separate its captured state from the
    /// callback so task-local references cannot escape into a later shutdown task.
    pub fn on_shutdown<T: NonLocalValue + Send + 'static>(
        &self,
        resource: T,
        shutdown: fn(T) -> BoxFuture<'static, Result<()>>,
    ) {
        self.hooks
            .lock()
            .unwrap()
            .push(Box::new(ShutdownHook { resource, shutdown }));
    }

    /// Run inside Turbo Tasks, before stopping the engine. A failed hook must not prevent the
    /// remaining hooks, engine shutdown, or trace flushing from running.
    pub async fn run(&self) {
        let hooks = std::mem::take(&mut *self.hooks.lock().unwrap());
        for hook in hooks {
            if let Err(error) = hook.run().await {
                eprintln!("Failed to run project pre-shutdown hook: {error:#}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    };

    use turbo_rcstr::rcstr;
    use turbo_tasks::TurboTasks;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::ShutdownHooks;
    use crate::project::ProjectContainer;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn cleanup_continues_after_failure_and_allows_engine_shutdown() {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let hooks = Arc::new(ShutdownHooks::default());
        let project_hooks = hooks.clone();
        tt.run_once(async move {
            ProjectContainer::new_operation(rcstr!("shutdown-test"), false)
                .read_strongly_consistent()
                .await?
                .register_shutdown_hooks(&project_hooks);
            anyhow::Ok(())
        })
        .await
        .unwrap();

        let cancelled = Arc::new(AtomicBool::new(false));
        let work_cancelled = cancelled.clone();
        let worker_tt = tt.clone();
        let (started, ready) = tokio::sync::oneshot::channel();
        let worker = tokio::spawn(async move {
            worker_tt
                .run_once(async move {
                    started.send(()).unwrap();
                    while !work_cancelled.load(Ordering::SeqCst) {
                        tokio::task::yield_now().await;
                    }
                    anyhow::Ok(())
                })
                .await
        });
        ready.await.unwrap();

        let calls = Arc::new(AtomicUsize::new(0));
        hooks.on_shutdown((), |()| Box::pin(async { anyhow::bail!("cleanup failed") }));
        hooks.on_shutdown((calls.clone(), cancelled), |(calls, cancelled)| {
            Box::pin(async move {
                calls.fetch_add(1, Ordering::SeqCst);
                cancelled.store(true, Ordering::SeqCst);
                Ok(())
            })
        });
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        for _ in 0..2 {
            let hooks = hooks.clone();
            tt.run_once(async move {
                hooks.run().await;
                anyhow::Ok(())
            })
            .await
            .unwrap();
        }
        assert!(hooks.is_empty());
        tokio::time::timeout(std::time::Duration::from_secs(10), tt.stop_and_wait())
            .await
            .expect("cleanup must release active tasks before stopping the engine");
        worker.await.unwrap().unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
}
