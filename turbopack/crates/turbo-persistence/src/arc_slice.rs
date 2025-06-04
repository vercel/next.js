use std::{
    borrow::Borrow,
    fmt::{self, Debug, Formatter},
    hash::{Hash, Hasher},
    ops::{Deref, Range},
    sync::Arc,
};

/// A owned slice that is backed by an `Arc`.
#[derive(Clone)]
pub struct ArcSlice<T> {
    data: *const [T],
    arc: Arc<[T]>,
}

unsafe impl<T> Send for ArcSlice<T> {}
unsafe impl<T> Sync for ArcSlice<T> {}

impl<T> From<Arc<[T]>> for ArcSlice<T> {
    fn from(arc: Arc<[T]>) -> Self {
        Self {
            data: &*arc as *const [T],
            arc,
        }
    }
}

impl<T> From<Box<[T]>> for ArcSlice<T> {
    fn from(b: Box<[T]>) -> Self {
        Self::from(Arc::from(b))
    }
}

impl<T> Deref for ArcSlice<T> {
    type Target = [T];

    fn deref(&self) -> &Self::Target {
        unsafe { &*self.data }
    }
}

impl<T> Borrow<[T]> for ArcSlice<T> {
    fn borrow(&self) -> &[T] {
        self
    }
}

impl<T: Hash> Hash for ArcSlice<T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.deref().hash(state)
    }
}

impl<T: PartialEq> PartialEq for ArcSlice<T> {
    fn eq(&self, other: &Self) -> bool {
        self.deref().eq(other.deref())
    }
}

impl<T: Debug> Debug for ArcSlice<T> {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        Debug::fmt(&**self, f)
    }
}

impl<T: Eq> Eq for ArcSlice<T> {}

impl<T> ArcSlice<T> {
    /// Creates a new `ArcSlice` from a pointer to a slice and an `Arc`.
    ///
    /// # Safety
    ///
    /// The caller must ensure that the pointer is pointing to a valid slice that is kept alive by
    /// the `Arc`.
    pub unsafe fn new_unchecked(data: *const [T], arc: Arc<[T]>) -> Self {
        Self { data, arc }
    }

    /// Get the backing arc
    pub fn full_arc(this: &ArcSlice<T>) -> Arc<[T]> {
        this.arc.clone()
    }

    /// Returns a new `ArcSlice` that points to a slice of the current slice.
    pub fn slice(self, range: Range<usize>) -> ArcSlice<T> {
        let data = &*self;
        let data = &data[range] as *const [T];
        Self {
            data,
            arc: self.arc,
        }
    }
}
