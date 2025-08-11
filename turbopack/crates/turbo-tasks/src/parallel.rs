//! Parallel for each resp. map running in the current tokio thread pool maintaining turbo tasks and
//! tracing context.
//!
//! This avoid the problem of sleeping threads with mimalloc when using rayon in combination with
//! tokio. It also avoid having multiple thread pools.

use std::{
    mem::{ManuallyDrop, transmute},
    sync::LazyLock,
    thread::available_parallelism,
};

use crate::scope::scope_and_block;

/// Calculates a good chunk size for parallel processing based on the number of available threads.
/// This is used to ensure that the workload is evenly distributed across the threads.
fn good_chunk_size(len: usize) -> usize {
    static GOOD_CHUNK_COUNT: LazyLock<usize> =
        LazyLock::new(|| available_parallelism().map_or(16, |c| c.get() * 4));
    let min_chunk_count = *GOOD_CHUNK_COUNT;
    len.div_ceil(min_chunk_count)
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
    if len == 1 {
        for item in items {
            f(item);
        }
        return;
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    let _results = scope_and_block(len.div_ceil(chunk_size), |scope| {
        for chunk in items.chunks(chunk_size) {
            scope.spawn(async move {
                for item in chunk {
                    f(item);
                }
            })
        }
    });
}

pub fn vec_into_for_each<T>(items: Vec<T>, f: impl Fn(T) + Send + Sync)
where
    T: Send + Sync,
{
    let len = items.len();
    if len == 0 {
        return;
    }
    if len == 1 {
        for item in items {
            f(item);
        }
        return;
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    // SAFETY: transmuting to ManuallyDrop is always safe. We just need to make sure to not leak
    // memory.
    let mut items = unsafe { transmute::<Vec<T>, Vec<ManuallyDrop<T>>>(items) };
    let _results = scope_and_block(len.div_ceil(chunk_size), |scope| {
        for chunk in items.chunks_mut(chunk_size) {
            scope.spawn(async move {
                // SAFETY: Even when f() panics we drop all items in the chunk.
                for item in MapEvenWhenDropped::new(chunk.iter_mut(), |item| {
                    // SAFETY: We call ManuallyDrop::take(item) only once per item
                    unsafe { ManuallyDrop::take(item) }
                }) {
                    f(item);
                }
            })
        }
    });
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
    if len == 1 {
        for item in items {
            f(item)?;
        }
        return Ok(());
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
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
    .collect::<Result<(), E>>()
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
    if len == 1 {
        for item in items {
            f(item)?;
        }
        return Ok(());
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
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
    .collect::<Result<(), E>>()
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
    if len == 1 {
        for item in items {
            f(item)?;
        }
        return Ok(());
    }
    let chunk_size = good_chunk_size(len);
    let f = &f;
    // SAFETY: transmuting to ManuallyDrop is always safe. We just need to make sure to not leak
    // memory.
    let mut items = unsafe { transmute::<Vec<T>, Vec<ManuallyDrop<T>>>(items) };
    scope_and_block(len.div_ceil(chunk_size), |scope| {
        for chunk in items.chunks_mut(chunk_size) {
            scope.spawn(async move {
                // SAFETY: Even when f() panics we drop all items in the chunk.
                for item in MapEvenWhenDropped::new(chunk.iter_mut(), |item| {
                    // SAFETY: We call ManuallyDrop::take(item) only once per item
                    unsafe { ManuallyDrop::take(item) }
                }) {
                    f(item)?;
                }
                Ok(())
            })
        }
    })
    .collect::<Result<(), E>>()
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
    scope_and_block(len.div_ceil(chunk_size), |scope| {
        for chunk in items.chunks(chunk_size) {
            scope.spawn(async move { chunk.iter().map(f).collect::<Vec<_>>() })
        }
    })
    .flatten()
    .collect()
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
    scope_and_block(len.div_ceil(chunk_size), |scope| {
        for chunk in items.chunks_mut(chunk_size) {
            scope.spawn(async move {
                // SAFETY: Even when f() panics we drop all items in the chunk.
                MapEvenWhenDropped::new(chunk.iter_mut(), |item| {
                    // SAFETY: We call ManuallyDrop::take(item) only once per item
                    unsafe { ManuallyDrop::take(item) }
                })
                .map(f)
                .collect::<Vec<_>>()
            })
        }
    })
    .flatten()
    .collect()
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
