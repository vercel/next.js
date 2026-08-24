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
    shared_bytes::{INLINE_CAPACITY, SharedBytes, is_subslice_of},
};
/// The representation of an `ArcBytes`.
///
/// For the ref-counted variants the handle is never read directly — it exists solely to keep the
/// backing memory alive while `data` points into it. `Inline` instead owns its bytes, so it has no
/// `data` pointer: one would dangle as soon as the value moved.
#[derive(Clone)]
enum Repr {
    Arc {
        data: *const [u8],
        _backing: Arc<[u8]>,
    },
    Mmap {
        data: *const [u8],
        _backing: Arc<Mmap>,
    },
    /// Bytes stored in place, for slices up to [`INLINE_CAPACITY`].
    Inline { buf: [u8; INLINE_CAPACITY], len: u8 },
}

/// An owned byte slice backed by an `Arc<[u8]>`, a memory-mapped file, or — for short slices — an
/// inline buffer that avoids touching a refcount at all.
#[derive(Clone)]
pub struct ArcBytes {
    repr: Repr,
}

impl ArcBytes {
    /// The ref-counted bytes this slice points into, or `None` when stored inline.
    #[inline]
    fn backing_bytes(&self) -> Option<&[u8]> {
        match &self.repr {
            Repr::Arc { _backing, .. } => Some(_backing),
            Repr::Mmap { _backing, .. } => Some(_backing),
            Repr::Inline { .. } => None,
        }
    }
}

unsafe impl Send for ArcBytes {}
unsafe impl Sync for ArcBytes {}

impl From<Arc<[u8]>> for ArcBytes {
    fn from(arc: Arc<[u8]>) -> Self {
        Self {
            repr: Repr::Arc {
                data: &*arc as *const [u8],
                _backing: arc,
            },
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
        match &self.repr {
            // SAFETY: `data` points into the backing held by the same variant, which keeps it
            // alive for as long as `self`.
            Repr::Arc { data, .. } | Repr::Mmap { data, .. } => unsafe { &**data },
            // Borrowed from `self`, so this is recomputed after a move rather than stored.
            Repr::Inline { buf, len } => &buf[..*len as usize],
        }
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
        matches!(self.repr, Repr::Mmap { .. })
    }

    /// Returns `true` if the backing `Arc` allocation is shared (i.e., there
    /// are other `Arc` clones referencing the same data outside the cache).
    /// Always returns `false` for mmap-backed bytes, since the mmap `Arc` is
    /// shared across all slices from the same file and is not a useful signal.
    pub fn is_shared_arc(&self) -> bool {
        match &self.repr {
            Repr::Arc { _backing, .. } => Arc::strong_count(_backing) > 1,
            Repr::Mmap { .. } | Repr::Inline { .. } => false,
        }
    }
}

impl SharedBytes for ArcBytes {
    type MmapHandle = Arc<Mmap>;

    fn slice(self, range: Range<usize>) -> Self {
        let sliced = &self[range];
        // Inline bytes have no backing to carry over, so re-inline the sub-range.
        if let Repr::Inline { .. } = self.repr {
            return Self::from_inline(sliced);
        }
        let data = sliced as *const [u8];
        Self {
            repr: match self.repr {
                Repr::Arc { _backing, .. } => Repr::Arc { data, _backing },
                Repr::Mmap { _backing, .. } => Repr::Mmap { data, _backing },
                Repr::Inline { .. } => unreachable!("handled above"),
            },
        }
    }

    unsafe fn slice_from_subslice(&self, subslice: &[u8]) -> Self {
        // Short slices are copied instead of pointed at, so the result owns its bytes and the
        // caller's backing can be dropped. This is the common case on the lookup path: an inline
        // value or a key-value tombstone payload, both of which live in a key block, so copying
        // here is what lets a lookup avoid keeping that block alive.
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
                Repr::Arc { _backing, .. } => Repr::Arc {
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

    unsafe fn from_mmap(mmap: &Arc<Mmap>, subslice: &[u8]) -> Self {
        debug_assert!(
            is_subslice_of(subslice, mmap),
            "from_mmap: subslice is not within the mmap"
        );
        ArcBytes {
            repr: Repr::Mmap {
                data: subslice as *const [u8],
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

    #[inline]
    fn from_inline(bytes: &[u8]) -> Self {
        assert!(
            bytes.len() <= INLINE_CAPACITY,
            "{} bytes exceeds the {INLINE_CAPACITY} byte inline capacity",
            bytes.len()
        );
        let mut buf = [0u8; INLINE_CAPACITY];
        buf[..bytes.len()].copy_from_slice(bytes);
        ArcBytes {
            repr: Repr::Inline {
                buf,
                len: bytes.len() as u8,
            },
        }
    }
}
