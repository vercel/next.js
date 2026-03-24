use std::{
    borrow::Borrow,
    fmt::{self, Debug, Formatter},
    hash::{Hash, Hasher},
    io::{self, Read},
    ops::{Deref, Range},
    sync::Arc,
};

use memmap2::Mmap;

/// The backing storage for an `ArcBytes`.
///
/// The inner values are never read directly — they exist solely to keep the
/// backing memory alive while the raw `data` pointer in `ArcBytes` references it.
#[derive(Clone)]
enum Backing<'l> {
    Arc {
        _backing: Arc<[u8]>,
    },
    Mmap {
        _backing: Arc<Mmap>,
    },
    /// A borrowed reference to an `Arc<Mmap>`, avoiding an `Arc::clone` when the
    /// caller only needs short-lived access to the mapped data.
    MmapRef {
        _backing: &'l Arc<Mmap>,
    },
}

/// A byte slice backed by either an `Arc<[u8]>`, a memory-mapped file, or a borrowed
/// reference to a memory-mapped file.
///
/// Most code uses `ArcBytes<'static>` which owns its backing storage.
/// A shorter lifetime is used when the backing is borrowed (e.g. `MmapRef`),
/// and can be promoted to `'static` via [`ArcBytes::into_static`].
#[derive(Clone)]
pub struct ArcBytes<'l> {
    data: *const [u8],
    backing: Backing<'l>,
}

unsafe impl Send for ArcBytes<'_> {}
unsafe impl Sync for ArcBytes<'_> {}

impl From<Arc<[u8]>> for ArcBytes<'_> {
    fn from(arc: Arc<[u8]>) -> Self {
        Self {
            data: &*arc as *const [u8],
            backing: Backing::Arc { _backing: arc },
        }
    }
}

impl From<Box<[u8]>> for ArcBytes<'_> {
    fn from(b: Box<[u8]>) -> Self {
        Self::from(Arc::from(b))
    }
}

impl Deref for ArcBytes<'_> {
    type Target = [u8];

    fn deref(&self) -> &Self::Target {
        unsafe { &*self.data }
    }
}

impl Borrow<[u8]> for ArcBytes<'_> {
    fn borrow(&self) -> &[u8] {
        self
    }
}

impl Hash for ArcBytes<'_> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.deref().hash(state)
    }
}

impl PartialEq for ArcBytes<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.deref().eq(other.deref())
    }
}

impl Debug for ArcBytes<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        Debug::fmt(&**self, f)
    }
}

impl Eq for ArcBytes<'_> {}

impl Read for ArcBytes<'_> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let available = &**self;
        let len = std::cmp::min(buf.len(), available.len());
        buf[..len].copy_from_slice(&available[..len]);
        // Advance the slice view
        self.data = &available[len..] as *const [u8];
        Ok(len)
    }
}

/// Returns `true` if `subslice` lies entirely within `backing`.
fn is_subslice_of(subslice: &[u8], backing: &[u8]) -> bool {
    let backing = backing.as_ptr_range();
    let sub = subslice.as_ptr_range();
    sub.start >= backing.start && sub.end <= backing.end
}

fn backing_as_slice<'a>(backing: &'a Backing<'a>) -> &'a [u8] {
    match backing {
        Backing::Arc { _backing } => _backing,
        Backing::Mmap { _backing } => _backing,
        Backing::MmapRef { _backing } => _backing,
    }
}

impl<'l> ArcBytes<'l> {
    /// Returns a new `ArcBytes` that points to a sub-range of the current slice.
    pub fn slice(self, range: Range<usize>) -> ArcBytes<'l> {
        let data = &*self;
        let data = &data[range] as *const [u8];
        Self {
            data,
            backing: self.backing,
        }
    }

    /// Creates a sub-slice from a slice reference that points into this ArcBytes' backing data.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `subslice` points to memory within this ArcBytes'
    /// backing storage (not just within the current slice view, but anywhere in the original
    /// backing data).
    pub unsafe fn slice_from_subslice(&self, subslice: &[u8]) -> ArcBytes<'l> {
        debug_assert!(
            is_subslice_of(subslice, backing_as_slice(&self.backing)),
            "slice_from_subslice: subslice is not within the backing storage"
        );
        Self {
            data: subslice as *const [u8],
            backing: self.backing.clone(),
        }
    }

    /// Converts this `ArcBytes` into one with a `'static` lifetime.
    ///
    /// For `Arc` and `Mmap` backings this is a no-op. For `MmapRef` backings this
    /// clones the inner `Arc<Mmap>` to produce an owned backing.
    pub fn into_static(self) -> ArcBytes<'static> {
        ArcBytes {
            data: self.data,
            backing: match self.backing {
                Backing::Arc { _backing } => Backing::Arc { _backing },
                Backing::Mmap { _backing } => Backing::Mmap { _backing },
                Backing::MmapRef { _backing } => Backing::Mmap {
                    _backing: _backing.clone(),
                },
            },
        }
    }

    /// Returns `true` if this `ArcBytes` is backed by a memory-mapped file.
    pub fn is_mmap_backed(&self) -> bool {
        matches!(self.backing, Backing::Mmap { .. } | Backing::MmapRef { .. })
    }

    /// Creates an `ArcBytes` backed by a memory-mapped file.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `subslice` points to memory within the given `mmap`.
    pub unsafe fn from_mmap(mmap: Arc<Mmap>, subslice: &[u8]) -> ArcBytes<'static> {
        debug_assert!(
            is_subslice_of(subslice, &mmap),
            "from_mmap: subslice is not within the mmap"
        );
        ArcBytes {
            data: subslice as *const [u8],
            backing: Backing::Mmap { _backing: mmap },
        }
    }

    /// Creates an `ArcBytes` that borrows a reference to an `Arc<Mmap>`, avoiding an
    /// `Arc::clone`. The returned `ArcBytes` is only valid for the lifetime of the reference.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `subslice` points to memory within the given `mmap`.
    pub unsafe fn from_mmap_ref(mmap: &'l Arc<Mmap>, subslice: &[u8]) -> ArcBytes<'l> {
        debug_assert!(
            is_subslice_of(subslice, mmap),
            "from_mmap_ref: subslice is not within the mmap"
        );
        ArcBytes {
            data: subslice as *const [u8],
            backing: Backing::MmapRef { _backing: mmap },
        }
    }
}
