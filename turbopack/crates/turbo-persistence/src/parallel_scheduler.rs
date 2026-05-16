pub trait ParallelScheduler: Clone + Sync + Send {
    fn block_in_place<R>(&self, f: impl FnOnce() -> R + Send) -> R
    where
        R: Send;

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
    fn block_in_place<R>(&self, f: impl FnOnce() -> R + Send) -> R
    where
        R: Send,
    {
        f()
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
