use turbo_persistence::ParallelScheduler;
use turbo_tasks::{block_in_place, parallel, scope_bounded::scope_bounded};

#[derive(Clone, Copy, Default)]
pub struct TurboTasksParallelScheduler;

impl ParallelScheduler for TurboTasksParallelScheduler {
    fn block_in_place<R>(&self, f: impl FnOnce() -> R + Send) -> R
    where
        R: Send,
    {
        block_in_place(f)
    }

    fn parallel_for_each<T>(&self, items: &[T], f: impl Fn(&T) + Send + Sync)
    where
        T: Sync,
    {
        parallel::for_each(items, f);
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
        parallel::try_for_each(items, f)
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
        parallel::try_for_each_mut(items, f)
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
            [item] => f(item),
            items => {
                let f = &f;
                scope_bounded(items.len(), |scope| {
                    for item in items.iter_mut() {
                        scope.spawn(move || f(item));
                    }
                })
                .collect::<Result<(), E>>()
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
        parallel::try_for_each_owned(items, f)
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
        parallel::map_collect(items, f)
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
        parallel::map_collect_owned(items, f)
    }
}
