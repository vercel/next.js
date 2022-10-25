use std::{
    marker::PhantomData,
    ops::Deref,
    sync::atomic::{AtomicUsize, Ordering},
};

pub struct IdFactory<T> {
    next_id: AtomicUsize,
    // TODO
    // free_ids: AtomicPtr<...>
    phantom_data: PhantomData<T>,
}

impl<T: From<usize> + Deref<Target = usize>> Default for IdFactory<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T: From<usize> + Deref<Target = usize>> IdFactory<T> {
    pub const fn new() -> Self {
        Self {
            next_id: AtomicUsize::new(1),
            phantom_data: PhantomData,
        }
    }

    pub fn get(&self) -> T {
        self.next_id.fetch_add(1, Ordering::Relaxed).into()
    }

    /// # Safety
    ///
    /// It must be ensured that the id is no longer used
    pub unsafe fn reuse(&self, _id: T) {
        // TODO
    }
}
