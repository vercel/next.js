use turbo_persistence::ParallelScheduler;
use turbo_tasks::{
    parallel::{self, without_block_in_place},
    scope_bounded::scope_bounded,
};

/// Runs turbo-persistence's parallel work on the tokio runtime through [`turbo_tasks::parallel`].
///
/// Every call is wrapped in [`without_block_in_place`]: the calling thread drains the shared work
/// queue itself and then waits by parking, rather than handing its worker off to tokio's blocking
/// pool. Persistence fans out from many small parallel sections, often nested (e.g. per-family
/// jobs that write SST files). With `block_in_place` every wait could leave behind another idle
/// blocking-pool thread, each with its own allocator heap that stays resident until tokio's
/// keep-alive expires.
#[derive(Clone, Copy, Default)]
pub struct TurboTasksParallelScheduler;

impl ParallelScheduler for TurboTasksParallelScheduler {
    fn parallelism(&self) -> usize {
        // Same fallback as `turbo_tasks::util::good_chunk_size` when the parallelism is unknown.
        parallel::available_parallelism().map_or(4, |count| count.get())
    }

    fn parallel_for_each<T>(&self, items: &[T], f: impl Fn(&T) + Send + Sync)
    where
        T: Sync,
    {
        without_block_in_place(|| parallel::for_each(items, f));
    }

    fn try_parallel_for_each<'l, T, E>(
        &self,
        items: &'l [T],
        f: impl (Fn(&'l T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Sync,
        E: Send + 'static,
    {
        without_block_in_place(|| parallel::try_for_each(items, f))
    }

    fn try_parallel_for_each_mut<'l, T, E>(
        &self,
        items: &'l mut [T],
        f: impl (Fn(&'l mut T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Send + Sync,
        E: Send + 'static,
    {
        without_block_in_place(|| parallel::try_for_each_mut(items, f))
    }

    fn try_parallel_for_each_task_mut<T, E>(
        &self,
        items: &mut [T],
        f: impl (Fn(&mut T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Send + Sync,
        E: Send + 'static,
    {
        // The items are already chunked by the caller, so spawn one job per item instead of
        // regrouping them with `parallel::try_for_each_mut`'s chunking heuristic.
        match items {
            [] => Ok(()),
            [item] => without_block_in_place(|| f(item)),
            items => {
                let f = &f;
                without_block_in_place(|| {
                    scope_bounded(items.len(), |scope| {
                        for item in items.iter_mut() {
                            scope.spawn(move || f(item));
                        }
                    })
                    .collect::<Result<(), E>>()
                })
            }
        }
    }

    fn try_parallel_for_each_owned<T, E>(
        &self,
        items: Vec<T>,
        f: impl (Fn(T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Send + Sync,
        E: Send + 'static,
    {
        without_block_in_place(|| parallel::try_for_each_owned(items, f))
    }

    fn parallel_map_collect<'l, T, I, R>(
        &self,
        items: &'l [T],
        f: impl Fn(&'l T) -> I + Send + Sync,
    ) -> R
    where
        T: Sync,
        I: Send + Sync + 'l,
        R: FromIterator<I>,
    {
        without_block_in_place(|| parallel::map_collect(items, f))
    }

    fn parallel_map_collect_owned<T, I, R>(
        &self,
        items: Vec<T>,
        f: impl Fn(T) -> I + Send + Sync,
    ) -> R
    where
        T: Send + Sync,
        I: Send + Sync,
        R: FromIterator<I>,
    {
        without_block_in_place(|| parallel::map_collect_owned(items, f))
    }
}
