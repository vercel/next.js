use std::{
    borrow::Borrow,
    fmt::{self, Debug, Formatter},
    ops::{Deref, Range},
    rc::Rc,
};

use memmap2::Mmap;

use crate::{
    compression::decompress_into_rc,
    shared_bytes::{SharedBytes, is_subslice_of},
};

/// The backing storage for an `RcBytes`.
///
/// Uses `Rc` for all refcounting, eliminating atomic operations.
#[derive(Clone)]
enum Backing {
    Rc { _backing: Rc<[u8]> },
    Mmap { _backing: Rc<Mmap> },
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

impl SharedBytes for RcBytes {
    type MmapHandle = Rc<Mmap>;

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

    unsafe fn from_mmap(mmap: &Rc<Mmap>, subslice: &[u8]) -> Self {
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

    fn from_decompressed(uncompressed_length: u32, block: &[u8]) -> anyhow::Result<Self> {
        Ok(RcBytes::from(decompress_into_rc(
            uncompressed_length,
            block,
        )?))
    }
}
