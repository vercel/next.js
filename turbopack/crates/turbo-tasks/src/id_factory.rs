use std::{
    any::type_name,
    marker::PhantomData,
    num::NonZeroU64,
    sync::atomic::{AtomicU64, Ordering},
};

use concurrent_queue::ConcurrentQueue;

/// A helper for constructing id types like [`ValueTypeId`][crate::ValueTypeId].
///
/// For ids that may be re-used, see [`IdFactoryWithReuse`].
pub struct IdFactory<T> {
    /// A value starting at 0 and incremented each time a new id is allocated. Regardless of the
    /// underlying type, a u64 is used to cheaply detect overflows.
    counter: AtomicU64,
    /// We've overflowed if the `counter > max_count`.
    max_count: u64,
    id_offset: u64, // added to the value received from `counter`
    _phantom_data: PhantomData<T>,
}

impl<T> IdFactory<T> {
    /// Create a factory for ids in the range `start..=max`.
    pub fn new(start: T, max: T) -> Self
    where
        T: Into<NonZeroU64> + Ord,
    {
        Self::new_const(start.into(), max.into())
    }

    /// Create a factory for ids in the range `start..=max`.
    ///
    /// Provides a less convenient API than [`IdFactory::new`], but skips a type conversion that
    /// would make the function non-const.
    pub const fn new_const(start: NonZeroU64, max: NonZeroU64) -> Self {
        assert!(start.get() < max.get());
        Self {
            // Always start `counter` at 0, don't use the value of `start` because `start` could be
            // close to `u64::MAX`.
            counter: AtomicU64::new(0),
            max_count: max.get() - start.get(),
            id_offset: start.get(),
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
    /// Panics if the id type overflows.
    pub fn get(&self) -> T {
        let count = self.counter.fetch_add(1, Ordering::Relaxed);

        #[cfg(debug_assertions)]
        {
            if count == u64::MAX {
                // u64 counter is about to overflow -- this should never happen! A `u64` counter
                // starting at 0 should take decades to overflow on a single machine.
                //
                // This is unrecoverable because other threads may have already read the overflowed
                // value, so abort the entire process.
                std::process::abort()
            }
        }

        // `max_count` might be something like `u32::MAX`. The extra bits of `u64` are useful to
        // detect overflows in that case. We assume the u64 counter is large enough to never
        // overflow.
        if count > self.max_count {
            panic!(
                "Max id limit (overflow) hit while attempting to generate a unique {}",
                type_name::<T>(),
            )
        }

        let new_id_u64 = count + self.id_offset;
        // Safety:
        // - `count` is assumed not to overflow.
        // - `id_offset` is a non-zero value.
        // - `id_offset + count < u64::MAX`.
        let new_id = unsafe { NonZeroU64::new_unchecked(new_id_u64) };

        match new_id.try_into() {
            Ok(id) => id,
            // With any sane implementation of `TryFrom`, this shouldn't happen, as we've already
            // checked the `max_count` bound. (Could happen with the `new_const` constructor)
            Err(_) => panic!(
                "Failed to convert NonZeroU64 value of {} into {}",
                new_id,
                type_name::<T>()
            ),
        }
    }

    /// Returns an id, potentially allowing an overflow. This may cause ids to be silently re-used.
    /// Used for [`crate::id::ExecutionId`].
    ///
    /// If id re-use is desired only for "freed" ids, use [`IdFactoryWithReuse`] instead.
    pub fn wrapping_get(&self) -> T {
        let count = self.counter.fetch_add(1, Ordering::Relaxed);

        let new_id_u64 = (count % self.max_count) + self.id_offset;
        // Safety:
        // - `id_offset` is a non-zero value.
        // - `id_offset + max_count < u64::MAX`.
        let new_id = unsafe { NonZeroU64::new_unchecked(new_id_u64) };

        match new_id.try_into() {
            Ok(id) => id,
            Err(_) => panic!(
                "Failed to convert NonZeroU64 value of {} into {}",
                new_id,
                type_name::<T>()
            ),
        }
    }
}

/// An [`IdFactory`], but extended with a free list to allow for id reuse.
///
/// If silent untracked re-use of ids is okay, consider using the cheaper
/// [`IdFactory::wrapping_get`] method.
pub struct IdFactoryWithReuse<T> {
    factory: IdFactory<T>,
    free_ids: ConcurrentQueue<T>,
}

impl<T> IdFactoryWithReuse<T>
where
    T: Into<NonZeroU64> + Ord,
{
    /// Create a factory for ids in the range `start..=max`.
    pub fn new(start: T, max: T) -> Self {
        Self {
            factory: IdFactory::new(start, max),
            free_ids: ConcurrentQueue::unbounded(),
        }
    }

    /// Create a factory for ids in the range `start..=max`. Provides a less convenient API than
    /// [`IdFactoryWithReuse::new`], but skips a type conversion that would make the function
    /// non-const.
    pub const fn new_const(start: NonZeroU64, max: NonZeroU64) -> Self {
        Self {
            factory: IdFactory::new_const(start, max),
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
    /// Panics if the id type overflows.
    pub fn get(&self) -> T {
        self.free_ids.pop().unwrap_or_else(|_| self.factory.get())
    }

    /// Add an id to the free list, allowing it to be re-used on a subsequent call to
    /// [`IdFactoryWithReuse::get`].
    ///
    /// # Safety
    ///
    /// The id must no longer be used. Must be a valid id that was previously returned by
    /// [`IdFactoryWithReuse::get`].
    pub unsafe fn reuse(&self, id: T) {
        let _ = self.free_ids.push(id);
    }
}

#[cfg(test)]
mod tests {
    use std::num::NonZeroU8;

    use super::*;

    #[test]
    #[should_panic(expected = "Max id limit (overflow)")]
    fn test_overflow_detection() {
        let factory = IdFactory::new(NonZeroU8::MIN, NonZeroU8::MAX);
        assert_eq!(factory.get(), NonZeroU8::new(1).unwrap());
        assert_eq!(factory.get(), NonZeroU8::new(2).unwrap());
        for _ in 2..256 {
            factory.get();
        }
    }

    #[test]
    #[should_panic(expected = "Max id limit (overflow)")]
    fn test_overflow_detection_near_u64_max() {
        let factory = IdFactory::new(NonZeroU64::try_from(u64::MAX - 5).unwrap(), NonZeroU64::MAX);
        for _ in 0..=6 {
            factory.get();
        }
    }
}
