use std::{
    any::type_name,
    marker::PhantomData,
    num::NonZeroU64,
    sync::atomic::{AtomicU64, Ordering},
};

use concurrent_queue::ConcurrentQueue;

/// A helper for constructing id types like [`FunctionId`][crate::FunctionId].
///
/// For ids that may be re-used, see [`IdFactoryWithReuse`].
pub struct IdFactory<T> {
    next_id: AtomicU64,
    max_id: u64,
    _phantom_data: PhantomData<T>,
}

impl<T> IdFactory<T> {
    pub const fn new(start: u64, max: u64) -> Self {
        Self {
            next_id: AtomicU64::new(start),
            max_id: max,
            _phantom_data: PhantomData,
        }
    }
}

impl<T> IdFactory<T>
where
    T: TryFrom<NonZeroU64>,
{
    /// Return a unique new id.
    ///
    /// Panics (best-effort) if the id type overflows.
    pub fn get(&self) -> T {
        let new_id = self.next_id.fetch_add(1, Ordering::Relaxed);

        if new_id > self.max_id {
            panic!(
                "Max id limit hit while attempting to generate a unique {}",
                type_name::<T>(),
            )
        }

        // Safety: u64 will not overflow. This is *very* unlikely to happen (would take
        // decades).
        let new_id = unsafe { NonZeroU64::new_unchecked(new_id) };

        // Use the extra bits of the AtomicU64 as cheap overflow detection when the
        // value is less than 64 bits.
        match new_id.try_into() {
            Ok(id) => id,
            Err(_) => panic!(
                "Overflow detected while attempting to generate a unique {}",
                type_name::<T>(),
            ),
        }
    }
}

/// An [`IdFactory`], but extended with a free list to allow for id reuse for
/// ids such as [`BackendJobId`][crate::backend::BackendJobId].
pub struct IdFactoryWithReuse<T> {
    factory: IdFactory<T>,
    free_ids: ConcurrentQueue<T>,
}

impl<T> IdFactoryWithReuse<T> {
    pub const fn new(start: u64, max: u64) -> Self {
        Self {
            factory: IdFactory::new(start, max),
            free_ids: ConcurrentQueue::unbounded(),
        }
    }
}

impl<T> IdFactoryWithReuse<T>
where
    T: TryFrom<NonZeroU64>,
{
    /// Return a new or potentially reused id.
    ///
    /// Panics (best-effort) if the id type overflows.
    pub fn get(&self) -> T {
        self.free_ids.pop().unwrap_or_else(|_| self.factory.get())
    }

    /// Add an id to the free list, allowing it to be re-used on a subsequent
    /// call to [`IdFactoryWithReuse::get`].
    ///
    /// # Safety
    ///
    /// It must be ensured that the id is no longer used. Id must be a valid id
    /// that was previously returned by `get`.
    pub unsafe fn reuse(&self, id: T) {
        let _ = self.free_ids.push(id);
    }
}

#[cfg(test)]
mod tests {
    use std::num::NonZeroU8;

    use super::*;

    #[test]
    #[should_panic(expected = "Overflow detected")]
    fn test_overflow() {
        let factory = IdFactory::<NonZeroU8>::new(1, u16::MAX as u64);
        assert_eq!(factory.get(), NonZeroU8::new(1).unwrap());
        assert_eq!(factory.get(), NonZeroU8::new(2).unwrap());
        for _i in 2..256 {
            factory.get();
        }
    }
}
