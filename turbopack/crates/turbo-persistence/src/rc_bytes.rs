use std::{
    borrow::Borrow,
    fmt::{self, Debug, Formatter},
    ops::{Deref, Range},
    rc::Rc,
    sync::Arc,
};

use memmap2::Mmap;

/// The backing storage for an `RcBytes`.
///
/// Uses `Rc` for all refcounting, eliminating atomic operations. The mmap
/// variant wraps `Arc<Mmap>` in an `Rc` so that cloning the backing only
/// bumps the `Rc` counter (one plain integer increment), not the `Arc`
/// counter.
#[derive(Clone)]
enum Backing {
    Rc {
        _backing: Rc<[u8]>,
    },
    /// The `Arc<Mmap>` is cloned once when the `Rc` is first created; all
    /// subsequent `Backing::clone()` calls only increment the outer `Rc`.
    Mmap {
        _backing: Rc<Arc<Mmap>>,
    },
}

/// An owned byte slice backed by either an `Rc<[u8]>` or a memory-mapped file.
///
/// Identical to `ArcBytes` but uses `Rc` instead of `Arc`, eliminating atomic
/// refcount overhead. Use this in single-threaded contexts like SST iteration
/// during compaction.
#[derive(Clone)]
pub struct RcBytes {
    data: *const [u8],
    backing: Backing,
}

impl From<Rc<[u8]>> for RcBytes {
    fn from(rc: Rc<[u8]>) -> Self {
        Self {
            data: &*rc as *const [u8],
            backing: Backing::Rc { _backing: rc },
        }
    }
}

impl From<Box<[u8]>> for RcBytes {
    fn from(b: Box<[u8]>) -> Self {
        Self::from(Rc::from(b))
    }
}

impl Deref for RcBytes {
    type Target = [u8];

    fn deref(&self) -> &Self::Target {
        unsafe { &*self.data }
    }
}

impl Borrow<[u8]> for RcBytes {
    fn borrow(&self) -> &[u8] {
        self
    }
}

impl PartialEq for RcBytes {
    fn eq(&self, other: &Self) -> bool {
        self.deref().eq(other.deref())
    }
}

impl Debug for RcBytes {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        Debug::fmt(&**self, f)
    }
}

impl Eq for RcBytes {}

/// Returns `true` if `subslice` lies entirely within `backing`.
fn is_subslice_of(subslice: &[u8], backing: &[u8]) -> bool {
    let backing = backing.as_ptr_range();
    let sub = subslice.as_ptr_range();
    sub.start >= backing.start && sub.end <= backing.end
}

impl RcBytes {
    /// Returns a new `RcBytes` that points to a sub-range of the current slice.
    pub fn slice(self, range: Range<usize>) -> RcBytes {
        let data = &*self;
        let data = &data[range] as *const [u8];
        Self {
            data,
            backing: self.backing,
        }
    }

    /// Creates a sub-slice from a slice reference that points into this RcBytes' backing data.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `subslice` points to memory within this RcBytes'
    /// backing storage.
    pub unsafe fn slice_from_subslice(&self, subslice: &[u8]) -> RcBytes {
        debug_assert!(
            is_subslice_of(
                subslice,
                match &self.backing {
                    Backing::Rc { _backing } => _backing,
                    Backing::Mmap { _backing } => _backing,
                }
            ),
            "slice_from_subslice: subslice is not within the backing storage"
        );
        Self {
            data: subslice as *const [u8],
            backing: self.backing.clone(),
        }
    }

    /// Creates an `RcBytes` backed by a memory-mapped file.
    ///
    /// The `Arc<Mmap>` is wrapped in an `Rc` so that subsequent clone/drop
    /// operations are non-atomic.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `subslice` points to memory within the given `mmap`.
    pub unsafe fn from_mmap(mmap: &Rc<Arc<Mmap>>, subslice: &[u8]) -> RcBytes {
        debug_assert!(
            is_subslice_of(subslice, mmap),
            "from_mmap: subslice is not within the mmap"
        );
        RcBytes {
            data: subslice as *const [u8],
            backing: Backing::Mmap {
                _backing: mmap.clone(),
            },
        }
    }
}
