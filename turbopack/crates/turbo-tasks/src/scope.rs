//! Parallel for each resp. map running in the current tokio thread pool maintaining turbo tasks and
//! tracing context.
//!
//! This avoid the problem of sleeping threads with mimalloc when using rayon in combination with
//! tokio. It also avoid having multiple thread pools.

use std::{
    marker::PhantomData,
    mem::{take, transmute},
    panic::{self, AssertUnwindSafe, catch_unwind},
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use parking_lot::Mutex;
use tokio::{
    runtime::{Builder, Handle},
    task::{JoinHandle, block_in_place},
};
use tracing::{Instrument, Span};

use crate::{
    TurboTasksApi,
    manager::{try_turbo_tasks, turbo_tasks_future_scope},
};

/// Scope to allow spawning tasks with a limited lifetime.
///
/// Dropping this Scope will wait for all tasks to complete.
pub struct Scope<'scope, 'env: 'scope, R: Send + 'env> {
    results: &'scope [Mutex<Option<R>>],
    index: AtomicUsize,
    futures: Mutex<Vec<JoinHandle<()>>>,
    handle: Handle,
    turbo_tasks: Option<Arc<dyn TurboTasksApi>>,
    span: Span,
    /// Invariance over 'env, to make sure 'env cannot shrink,
    /// which is necessary for soundness.
    ///
    /// see https://doc.rust-lang.org/src/std/thread/scoped.rs.html#12-29
    env: PhantomData<&'env mut &'env ()>,
}

impl<'scope, 'env: 'scope, R: Send + 'env> Scope<'scope, 'env, R> {
    fn new(results: &'scope [Mutex<Option<R>>]) -> Self {
        Self {
            results,
            index: AtomicUsize::new(0),
            futures: Mutex::new(Vec::with_capacity(results.len())),
            handle: Handle::current(),
            turbo_tasks: try_turbo_tasks(),
            span: Span::current(),
            env: PhantomData,
        }
    }

    /// Spawns a new task in the scope.
    pub fn spawn<F>(&self, f: F)
    where
        F: Future<Output = R> + Send + 'env,
    {
        let index = self.index.fetch_add(1, Ordering::Relaxed);
        assert!(index < self.results.len(), "Too many tasks spawned");
        let result_cell: &Mutex<Option<R>> = &self.results[index];

        let f: Pin<Box<dyn Future<Output = ()> + Send + 'scope>> = Box::pin(async move {
            let result = f.await;
            *result_cell.lock() = Some(result);
        });
        // SAFETY: In `process_in_parallel` we ensure that the spawned tasks is awaited before the
        // lifetime `'l` ends.
        let f: Pin<Box<dyn Future<Output = ()> + Send + 'static>> = unsafe {
            transmute::<
                Pin<Box<dyn Future<Output = ()> + Send + 'scope>>,
                Pin<Box<dyn Future<Output = ()> + Send + 'static>>,
            >(f)
        };
        let turbo_tasks = self.turbo_tasks.clone();
        let span = self.span.clone();
        let future = self.handle.spawn(
            async move {
                if let Some(turbo_tasks) = turbo_tasks {
                    // Ensure that the turbo tasks context is maintained across the task.
                    turbo_tasks_future_scope(turbo_tasks, f).await;
                } else {
                    // If no turbo tasks context is available, just run the future.
                    f.await;
                }
            }
            .instrument(span),
        );
        self.futures.lock().push(future);
    }

    /// Blocks the current thread until all spawned tasks have completed.
    fn block_until_complete(&self) {
        let futures = take(&mut *self.futures.lock());
        if futures.is_empty() {
            return; // No tasks to wait for, return early
        }
        // We create a new current thread runtime to be independent of the current tokio runtime.
        // This makes us not subject to runtime shutdown and we can drive the futures to completion
        // in all cases.
        Builder::new_current_thread().build().unwrap().block_on(
            async {
                let mut first_err = None;
                for task in futures {
                    match task.await {
                        Ok(_) => {}
                        Err(err) if first_err.is_none() => {
                            // SAFETY: We need to finish all futures before panicking.
                            first_err = Some(err);
                        }
                        Err(_) => {
                            // Ignore subsequent errors
                        }
                    }
                }
                if let Some(err) = first_err {
                    panic::resume_unwind(err.into_panic());
                }
            }
            .instrument(self.span.clone()),
        );
    }
}

impl<'scope, 'env: 'scope, R: Send + 'env> Drop for Scope<'scope, 'env, R> {
    fn drop(&mut self) {
        self.block_until_complete();
    }
}

/// Helper method to spawn tasks in parallel, ensuring that all tasks are awaited and errors are
/// handled. Also ensures turbo tasks and tracing context are maintained across the tasks.
pub fn scope_and_block<'env, F, R>(number_of_tasks: usize, f: F) -> impl Iterator<Item = R>
where
    R: Send + 'env,
    F: for<'scope> FnOnce(&'scope Scope<'scope, 'env, R>) + 'env,
{
    block_in_place(|| {
        let mut results = Vec::with_capacity(number_of_tasks);
        for _ in 0..number_of_tasks {
            results.push(Mutex::new(None));
        }
        let results = results.into_boxed_slice();
        let result = {
            let scope = Scope::new(&results);
            catch_unwind(AssertUnwindSafe(|| f(&scope)))
        };
        if let Err(panic) = result {
            panic::resume_unwind(panic);
        }
        results.into_iter().map(|mutex| {
            mutex
                .into_inner()
                .expect("All values are set when the scope returns without panic")
        })
    })
}

#[cfg(test)]
mod tests {
    use std::panic::{AssertUnwindSafe, catch_unwind};

    use super::*;

    #[tokio::test(flavor = "multi_thread")]
    async fn test_scope() {
        let results = scope_and_block(1000, |scope| {
            for i in 0..1000 {
                scope.spawn(async move { i });
            }
        });
        results.enumerate().for_each(|(i, result)| {
            assert_eq!(result, i);
        });
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_panic_in_scope_factory() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            let _results = scope_and_block(1000, |scope| {
                for i in 0..500 {
                    scope.spawn(async move { i });
                }
                panic!("Intentional panic");
            });
            unreachable!();
        }));
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().downcast_ref::<&str>(),
            Some(&"Intentional panic")
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_panic_in_scope_task() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            let _results = scope_and_block(1000, |scope| {
                for i in 0..1000 {
                    scope.spawn(async move {
                        if i == 500 {
                            panic!("Intentional panic");
                        } else if i == 501 {
                            panic!("Wrong intentional panic");
                        } else {
                            i
                        }
                    });
                }
            });
            unreachable!();
        }));
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().downcast_ref::<&str>(),
            Some(&"Intentional panic")
        );
    }
}
