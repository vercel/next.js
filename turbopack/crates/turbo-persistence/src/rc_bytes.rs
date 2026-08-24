use std::{
    borrow::Borrow,
    fmt::{self, Debug, Formatter},
    hash::{Hash, Hasher},
    ops::{Deref, Range},
    rc::Rc,
};

use memmap2::Mmap;

use crate::{
    compression::decompress_into_rc,
    shared_bytes::{INLINE_CAPACITY, SharedBytes, is_subslice_of},
};

/// The representation of an `RcBytes`.
///
/// Mirrors [`ArcBytes`][crate::ArcBytes]: the ref-counted variants keep their backing alive while
/// `data` points into it, and `Inline` owns its bytes so it carries no pointer to dangle on a move.
#[derive(Clone)]
enum Repr {
    Rc {
        data: *const [u8],
        _backing: Rc<[u8]>,
    },
    Mmap {
        data: *const [u8],
        _backing: Rc<Mmap>,
    },
    /// Bytes stored in place, for slices up to [`INLINE_CAPACITY`].
    Inline { buf: [u8; INLINE_CAPACITY], len: u8 },
}

/// An owned byte slice backed by an `Rc<[u8]>`, a memory-mapped file, or an inline buffer.
///
/// Identical to `ArcBytes` but uses `Rc` instead of `Arc`, eliminating atomic
/// refcount overhead. Use this in single-threaded contexts like SST iteration
/// during compaction.
#[derive(Clone)]
pub struct RcBytes {
    repr: Repr,
}

impl RcBytes {
    /// The ref-counted bytes this slice points into, or `None` when stored inline.
    #[inline]
    fn backing_bytes(&self) -> Option<&[u8]> {
        match &self.repr {
            Repr::Rc { _backing, .. } => Some(_backing),
            Repr::Mmap { _backing, .. } => Some(_backing),
            Repr::Inline { .. } => None,
        }
    }
}

impl From<Rc<[u8]>> for RcBytes {
    fn from(rc: Rc<[u8]>) -> Self {
        Self {
            repr: Repr::Rc {
                data: &*rc as *const [u8],
                _backing: rc,
            },
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
        match &self.repr {
            // SAFETY: `data` points into the backing held by the same variant, which keeps it
            // alive for as long as `self`.
            Repr::Rc { data, .. } | Repr::Mmap { data, .. } => unsafe { &**data },
            // Borrowed from `self`, so this is recomputed after a move rather than stored.
            Repr::Inline { buf, len } => &buf[..*len as usize],
        }
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

impl Hash for RcBytes {
    fn hash<H: Hasher>(&self, state: &mut H) {
        Hash::hash(self.deref(), state);
    }
}

impl SharedBytes for RcBytes {
    type MmapHandle = Rc<Mmap>;

    fn slice(self, range: Range<usize>) -> Self {
        let sliced = &self[range];
        // Inline bytes have no backing to carry over, so re-inline the sub-range.
        if let Repr::Inline { .. } = self.repr {
            return Self::from_inline(sliced);
        }
        let data = sliced as *const [u8];
        Self {
            repr: match self.repr {
                Repr::Rc { _backing, .. } => Repr::Rc { data, _backing },
                Repr::Mmap { _backing, .. } => Repr::Mmap { data, _backing },
                Repr::Inline { .. } => unreachable!("handled above"),
            },
        }
    }

    unsafe fn slice_from_subslice(&self, subslice: &[u8]) -> Self {
        // Mirrors `ArcBytes`: short slices are copied so the result owns its bytes. The refcount
        // saved here is non-atomic and therefore cheap, but keeping the two types identical means
        // the lookup and iteration paths cannot disagree about what a returned value borrows.
        if subslice.len() <= INLINE_CAPACITY {
            return Self::from_inline(subslice);
        }
        debug_assert!(
            self.backing_bytes()
                .is_some_and(|backing| is_subslice_of(subslice, backing)),
            "slice_from_subslice: subslice is not within the backing storage"
        );
        let data = subslice as *const [u8];
        Self {
            repr: match &self.repr {
                Repr::Rc { _backing, .. } => Repr::Rc {
                    data,
                    _backing: _backing.clone(),
                },
                Repr::Mmap { _backing, .. } => Repr::Mmap {
                    data,
                    _backing: _backing.clone(),
                },
                // Unreachable for a well-formed caller: an inline slice is at most
                // INLINE_CAPACITY, so it took the branch above.
                Repr::Inline { .. } => return Self::from_inline(subslice),
            },
        }
    }

    unsafe fn from_mmap(mmap: &Rc<Mmap>, subslice: &[u8]) -> Self {
        debug_assert!(
            is_subslice_of(subslice, mmap),
            "from_mmap: subslice is not within the mmap"
        );
        RcBytes {
            repr: Repr::Mmap {
                data: subslice as *const [u8],
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

    #[inline]
    fn from_inline(bytes: &[u8]) -> Self {
        assert!(
            bytes.len() <= INLINE_CAPACITY,
            "{} bytes exceeds the {INLINE_CAPACITY} byte inline capacity",
            bytes.len()
        );
        let mut buf = [0u8; INLINE_CAPACITY];
        buf[..bytes.len()].copy_from_slice(bytes);
        RcBytes {
            repr: Repr::Inline {
                buf,
                len: bytes.len() as u8,
            },
        }
    }
}
