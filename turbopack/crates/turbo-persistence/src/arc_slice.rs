use std::{
    borrow::Borrow,
    fmt::{self, Debug, Formatter},
    hash::{Hash, Hasher},
    io::{self, Read},
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

impl Read for ArcSlice<u8> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let available = &**self;
        let len = std::cmp::min(buf.len(), available.len());
        buf[..len].copy_from_slice(&available[..len]);
        // Advance the slice view
        self.data = &available[len..] as *const [u8];
        Ok(len)
    }
}

impl<T> ArcSlice<T> {
    /// Returns a new `ArcSlice` that points to a slice of the current slice.
    pub fn slice(self, range: Range<usize>) -> ArcSlice<T> {
        let data = &*self;
        let data = &data[range] as *const [T];
        Self {
            data,
            arc: self.arc,
        }
    }

    /// Creates a sub-slice from a slice reference that points into this ArcSlice's backing data.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `subslice` points to memory within this ArcSlice's
    /// backing Arc (not just within the current slice view, but anywhere in the original Arc).
    pub unsafe fn slice_from_subslice(&self, subslice: &[T]) -> ArcSlice<T> {
        Self {
            data: subslice as *const [T],
            arc: self.arc.clone(),
        }
    }
}
