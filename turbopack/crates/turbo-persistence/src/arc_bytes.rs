use std::{
    borrow::Borrow,
    fmt::{self, Debug, Formatter},
    hash::{Hash, Hasher},
    ops::{Deref, Range},
    sync::Arc,
};

use memmap2::Mmap;

use crate::{
    compression::decompress_into_arc,
    shared_bytes::{SharedBytes, is_subslice_of},
};
/// The backing storage for an `ArcBytes`.
///
/// The inner values are never read directly — they exist solely to keep the
/// backing memory alive while the raw `data` pointer in `ArcBytes` references it.
#[derive(Clone)]
enum Backing {
    Arc { _backing: Arc<[u8]> },
    Mmap { _backing: Arc<Mmap> },
}

/// An owned byte slice backed by either an `Arc<[u8]>` or a memory-mapped file.
#[derive(Clone)]
pub struct ArcBytes {
    data: *const [u8],
    // Safety: Backing should come last so that it is dropped after the data pointer so we don't
    // create a dangling pointer.  This isn't really a problem since it is technically ok to have
    // dangling _pointers_.
    backing: Backing,
}

unsafe impl Send for ArcBytes {}
unsafe impl Sync for ArcBytes {}

impl From<Arc<[u8]>> for ArcBytes {
    fn from(arc: Arc<[u8]>) -> Self {
        Self {
            data: &*arc as *const [u8],
            backing: Backing::Arc { _backing: arc },
        }
    }
}

impl From<Box<[u8]>> for ArcBytes {
    fn from(b: Box<[u8]>) -> Self {
        Self::from(Arc::from(b))
    }
}

impl Deref for ArcBytes {
    type Target = [u8];

    fn deref(&self) -> &Self::Target {
        unsafe { &*self.data }
    }
}

impl Borrow<[u8]> for ArcBytes {
    fn borrow(&self) -> &[u8] {
        self
    }
}

impl Hash for ArcBytes {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.deref().hash(state)
    }
}

impl PartialEq for ArcBytes {
    fn eq(&self, other: &Self) -> bool {
        self.deref().eq(other.deref())
    }
}

impl Debug for ArcBytes {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        Debug::fmt(&**self, f)
    }
}

impl Eq for ArcBytes {}

impl ArcBytes {
    /// Returns `true` if this `ArcBytes` is backed by a memory-mapped file.
    pub fn is_mmap_backed(&self) -> bool {
        matches!(self.backing, Backing::Mmap { .. })
    }

    /// Returns `true` if the backing `Arc` allocation is shared (i.e., there
    /// are other `Arc` clones referencing the same data outside the cache).
    /// Always returns `false` for mmap-backed bytes, since the mmap `Arc` is
    /// shared across all slices from the same file and is not a useful signal.
    pub fn is_shared_arc(&self) -> bool {
        match &self.backing {
            Backing::Arc { _backing } => Arc::strong_count(_backing) > 1,
            Backing::Mmap { .. } => false,
        }
    }
}

impl SharedBytes for ArcBytes {
    type MmapHandle = Arc<Mmap>;

    fn slice(self, range: Range<usize>) -> Self {
        let data = &*self;
        let data = &data[range] as *const [u8];
        Self {
            data,
            backing: self.backing,
        }
    }

    unsafe fn slice_from_subslice(&self, subslice: &[u8]) -> Self {
        debug_assert!(
            is_subslice_of(
                subslice,
                match &self.backing {
                    Backing::Arc { _backing } => _backing,
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

    unsafe fn from_mmap(mmap: &Arc<Mmap>, subslice: &[u8]) -> Self {
        debug_assert!(
            is_subslice_of(subslice, mmap),
            "from_mmap: subslice is not within the mmap"
        );
        ArcBytes {
            data: subslice as *const [u8],
            backing: Backing::Mmap {
                _backing: mmap.clone(),
            },
        }
    }

    fn from_decompressed(uncompressed_length: u32, block: &[u8]) -> anyhow::Result<Self> {
        Ok(ArcBytes::from(decompress_into_arc(
            uncompressed_length,
            block,
        )?))
    }
}
