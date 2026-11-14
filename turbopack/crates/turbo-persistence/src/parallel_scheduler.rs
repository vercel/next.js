/// Runs turbo-persistence's CPU-parallel work.
///
/// Every method except [`ParallelScheduler::spawn_blocking`] blocks until all of its work has
/// finished, and may run the work on the calling thread. If an implementation needs to block an
/// async runtime thread while waiting (e.g. tokio's `block_in_place`), it handles that internally;
/// callers don't wrap work in a separate hand-off.
pub trait ParallelScheduler: Clone + Sync + Send {
    /// The number of tasks this scheduler can run at the same time. Always at least 1.
    fn parallelism(&self) -> usize;

    /// Runs `f` in the background on a thread that may block (e.g. on file I/O), without waiting
    /// for it to finish.
    ///
    /// Used for best-effort background work such as eagerly opening SST files. `f` handles its own
    /// errors, and the caller never joins it. Implementations may run `f` on the calling thread
    /// when they have no background thread to use.
    fn spawn_blocking(&self, f: impl FnOnce() + Send + 'static);

    fn parallel_for_each<T>(&self, items: &[T], f: impl Fn(&T) + Send + Sync)
    where
        T: Sync;

    fn try_parallel_for_each<'l, T, E>(
        &self,
        items: &'l [T],
        f: impl (Fn(&'l T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Sync,
        E: Send + 'static;

    fn try_parallel_for_each_mut<'l, T, E>(
        &self,
        items: &'l mut [T],
        f: impl (Fn(&'l mut T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Send + Sync,
        E: Send + 'static;

    /// Like [`ParallelScheduler::try_parallel_for_each_mut`], but `items` are already chunked by
    /// the caller: every item runs as its own task, and implementations must not group items
    /// into larger chunks.
    fn try_parallel_for_each_task_mut<T, E>(
        &self,
        items: &mut [T],
        f: impl (Fn(&mut T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Send + Sync,
        E: Send + 'static;

    fn try_parallel_for_each_owned<T, E>(
        &self,
        items: Vec<T>,
        f: impl (Fn(T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Send + Sync,
        E: Send + 'static;

    fn parallel_map_collect<'l, Item, PerItemResult, Result>(
        &self,
        items: &'l [Item],
        f: impl Fn(&'l Item) -> PerItemResult + Send + Sync,
    ) -> Result
    where
        Item: Sync,
        PerItemResult: Send + Sync + 'l,
        Result: FromIterator<PerItemResult>;

    fn parallel_map_collect_owned<Item, PerItemResult, Result>(
        &self,
        items: Vec<Item>,
        f: impl Fn(Item) -> PerItemResult + Send + Sync,
    ) -> Result
    where
        Item: Send + Sync,
        PerItemResult: Send + Sync,
        Result: FromIterator<PerItemResult>;
}

#[derive(Clone, Copy, Default)]
pub struct SerialScheduler;

impl ParallelScheduler for SerialScheduler {
    fn parallelism(&self) -> usize {
        1
    }

    /// Runs `f` on a new thread.
    ///
    /// Under Miri `f` runs on the calling thread: Miri reports a process that exits while a
    /// detached thread is still running.
    fn spawn_blocking(&self, f: impl FnOnce() + Send + 'static) {
        #[cfg(miri)]
        f();
        #[cfg(not(miri))]
        if let Err(error) = std::thread::Builder::new()
            .name("turbo-persistence background".into())
            .spawn(f)
        {
            // `spawn` dropped `f` without running it. Work spawned here is best-effort (e.g. an
            // eagerly opened SST is opened lazily instead), so skipping it is fine.
            eprintln!("turbo-persistence: failed to spawn a background thread: {error}");
        }
    }

    fn parallel_for_each<T>(&self, items: &[T], f: impl Fn(&T) + Send + Sync)
    where
        T: Sync,
    {
        for item in items {
            f(item);
        }
    }

    fn try_parallel_for_each<'l, T, E>(
        &self,
        items: &'l [T],
        f: impl (Fn(&'l T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Sync,
        E: Send,
    {
        for item in items {
            f(item)?;
        }
        Ok(())
    }

    fn try_parallel_for_each_mut<'l, T, E>(
        &self,
        items: &'l mut [T],
        f: impl (Fn(&'l mut T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Sync,
        E: Send,
    {
        for item in items {
            f(item)?;
        }
        Ok(())
    }

    fn try_parallel_for_each_task_mut<T, E>(
        &self,
        items: &mut [T],
        f: impl (Fn(&mut T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Send + Sync,
        E: Send,
    {
        for item in items {
            f(item)?;
        }
        Ok(())
    }

    fn try_parallel_for_each_owned<T, E>(
        &self,
        items: Vec<T>,
        f: impl (Fn(T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Sync,
        E: Send,
    {
        for item in items {
            f(item)?;
        }
        Ok(())
    }

    fn parallel_map_collect<'l, Item, PerItemResult, Result>(
        &self,
        items: &'l [Item],
        f: impl Fn(&'l Item) -> PerItemResult + Send + Sync,
    ) -> Result
    where
        Item: Sync,
        PerItemResult: Send + Sync + 'l,
        Result: FromIterator<PerItemResult>,
    {
        items.iter().map(f).collect()
    }

    fn parallel_map_collect_owned<Item, PerItemResult, Result>(
        &self,
        items: Vec<Item>,
        f: impl Fn(Item) -> PerItemResult + Send + Sync,
    ) -> Result
    where
        Item: Send + Sync,
        PerItemResult: Send + Sync,
        Result: FromIterator<PerItemResult>,
    {
        items.into_iter().map(f).collect()
    }
}
