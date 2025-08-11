//! Parallel for each resp. map running in the current tokio thread pool maintaining turbo tasks and
//! tracing context.
//!
//! This avoid the problem of sleeping threads with mimalloc when using rayon in combination with
//! tokio. It also avoid having multiple thread pools.

use std::{
    mem::{ManuallyDrop, take, transmute},
    panic,
    pin::Pin,
    sync::{Arc, LazyLock},
    thread::available_parallelism,
};

use tokio::{
    runtime::{Builder, Handle},
    task::{JoinHandle, block_in_place},
};
use tracing::{Instrument, Span};

use crate::{
    TurboTasksApi,
    manager::{try_turbo_tasks, turbo_tasks_future_scope},
};

/// Calculates a good chunk size for parallel processing based on the number of available threads.
/// This is used to ensure that the workload is evenly distributed across the threads.
fn good_chunk_size(len: usize) -> usize {
    static GOOD_CHUNK_COUNT: LazyLock<usize> =
        LazyLock::new(|| available_parallelism().map_or(16, |c| c.get() * 4));
    let min_chunk_count = *GOOD_CHUNK_COUNT;
    len.div_ceil(min_chunk_count)
}

/// Scope to allow spawning tasks with a limited lifetime.
///
/// Dropping this Scope will wait for all tasks to complete.
struct Scope<'l, R: Send + 'l> {
    results: Option<Box<[Option<R>]>>,
    futures: Vec<JoinHandle<std::marker::PhantomData<&'l ()>>>,
    handle: Handle,
    turbo_tasks: Option<Arc<dyn TurboTasksApi>>,
    span: Span,
    phantom: std::marker::PhantomData<&'l ()>,
}

impl<'l, R: Send + 'l> Scope<'l, R> {
    fn new(len: usize) -> Self {
        let mut results = Vec::with_capacity(len);
        for _ in 0..len {
            results.push(None);
        }
        Self {
            results: Some(results.into_boxed_slice()),
            futures: Vec::with_capacity(len),
            handle: Handle::current(),
            turbo_tasks: try_turbo_tasks(),
            span: Span::current(),
            phantom: std::marker::PhantomData,
        }
    }

    /// Spawns a new task in the scope.
    pub fn spawn<F>(&mut self, f: F)
    where
        F: Future<Output = R> + Send + 'l,
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

        let results = self
            .results
            .as_mut()
            .expect("spawn can't be called after the results have been read");
        assert!(results.len() > self.futures.len(), "Too many tasks spawned");
        let mut result_cell = SendablePtr::new(&mut results[self.futures.len()]);

        let f: Pin<Box<dyn Future<Output = ()> + Send + 'l>> = Box::pin(async move {
            let result = f.await;
            // SAFETY: This is a valid pointer, as we got this pointer from a reference.
            let result_cell = unsafe { result_cell.get_mut() };
            *result_cell = Some(result);
        });
        // SAFETY: In `process_in_parallel` we ensure that the spawned tasks is awaited before the
        // lifetime `'l` ends.
        let f: Pin<Box<dyn Future<Output = ()> + Send + 'static>> = unsafe {
            transmute::<
                Pin<Box<dyn Future<Output = ()> + Send + 'l>>,
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
                std::marker::PhantomData
            }
            .instrument(span),
        );
        self.futures.push(future);
    }

    /// Converts the scope into results, ensuring that all futures have been awaited.
    ///
    /// ## Safety
    ///
    /// This method is safe as it ensures that all futures have been awaited before returning the
    /// results.
    fn into_results(mut self) -> Vec<Option<R>> {
        self.block_until_complete();
        debug_assert!(
            self.futures.is_empty(),
            "All futures should be awaited before accessing the results"
        );
        self.results.take().unwrap().into_vec()
    }

    /// Blocks the current thread until all spawned tasks have completed.
    fn block_until_complete(&mut self) {
        let futures = take(&mut self.futures);
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

impl<'l, R: Send + 'l> Drop for Scope<'l, R> {
    fn drop(&mut self) {
        self.block_until_complete();
    }
}

/// Helper method to spawn tasks in parallel, ensuring that all tasks are awaited and errors are
/// handled. Also ensures turbo tasks and tracing context are maintained across the tasks.
///
/// ## Safety
///
/// The caller must ensure that all references in `inner` are valid for the lifetime `'l`.
unsafe fn scope_and_block<'l, I, R>(number_of_tasks: usize, inner: I) -> Vec<Option<R>>
where
    R: Send + 'l,
    I: FnOnce(&mut Scope<'l, R>) + 'l,
{
    block_in_place(|| {
        let mut scope = Scope::new(number_of_tasks);
        inner(&mut scope);
        scope.into_results()
    })
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
        scope_and_block(len.div_ceil(chunk_size), |scope| {
            for chunk in items.chunks(chunk_size) {
                scope.spawn(async move {
                    for item in chunk {
                        f(item);
                    }
                })
            }
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
        scope_and_block(len.div_ceil(chunk_size), |scope| {
            for chunk in items.chunks_mut(chunk_size) {
                scope.spawn(async move {
                    // SAFETY: Even when f() panics we drop all items in the chunk.
                    for item in
                        MapEvenWhenDropped::new(chunk.iter_mut(), |item| ManuallyDrop::take(item))
                    {
                        f(item);
                    }
                })
            }
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
        scope_and_block(len.div_ceil(chunk_size), |scope| {
            for chunk in items.chunks(chunk_size) {
                scope.spawn(async move {
                    for item in chunk {
                        f(item)?;
                    }
                    Ok(())
                })
            }
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
        scope_and_block(len.div_ceil(chunk_size), |scope| {
            for chunk in items.chunks_mut(chunk_size) {
                scope.spawn(async move {
                    for item in chunk {
                        f(item)?;
                    }
                    Ok(())
                })
            }
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
        scope_and_block(len.div_ceil(chunk_size), |scope| {
            for chunk in items.chunks_mut(chunk_size) {
                scope.spawn(async move {
                    // SAFETY: Even when f() panics we drop all items in the chunk.
                    for item in
                        MapEvenWhenDropped::new(chunk.iter_mut(), |item| ManuallyDrop::take(item))
                    {
                        f(item)?;
                    }
                    Ok(())
                })
            }
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
        scope_and_block(len.div_ceil(chunk_size), |scope| {
            for chunk in items.chunks(chunk_size) {
                scope.spawn(async move { chunk.iter().map(f).collect::<Vec<_>>() })
            }
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
        scope_and_block(len.div_ceil(chunk_size), |scope| {
            for chunk in items.chunks_mut(chunk_size) {
                scope.spawn(async move {
                    // SAFETY: Even when f() panics we drop all items in the chunk.
                    MapEvenWhenDropped::new(chunk.iter_mut(), |item| ManuallyDrop::take(item))
                        .map(f)
                        .collect::<Vec<_>>()
                })
            }
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
    use std::{
        panic::{AssertUnwindSafe, catch_unwind},
        sync::atomic::{AtomicI32, Ordering},
    };

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

    #[tokio::test(flavor = "multi_thread")]
    async fn test_panic_in_scope() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            let mut input = vec![1; 1000];
            input[744] = 2;
            for_each(&input, |x| {
                if *x == 2 {
                    panic!("Intentional panic");
                }
            });
            panic!("Should not get here")
        }));
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().downcast_ref::<&str>(),
            Some(&"Intentional panic")
        );
    }
}
