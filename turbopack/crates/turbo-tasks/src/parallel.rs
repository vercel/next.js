//! Parallel for each resp. map running in the current tokio thread pool maintaining turbo tasks and
//! tracing context.
//!
//! This avoid the problem of sleeping threads with mimalloc when using rayon in combination with
//! tokio. It also avoid having multiple thread pools.

use std::{
    mem::{ManuallyDrop, transmute},
    panic,
    sync::{Arc, LazyLock},
    thread::available_parallelism,
};

use tokio::{
    runtime::Handle,
    task::{JoinHandle, block_in_place},
};
use tracing::{Instrument, Span};

use crate::{TurboTasksApi, turbo_tasks, turbo_tasks_scope};

/// Calculates a good chunk size for parallel processing based on the number of available threads.
/// This is used to ensure that the workload is evenly distributed across the threads.
fn good_chunk_size(len: usize) -> usize {
    static GOOD_CHUNK_COUNT: LazyLock<usize> =
        LazyLock::new(|| available_parallelism().map_or(16, |c| c.get() * 4));
    let min_chunk_count = *GOOD_CHUNK_COUNT;
    (len + min_chunk_count - 1) / min_chunk_count
}

/// Context to allow spawning a task with a limited lifetime.
struct ProcessInParallelContext<'l> {
    handle: Handle,
    turbo_tasks: Arc<dyn TurboTasksApi>,
    span: Span,
    phantom: std::marker::PhantomData<&'l ()>,
}

impl<'l> ProcessInParallelContext<'l> {
    fn task<R, F>(&self, f: F) -> JoinHandle<R>
    where
        R: Send + 'static,
        F: FnOnce() -> R + Send + 'l,
    {
        let f: Box<dyn FnOnce() -> R + Send + 'l> = Box::new(f);
        let f: Box<dyn FnOnce() -> R + Send + 'static> = unsafe {
            transmute::<Box<dyn FnOnce() -> R + Send + 'l>, Box<dyn FnOnce() -> R + Send + 'static>>(
                f,
            )
        };
        let turbo_tasks = self.turbo_tasks.clone();
        let span = self.span.clone();
        self.handle.spawn(async move {
            turbo_tasks_scope(turbo_tasks, || {
                let _guard = span.entered();
                f()
            })
        })
    }
}

