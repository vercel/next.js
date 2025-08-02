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

use crate::{
    TurboTasksApi,
    manager::{try_turbo_tasks, turbo_tasks_try_scope},
};

/// Calculates a good chunk size for parallel processing based on the number of available threads.
/// This is used to ensure that the workload is evenly distributed across the threads.
fn good_chunk_size(len: usize) -> usize {
    static GOOD_CHUNK_COUNT: LazyLock<usize> =
        LazyLock::new(|| available_parallelism().map_or(16, |c| c.get() * 4));
    let min_chunk_count = *GOOD_CHUNK_COUNT;
    len.div_ceil(min_chunk_count)
}

/// Context to allow spawning a task with a limited lifetime.
///
/// ## Safety
///
/// This context must not be dropped before all tasks spawned with it have been awaited.
struct ProcessInParallelContext<'l, R: Send + 'l> {
    results: Box<[Option<R>]>,
    index: usize,
    handle: Handle,
    turbo_tasks: Option<Arc<dyn TurboTasksApi>>,
    span: Span,
    phantom: std::marker::PhantomData<&'l ()>,
}

impl<'l, R: Send + 'l> ProcessInParallelContext<'l, R> {
    fn new(len: usize) -> Self {
        let mut results = Vec::with_capacity(len);
        for _ in 0..len {
            results.push(None);
        }
        Self {
            results: results.into_boxed_slice(),
            index: 0,
            handle: Handle::current(),
            turbo_tasks: try_turbo_tasks(),
            span: Span::current(),
            phantom: std::marker::PhantomData,
        }
    }

    fn task<F>(&mut self, f: F) -> JoinHandle<()>
    where
        F: FnOnce() -> R + Send + 'l,
    {
        struct SendablePtr<T>(*mut Option<T>);
        unsafe impl<T: Send> Send for SendablePtr<T> {}
        unsafe impl<T: Sync> Sync for SendablePtr<T> {}
        impl<T> SendablePtr<T> {
            fn new(reference: &mut Option<T>) -> Self {
                SendablePtr(reference as *mut Option<T>)
            }

            unsafe fn get_mut(&mut self) -> &mut Option<T> {
                // SAFETY: This is a valid pointer, as we got this pointer from a reference.
                unsafe { &mut *self.0 }
            }
        }

        let mut result_cell = SendablePtr::new(&mut self.results[self.index]);
        self.index += 1;

        let f: Box<dyn FnOnce() + Send + 'l> = Box::new(move || {
            let result = f();
            // SAFETY: This is a valid pointer, as we got this pointer from a reference.
            let result_cell = unsafe { result_cell.get_mut() };
            *result_cell = Some(result);
        });
        // SAFETY: In `process_in_parallel` we ensure that the spawned tasks is awaited before the
        // lifetime `'l` ends.
        let f: Box<dyn FnOnce() + Send + 'static> = unsafe {
            transmute::<Box<dyn FnOnce() + Send + 'l>, Box<dyn FnOnce() + Send + 'static>>(f)
        };
        let turbo_tasks = self.turbo_tasks.clone();
        let span = self.span.clone();
        self.handle.spawn(async move {
            turbo_tasks_try_scope(turbo_tasks, || {
                let _guard = span.entered();
                f();
            })
        })
    }

    /// Converts the context into a vector of results
    ///
    /// ## Safety
    ///
    /// The caller must ensure that all tasks have been awaited before calling this method.
    unsafe fn into_results(self) -> Vec<Option<R>> {
        self.results.into_vec()
    }
}

