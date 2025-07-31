pub trait ParallelScheduler: Clone + Sync + Send {
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

    fn try_into_parallel_for_each<T, E>(
        &self,
        items: Vec<T>,
        f: impl (Fn(T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Send + Sync,
        E: Send + 'static;

    fn parallel_map_collect<'l, T, I, R>(
        &self,
        items: &'l [T],
        f: impl Fn(&'l T) -> I + Send + Sync,
    ) -> R
    where
        T: Sync,
        I: Send + Sync,
        R: FromIterator<I>;

    fn into_parallel_map_collect<T, I, R>(
        &self,
        items: Vec<T>,
        f: impl Fn(T) -> I + Send + Sync,
    ) -> R
    where
        T: Send + Sync,
        I: Send + Sync,
        R: FromIterator<I>;
}

#[derive(Clone, Copy, Default)]
pub struct SerialScheduler;

impl ParallelScheduler for SerialScheduler {
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

    fn try_into_parallel_for_each<T, E>(
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

    fn parallel_map_collect<'l, T, I, R>(
        &self,
        items: &'l [T],
        f: impl Fn(&'l T) -> I + Send + Sync,
    ) -> R
    where
        T: Sync,
        I: Send + Sync,
        R: FromIterator<I>,
    {
        items.iter().map(f).collect()
    }

    fn into_parallel_map_collect<T, I, R>(
        &self,
        items: Vec<T>,
        f: impl Fn(T) -> I + Send + Sync,
    ) -> R
    where
        T: Send + Sync,
        I: Send + Sync,
        R: FromIterator<I>,
    {
        items.into_iter().map(f).collect()
    }
}
