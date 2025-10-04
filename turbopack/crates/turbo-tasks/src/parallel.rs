//! Parallel for each and map using tokio tasks.
//!
//! This avoid the problem of sleeping threads with mimalloc when using rayon in combination with
//! tokio. It also avoid having multiple thread pools.
//! see also https://pwy.io/posts/mimalloc-cigarette/

use crate::{
    scope::scope_and_block,
    util::{good_chunk_size, into_chunks},
};

struct Chunked {
    chunk_size: usize,
    chunk_count: usize,
}

fn get_chunked(len: usize) -> Option<Chunked> {
    if len <= 1 {
        return None;
    }
    let chunk_size = good_chunk_size(len);
    let chunk_count = len.div_ceil(chunk_size);
    if chunk_count <= 1 {
        return None;
    }
    Some(Chunked {
        chunk_size,
        chunk_count,
    })
}

pub fn for_each<'l, T, F>(items: &'l [T], f: F)
where
    T: Sync,
    F: Fn(&'l T) + Send + Sync,
{
    let Some(Chunked {
        chunk_size,
        chunk_count,
    }) = get_chunked(items.len())
    else {
        for item in items {
            f(item);
        }
        return;
    };
    let f = &f;
    let _results = scope_and_block(chunk_count, |scope| {
        for chunk in items.chunks(chunk_size) {
            scope.spawn(move || {
                for item in chunk {
                    f(item);
                }
            })
        }
    });
}

pub fn for_each_owned<T>(items: Vec<T>, f: impl Fn(T) + Send + Sync)
where
    T: Send + Sync,
{
    let Some(Chunked {
        chunk_size,
        chunk_count,
    }) = get_chunked(items.len())
    else {
        for item in items {
            f(item);
        }
        return;
    };
    let f = &f;
    let _results = scope_and_block(chunk_count, |scope| {
        for chunk in into_chunks(items, chunk_size) {
            scope.spawn(move || {
                // SAFETY: Even when f() panics we drop all items in the chunk.
                for item in chunk {
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
    let Some(Chunked {
        chunk_size,
        chunk_count,
    }) = get_chunked(items.len())
    else {
        for item in items {
            f(item)?;
        }
        return Ok(());
    };
    let f = &f;
    scope_and_block(chunk_count, |scope| {
        for chunk in items.chunks(chunk_size) {
            scope.spawn(move || {
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
    let Some(Chunked {
        chunk_size,
        chunk_count,
    }) = get_chunked(items.len())
    else {
        for item in items {
            f(item)?;
        }
        return Ok(());
    };
    let f = &f;
    scope_and_block(chunk_count, |scope| {
        for chunk in items.chunks_mut(chunk_size) {
            scope.spawn(move || {
                for item in chunk {
                    f(item)?;
                }
                Ok(())
            })
        }
    })
    .collect::<Result<(), E>>()
}

pub fn try_for_each_owned<T, E>(
    items: Vec<T>,
    f: impl (Fn(T) -> Result<(), E>) + Send + Sync,
) -> Result<(), E>
where
    T: Send + Sync,
    E: Send + 'static,
{
    let Some(Chunked {
        chunk_size,
        chunk_count,
    }) = get_chunked(items.len())
    else {
        for item in items {
            f(item)?;
        }
        return Ok(());
    };
    let f = &f;
    scope_and_block(chunk_count, |scope| {
        for chunk in into_chunks(items, chunk_size) {
            scope.spawn(move || {
                for item in chunk {
                    f(item)?;
                }
                Ok(())
            })
        }
    })
    .collect::<Result<(), E>>()
}

pub fn map_collect<'l, Item, PerItemResult, Result>(
    items: &'l [Item],
    f: impl Fn(&'l Item) -> PerItemResult + Send + Sync,
) -> Result
where
    Item: Sync,
    PerItemResult: Send + Sync + 'l,
    Result: FromIterator<PerItemResult>,
{
    let Some(Chunked {
        chunk_size,
        chunk_count,
    }) = get_chunked(items.len())
    else {
        return Result::from_iter(items.iter().map(f));
    };
    let f = &f;
    scope_and_block(chunk_count, |scope| {
        for chunk in items.chunks(chunk_size) {
            scope.spawn(move || chunk.iter().map(f).collect::<Vec<_>>())
        }
    })
    .flatten()
    .collect()
}

pub fn map_collect_owned<'l, Item, PerItemResult, Result>(
    items: Vec<Item>,
    f: impl Fn(Item) -> PerItemResult + Send + Sync,
) -> Result
where
    Item: Send + Sync,
    PerItemResult: Send + Sync + 'l,
    Result: FromIterator<PerItemResult>,
{
    let Some(Chunked {
        chunk_size,
        chunk_count,
    }) = get_chunked(items.len())
    else {
        return Result::from_iter(items.into_iter().map(f));
    };
    let f = &f;
    scope_and_block(chunk_count, |scope| {
        for chunk in into_chunks(items, chunk_size) {
            scope.spawn(move || chunk.map(f).collect::<Vec<_>>())
        }
    })
    .flatten()
    .collect()
}

#[cfg(test)]
mod tests {
    use std::{
        panic::{AssertUnwindSafe, catch_unwind},
        sync::atomic::{AtomicI32, Ordering},
    };

    use super::*;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_parallel_for_each() {
        let input = vec![1, 2, 3, 4, 5];
        let sum = AtomicI32::new(0);
        for_each(&input, |&x| {
            sum.fetch_add(x, Ordering::SeqCst);
        });
        assert_eq!(sum.load(Ordering::SeqCst), 15);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
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

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
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

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_parallel_for_each_owned() {
        let input = vec![1, 2, 3, 4, 5];
        let sum = AtomicI32::new(0);
        for_each_owned(input, |x| {
            sum.fetch_add(x, Ordering::SeqCst);
        });
        assert_eq!(sum.load(Ordering::SeqCst), 15);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_parallel_map_collect() {
        let input = vec![1, 2, 3, 4, 5];
        let result: Vec<_> = map_collect(&input, |&x| x * 2);
        assert_eq!(result, vec![2, 4, 6, 8, 10]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_parallel_map_collect_owned() {
        let input = vec![1, 2, 3, 4, 5];
        let result: Vec<_> = map_collect_owned(input, |x| x * 2);
        assert_eq!(result, vec![2, 4, 6, 8, 10]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_parallel_map_collect_owned_many() {
        let input = vec![1; 1000];
        let result: Vec<_> = map_collect_owned(input, |x| x * 2);
        assert_eq!(result, vec![2; 1000]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
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
