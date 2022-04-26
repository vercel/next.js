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

impl<T: From<usize> + Deref<Target = usize>> IdFactory<T> {
    pub fn new() -> Self {
        Self {
            next_id: AtomicUsize::new(1),
            phantom_data: PhantomData,
        }
    }

    pub fn get(&self) -> T {
        self.next_id.fetch_add(1, Ordering::Relaxed).into()
    }

    pub fn reuse(&self, id: T) {
        // TODO
    }
}