/// Helper method to spawn tasks in parallel, ensuring that all tasks are awaited and errors are
/// handled. Also ensures turbo tasks and tracing context are maintained across the tasks.
fn process_in_parallel<'l, I, R, F>(inner: I, mut result: F)
where
    R: 'l,
    I: FnOnce(&ProcessInParallelContext<'l>) -> Vec<JoinHandle<R>> + 'l,
    F: FnMut(R) + 'l,
{
    let context = ProcessInParallelContext {
        handle: Handle::current(),
        turbo_tasks: turbo_tasks(),
        span: Span::current(),
        phantom: std::marker::PhantomData,
    };
    let tasks = inner(&context);
    block_in_place(|| {
        context.handle.block_on(
            async {
                let mut first_err = None;
                for task in tasks {
                    match task.await {
                        Ok(r) => {
                            result(r);
                        }
                        Err(err) if first_err.is_none() => {
                            // SAFETY: We need to finish all tasks before panicking.
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
            .instrument(context.span.clone()),
        );
    });
}

pub fn for_each<'l, T, F>(items: &'l [T], f: F)
where
    T: Sync,
    F: Fn(&'l T) + Send + Sync,
{
    let len = items.len();
    if len == 0 {
        return;
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    process_in_parallel(
        |ctx| {
            items
                .chunks(chunk_size)
                .map(|chunk| {
                    ctx.task(move || {
                        for item in chunk {
                            f(item);
                        }
                    })
                })
                .collect::<Vec<_>>()
        },
        |_| {},
    );
    // SAFETY: Ensure reference is kept until here
    let _ = items;
}

pub fn into_for_each<T>(items: Vec<T>, f: impl Fn(T) + Send + Sync)
where
    T: Send + Sync,
{
    let len = items.len();
    if len == 0 {
        return;
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    let mut items = unsafe { transmute::<Vec<T>, Vec<ManuallyDrop<T>>>(items) };
    process_in_parallel(
        |ctx| {
            items
                .chunks_mut(chunk_size)
                .map(|chunk| {
                    ctx.task(move || {
                        for item in chunk {
                            let item = unsafe { ManuallyDrop::take(item) };
                            f(item);
                        }
                    })
                })
                .collect::<Vec<_>>()
        },
        |_| {},
    );
    drop(items);
}

pub fn try_for_each<'l, T, E>(
    items: &'l [T],
    f: impl (Fn(&'l T) -> Result<(), E>) + Send + Sync,
) -> Result<(), E>
where
    T: Sync,
    E: Send + 'static,
{
    let len = items.len();
    if len == 0 {
        return Ok(()); // No items to process, return early
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    let mut result = Ok(());
    process_in_parallel(
        |ctx| {
            items
                .chunks(chunk_size)
                .map(|chunk| {
                    ctx.task(move || {
                        for item in chunk {
                            f(item)?;
                        }
                        Ok(())
                    })
                })
                .collect::<Vec<_>>()
        },
        |r| {
            if let Err(e) = r {
                if result.is_ok() {
                    result = Err(e);
                }
            }
        },
    );
    // SAFETY: Ensure reference is kept until here
    let _ = items;
    result
}

pub fn try_for_each_mut<'l, T, E>(
    items: &'l mut [T],
    f: impl (Fn(&'l mut T) -> Result<(), E>) + Send + Sync,
) -> Result<(), E>
where
    T: Send + Sync,
    E: Send + 'static,
{
    let len = items.len();
    if len == 0 {
        return Ok(()); // No items to process, return early
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    let mut result = Ok(());
    process_in_parallel(
        |ctx| {
            items
                .chunks_mut(chunk_size)
                .map(|chunk| {
                    ctx.task(move || {
                        for item in chunk {
                            f(item)?;
                        }
                        Ok(())
                    })
                })
                .collect::<Vec<_>>()
        },
        |r| {
            if let Err(e) = r {
                if result.is_ok() {
                    result = Err(e);
                }
            }
        },
    );
    // SAFETY: Ensure reference is kept until here
    let _ = items;
    result
}

pub fn try_into_for_each<T, E>(
    items: Vec<T>,
    f: impl (Fn(T) -> Result<(), E>) + Send + Sync,
) -> Result<(), E>
where
    T: Send + Sync,
    E: Send + 'static,
{
    let len = items.len();
    if len == 0 {
        return Ok(()); // No items to process, return early
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    let mut result = Ok(());
    let mut items = unsafe { transmute::<Vec<T>, Vec<ManuallyDrop<T>>>(items) };
    process_in_parallel(
        |ctx| {
            items
                .chunks_mut(chunk_size)
                .map(|chunk| {
                    ctx.task(move || {
                        for item in chunk {
                            let item = unsafe { ManuallyDrop::take(item) };
                            f(item)?;
                        }
                        Ok(())
                    })
                })
                .collect::<Vec<_>>()
        },
        |r| {
            if let Err(e) = r {
                if result.is_ok() {
                    result = Err(e);
                }
            }
        },
    );
    // SAFETY: Ensure reference is kept until here
    let _ = items;
    result
}

pub fn map_collect<'l, T, I, R>(items: &'l [T], f: impl Fn(&'l T) -> I + Send + Sync) -> R
where
    T: Sync,
    I: Send + Sync,
    R: FromIterator<I>,
{
    let len = items.len();
    if len == 0 {
        return R::from_iter(std::iter::empty()); // No items to process, return empty collection
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    let mut result = Vec::with_capacity(items.len().div_ceil(chunk_size));
    process_in_parallel(
        |ctx| {
            items
                .chunks(chunk_size)
                .map(|chunk| {
                    ctx.task(move || {
                        let vec = chunk.iter().map(f).collect::<Vec<_>>();
                        unsafe { transmute::<Vec<I>, Vec<()>>(vec) }
                    })
                })
                .collect::<Vec<_>>()
        },
        |r| {
            let r: Vec<I> = unsafe { transmute::<Vec<()>, Vec<I>>(r) };
            result.push(r)
        },
    );
    // SAFETY: Ensure reference is kept until here
    let _ = items;
    result.into_iter().flatten().collect::<R>()
}

pub fn into_map_collect<'l, T, I, R>(items: Vec<T>, f: impl Fn(T) -> I + Send + Sync) -> R
where
    T: Send + Sync,
    I: Send + Sync + 'l,
    R: FromIterator<I>,
{
    let len = items.len();
    if len == 0 {
        return R::from_iter(std::iter::empty()); // No items to process, return empty collection;
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    let mut items = unsafe { transmute::<Vec<T>, Vec<ManuallyDrop<T>>>(items) };
    let mut result = Vec::with_capacity(items.len().div_ceil(chunk_size));
    process_in_parallel(
        |ctx| {
            items
                .chunks_mut(chunk_size)
                .map(|chunk| {
                    ctx.task(move || {
                        let vec = chunk
                            .iter_mut()
                            .map(|item| {
                                let item = unsafe { ManuallyDrop::take(item) };
                                f(item)
                            })
                            .collect::<Vec<_>>();
                        unsafe { transmute::<Vec<I>, Vec<()>>(vec) }
                    })
                })
                .collect::<Vec<_>>()
        },
        |r| {
            let r: Vec<I> = unsafe { transmute::<Vec<()>, Vec<I>>(r) };
            result.push(r);
        },
    );
    // SAFETY: Ensure reference is kept until here
    let _ = items;
    result.into_iter().flatten().collect::<R>()
}
