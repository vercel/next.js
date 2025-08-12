//! A scoped tokio spawn implementation that allow a non-'static lifetime for tasks.

use std::{
    any::Any,
    marker::PhantomData,
    panic::{self, AssertUnwindSafe, catch_unwind},
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    thread::{self, Thread},
};

use futures::FutureExt;
use parking_lot::Mutex;
use tokio::{runtime::Handle, task::block_in_place};
use tracing::{Instrument, Span, info_span};

use crate::{
    TurboTasksApi,
    manager::{try_turbo_tasks, turbo_tasks_future_scope},
};

struct ScopeInner {
    main_thread: Thread,
    remaining_tasks: AtomicUsize,
    /// The first panic that occurred in the tasks, by task index.
    /// The usize value is the index of the task.
    panic: Mutex<Option<(Box<dyn Any + Send + 'static>, usize)>>,
}

impl ScopeInner {
    fn on_task_finished(&self, panic: Option<(Box<dyn Any + Send + 'static>, usize)>) {
        if let Some((err, index)) = panic {
            let mut old_panic = self.panic.lock();
            if old_panic.as_ref().is_none_or(|&(_, i)| i > index) {
                *old_panic = Some((err, index));
            }
        }
        if self.remaining_tasks.fetch_sub(1, Ordering::Release) == 1 {
            self.main_thread.unpark();
        }
    }

    fn wait(&self) {
        let _span = info_span!("blocking").entered();
        while self.remaining_tasks.load(Ordering::Acquire) != 0 {
            thread::park();
        }
        if let Some((err, _)) = self.panic.lock().take() {
            panic::resume_unwind(err);
        }
    }
}

/// Scope to allow spawning tasks with a limited lifetime.
///
/// Dropping this Scope will wait for all tasks to complete.
pub struct Scope<'scope, 'env: 'scope, R: Send + 'env> {
    results: &'scope [Mutex<Option<R>>],
    index: AtomicUsize,
    inner: Arc<ScopeInner>,
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
    /// Creates a new scope.
    ///
    /// # Safety
    ///
    /// The caller must ensure `Scope` is dropped and not forgotten.
    unsafe fn new(results: &'scope [Mutex<Option<R>>]) -> Self {
        Self {
            results,
            index: AtomicUsize::new(0),
            inner: Arc::new(ScopeInner {
                main_thread: thread::current(),
                remaining_tasks: AtomicUsize::new(0),
                panic: Mutex::new(None),
            }),
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

        let f: Box<dyn Future<Output = ()> + Send + 'scope> = Box::new(async move {
            let result = f.await;
            *result_cell.lock() = Some(result);
        });
        let f: *mut (dyn Future<Output = ()> + Send + 'scope) = Box::into_raw(f);
        // SAFETY: Scope ensures (e. g. in Drop) that spawned tasks is awaited before the
        // lifetime `'env` ends.
        #[allow(
            clippy::unnecessary_cast,
            reason = "Clippy thinks this is unnecessary, but it actually changes the lifetime"
        )]
        let f = f as *mut (dyn Future<Output = ()> + Send + 'static);
        // SAFETY: We just called `Box::into_raw`.
        let f = unsafe { Box::from_raw(f) };
        // We pin the future in the box in memory to be able to await it.
        let f = Pin::from(f);

        let turbo_tasks = self.turbo_tasks.clone();
        let span = self.span.clone();

        let inner = self.inner.clone();
        inner.remaining_tasks.fetch_add(1, Ordering::Relaxed);
        self.handle.spawn(async move {
            let result = AssertUnwindSafe(
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
            )
            .catch_unwind()
            .await;
            let panic = result.err().map(|e| (e, index));
            inner.on_task_finished(panic);
        });
    }
}

impl<'scope, 'env: 'scope, R: Send + 'env> Drop for Scope<'scope, 'env, R> {
    fn drop(&mut self) {
        self.inner.wait();
    }
}

/// Helper method to spawn tasks in parallel, ensuring that all tasks are awaited and errors are
/// handled. Also ensures turbo tasks and tracing context are maintained across the tasks.
///
/// Be aware that although this function avoids starving other independently spawned tasks, any
/// other code running concurrently in the same task will be suspended during the call to
/// block_in_place. This can happen e.g. when using the `join!` macro. To avoid this issue, call
/// `scope_and_block` in `spawn_blocking`.
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
            // SAFETY: We drop the Scope later.
            let scope = unsafe { Scope::new(&results) };
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
    async fn test_empty_scope() {
        let results = scope_and_block(0, |scope| {
            if false {
                scope.spawn(async move { 42 });
            }
        });
        assert_eq!(results.count(), 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_single_task() {
        let results = scope_and_block(1, |scope| {
            scope.spawn(async move { 42 });
        })
        .collect::<Vec<_>>();
        assert_eq!(results, vec![42]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_task_finish_before_scope() {
        let results = scope_and_block(1, |scope| {
            scope.spawn(async move { 42 });
            thread::sleep(std::time::Duration::from_millis(100));
        })
        .collect::<Vec<_>>();
        assert_eq!(results, vec![42]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_task_finish_after_scope() {
        let results = scope_and_block(1, |scope| {
            scope.spawn(async move {
                thread::sleep(std::time::Duration::from_millis(100));
                42
            });
        })
        .collect::<Vec<_>>();
        assert_eq!(results, vec![42]);
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
