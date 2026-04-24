use std::{cell::UnsafeCell, ops::Deref, sync::Once};

pub struct LazySortedVec<T> {
    vec: UnsafeCell<Vec<T>>,
    once: Once,
}

unsafe impl<T> Send for LazySortedVec<T> where T: Send {}
unsafe impl<T> Sync for LazySortedVec<T> where T: Sync {}

impl<T> LazySortedVec<T> {
    pub fn new() -> Self {
        Self {
            vec: UnsafeCell::new(Vec::new()),
            once: Once::new(),
        }
    }

    pub fn push(&mut self, value: T) {
        self.once = Once::new();
        self.vec.get_mut().push(value);
    }

    pub fn retain_unordered(&mut self, f: impl FnMut(&T) -> bool) {
        self.vec.get_mut().retain(f);
    }

    pub fn iter_mut_unordered(&mut self) -> std::slice::IterMut<'_, T> {
        self.vec.get_mut().iter_mut()
    }
}

impl<T: Ord> Deref for LazySortedVec<T> {
    type Target = Vec<T>;

    fn deref(&self) -> &Self::Target {
        let ptr = self.vec.get();
        self.once.call_once(|| {
            // SAFETY: The only access to the `vec` is through this `Deref` implementation, or we
            // have a `&mut self` which prevents a simultaneous `Deref`. So we can guarantee that
            // there are no other accesses to the `vec` while we sort it.
            unsafe { &mut *ptr }.sort()
        });
        // SAFETY: Returning this reference is safe because the lifetime guarantees that there is no
        // `&mut self` that could cause a simultaneous access to the `vec`, and the `Once`
        // guarantees that the sorting is complete before we return the reference.
        unsafe { &*ptr }
    }
}

impl<T> Default for LazySortedVec<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> From<Vec<T>> for LazySortedVec<T> {
    fn from(vec: Vec<T>) -> Self {
        Self {
            vec: UnsafeCell::new(vec),
            once: Once::new(),
        }
    }
}