/// Helper method to spawn tasks in parallel, ensuring that all tasks are awaited and errors are
/// handled. Also ensures turbo tasks and tracing context are maintained across the tasks.
///
/// ## Safety
///
/// The caller must ensure that all references in `inner` are valid for the lifetime `'l`.
unsafe fn process_in_parallel<'l, I, R>(len: usize, inner: I) -> Vec<Option<R>>
where
    R: Send + 'l,
    I: FnOnce(&mut ProcessInParallelContext<'l, R>) -> Vec<JoinHandle<()>> + 'l,
{
    let mut process_context = ProcessInParallelContext::new(len);
    let tasks = inner(&mut process_context);
    block_in_place(|| {
        process_context.handle.block_on(
            async {
                let mut first_err = None;
                for task in tasks {
                    match task.await {
                        Ok(()) => {}
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
            .instrument(process_context.span.clone()),
        );
    });
    // SAFETY: We ensure that all tasks have been awaited before calling this method.
    unsafe { process_context.into_results() }
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
    // SAFETY: We ensured that references in the closure are valid for the whole lifetime of this
    // function.
    unsafe {
        process_in_parallel(len.div_ceil(chunk_size), |ctx| {
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
        })
    };
    // SAFETY: Ensure references are kept until here
    let _ = items;
    let _ = f;
}

pub fn vec_into_for_each<T>(items: Vec<T>, f: impl Fn(T) + Send + Sync)
where
    T: Send + Sync,
{
    let len = items.len();
    if len == 0 {
        return;
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    // SAFETY: transmuting to ManuallyDrop is always safe. We just need to make sure to not leak
    // memory.
    let mut items = unsafe { transmute::<Vec<T>, Vec<ManuallyDrop<T>>>(items) };
    // SAFETY: We ensured that references in the closure are valid for the whole lifetime of this
    // function.
    unsafe {
        process_in_parallel(len.div_ceil(chunk_size), |ctx| {
            items
                .chunks_mut(chunk_size)
                .map(|chunk| {
                    ctx.task(move || {
                        // SAFETY: Even when f() panics we drop all items in the chunk.
                        for item in MapEvenWhenDropped::new(chunk.iter_mut(), |item| {
                            ManuallyDrop::take(item)
                        }) {
                            f(item);
                        }
                    })
                })
                .collect::<Vec<_>>()
        })
    };
    // SAFETY: Ensure references are kept until here
    drop(items);
    let _ = f;
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
    // SAFETY: We ensured that references in the closure are valid for the whole lifetime of this
    // function.
    let results = unsafe {
        process_in_parallel(len.div_ceil(chunk_size), |ctx| {
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
        })
    };
    let result = results.into_iter().flatten().collect::<Result<(), E>>();
    // SAFETY: Ensure references are kept until here
    let _ = items;
    let _ = f;
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
    // SAFETY: We ensured that references in the closure are valid for the whole lifetime of this
    // function.
    let results = unsafe {
        process_in_parallel(len.div_ceil(chunk_size), |ctx| {
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
        })
    };
    let result = results.into_iter().flatten().collect::<Result<(), E>>();
    // SAFETY: Ensure references are kept until here
    let _ = items;
    let _ = f;
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
    // SAFETY: transmuting to ManuallyDrop is always safe. We just need to make sure to not leak
    // memory.
    let mut items = unsafe { transmute::<Vec<T>, Vec<ManuallyDrop<T>>>(items) };
    // SAFETY: We ensured that references in the closure are valid for the whole lifetime of this
    // function.
    let results = unsafe {
        process_in_parallel(len.div_ceil(chunk_size), |ctx| {
            items
                .chunks_mut(chunk_size)
                .map(|chunk| {
                    ctx.task(move || {
                        // SAFETY: Even when f() panics we drop all items in the chunk.
                        for item in MapEvenWhenDropped::new(chunk.iter_mut(), |item| {
                            ManuallyDrop::take(item)
                        }) {
                            f(item)?;
                        }
                        Ok(())
                    })
                })
                .collect::<Vec<_>>()
        })
    };
    let result = results.into_iter().flatten().collect::<Result<(), E>>();
    // SAFETY: Ensure references are kept until here
    let _ = items;
    let _ = f;
    result
}

pub fn map_collect<'l, T, I, R>(items: &'l [T], f: impl Fn(&'l T) -> I + Send + Sync) -> R
where
    T: Sync,
    I: Send + Sync + 'l,
    R: FromIterator<I>,
{
    let len = items.len();
    if len == 0 {
        return R::from_iter(std::iter::empty()); // No items to process, return empty collection
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    // SAFETY: We ensured that references in the closure are valid for the whole lifetime of this
    // function.
    let results = unsafe {
        process_in_parallel(len.div_ceil(chunk_size), |ctx| {
            items
                .chunks(chunk_size)
                .map(|chunk| ctx.task(move || chunk.iter().map(f).collect::<Vec<_>>()))
                .collect::<Vec<_>>()
        })
    };
    let result = results.into_iter().flatten().flatten().collect();
    // SAFETY: Ensure references are kept until here
    let _ = items;
    let _ = f;
    result
}

pub fn vec_into_map_collect<'l, T, I, R>(items: Vec<T>, f: impl Fn(T) -> I + Send + Sync) -> R
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
    // SAFETY: We ensured that references in the closure are valid for the whole lifetime of this
    // function.
    let results = unsafe {
        process_in_parallel(len.div_ceil(chunk_size), |ctx| {
            items
                .chunks_mut(chunk_size)
                .map(|chunk| {
                    ctx.task(move || {
                        // SAFETY: Even when f() panics we drop all items in the chunk.
                        MapEvenWhenDropped::new(chunk.iter_mut(), |item| ManuallyDrop::take(item))
                            .map(f)
                            .collect::<Vec<_>>()
                    })
                })
                .collect::<Vec<_>>()
        })
    };
    let result = results.into_iter().flatten().flatten().collect();
    // SAFETY: Ensure references are kept until here
    let _ = items;
    let _ = f;
    result
}

struct MapEvenWhenDropped<I, B, F>
where
    I: Iterator,
    F: FnMut(I::Item) -> B,
{
    iter: I,
    f: F,
}

impl<I, B, F> MapEvenWhenDropped<I, B, F>
where
    I: Iterator,
    F: FnMut(I::Item) -> B,
{
    fn new(iter: I, f: F) -> Self {
        Self { iter, f }
    }
}

impl<I, B, F> Iterator for MapEvenWhenDropped<I, B, F>
where
    I: Iterator,
    F: FnMut(I::Item) -> B,
{
    type Item = B;

    fn next(&mut self) -> Option<Self::Item> {
        self.iter.next().map(&mut self.f)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.iter.size_hint()
    }
}

impl<I, B, F> Drop for MapEvenWhenDropped<I, B, F>
where
    I: Iterator,
    F: FnMut(I::Item) -> B,
{
    fn drop(&mut self) {
        // Ensure that the mapping function is called even when the iterator is dropped.
        for item in &mut self.iter {
            drop((self.f)(item));
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicI32, Ordering};

    use super::*;

    #[tokio::test(flavor = "multi_thread")]
    async fn test_parallel_for_each() {
        let input = vec![1, 2, 3, 4, 5];
        let sum = AtomicI32::new(0);
        for_each(&input, |&x| {
            sum.fetch_add(x, Ordering::SeqCst);
        });
        assert_eq!(sum.load(Ordering::SeqCst), 15);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_parallel_try_for_each() {
        let input = vec![1, 2, 3, 4, 5];
        let result = try_for_each(&input, |&x| {
            if x % 2 == 0 {
                Ok(())
            } else {
                Err(format!("Odd number {x} encountered"))
            }
        });
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Odd number 1 encountered");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_parallel_try_for_each_mut() {
        let mut input = vec![1, 2, 3, 4, 5];
        let result = try_for_each_mut(&mut input, |x| {
            *x += 10;
            if *x % 2 == 0 {
                Ok(())
            } else {
                Err(format!("Odd number {} encountered", *x))
            }
        });
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Odd number 11 encountered");
        assert_eq!(input, vec![11, 12, 13, 14, 15]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_parallel_vec_into_for_each() {
        let input = vec![1, 2, 3, 4, 5];
        let sum = AtomicI32::new(0);
        vec_into_for_each(input, |x| {
            sum.fetch_add(x, Ordering::SeqCst);
        });
        assert_eq!(sum.load(Ordering::SeqCst), 15);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_parallel_map_collect() {
        let input = vec![1, 2, 3, 4, 5];
        let result: Vec<_> = map_collect(&input, |&x| x * 2);
        assert_eq!(result, vec![2, 4, 6, 8, 10]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_parallel_into_map_collect() {
        let input = vec![1, 2, 3, 4, 5];
        let result: Vec<_> = vec_into_map_collect(input, |x| x * 2);
        assert_eq!(result, vec![2, 4, 6, 8, 10]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_parallel_vec_into_map_collect_many() {
        let input = vec![1; 1000];
        let result: Vec<_> = vec_into_map_collect(input, |x| x * 2);
        assert_eq!(result, vec![2; 1000]);
    }
}
