use std::{
    borrow::Borrow,
    fmt::{self, Debug, Formatter},
    hash::{Hash, Hasher},
    ops::{Deref, Range},
    sync::Arc,
};

use memmap2::Mmap;

use crate::compression::decompress_into_arc;

/// The backing storage for an `ArcBytes`.
#[derive(Clone)]
enum Backing<'l> {
    Arc {
        _backing: Arc<[u8]>,
    },
    Mmap {
        _backing: Arc<Mmap>,
    },
    /// Borrows an mmap handle when the byte view cannot escape the caller's scope.
    MmapRef {
        _backing: &'l Arc<Mmap>,
    },
}

/// A byte slice backed by owned bytes, an owned mmap handle, or a borrowed mmap handle.
#[derive(Clone)]
pub struct ArcBytes<'l> {
    data: *const [u8],
    // Keep the backing after the raw pointer so it is dropped last.
    backing: Backing<'l>,
}

unsafe impl Send for ArcBytes<'_> {}
unsafe impl Sync for ArcBytes<'_> {}

impl From<Arc<[u8]>> for ArcBytes<'static> {
    fn from(arc: Arc<[u8]>) -> Self {
        Self {
            data: &*arc as *const [u8],
            backing: Backing::Arc { _backing: arc },
        }
    }
}

impl From<Box<[u8]>> for ArcBytes<'static> {
    fn from(bytes: Box<[u8]>) -> Self {
        Self::from(Arc::from(bytes))
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

fn is_subslice_of(subslice: &[u8], backing: &[u8]) -> bool {
    let backing = backing.as_ptr_range();
    let subslice = subslice.as_ptr_range();
    subslice.start >= backing.start && subslice.end <= backing.end
}

fn backing_as_slice<'a>(backing: &'a Backing<'a>) -> &'a [u8] {
    match backing {
        Backing::Arc { _backing } => _backing,
        Backing::Mmap { _backing } => _backing,
        Backing::MmapRef { _backing } => _backing,
    }
}

impl<'l> ArcBytes<'l> {
    pub fn slice(self, range: Range<usize>) -> Self {
        let data = &self[range] as *const [u8];
        Self {
            data,
            backing: self.backing,
        }
    }

    /// # Safety
    /// `subslice` must point into this value's backing storage.
    pub unsafe fn slice_from_subslice(&self, subslice: &[u8]) -> Self {
        debug_assert!(is_subslice_of(subslice, backing_as_slice(&self.backing)));
        Self {
            data: subslice as *const [u8],
            backing: self.backing.clone(),
        }
    }

    /// Promotes a borrowed mmap view by cloning its mmap handle.
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

    pub fn is_mmap_backed(&self) -> bool {
        matches!(self.backing, Backing::Mmap { .. } | Backing::MmapRef { .. })
    }

    pub fn is_shared_arc(&self) -> bool {
        match &self.backing {
            Backing::Arc { _backing } => Arc::strong_count(_backing) > 1,
            Backing::Mmap { .. } | Backing::MmapRef { .. } => false,
        }
    }

    /// # Safety
    /// `subslice` must point into `mmap`.
    pub unsafe fn from_mmap(mmap: Arc<Mmap>, subslice: &[u8]) -> ArcBytes<'static> {
        debug_assert!(is_subslice_of(subslice, &mmap));
        ArcBytes {
            data: subslice as *const [u8],
            backing: Backing::Mmap { _backing: mmap },
        }
    }

    /// # Safety
    /// `subslice` must point into `mmap`.
    pub unsafe fn from_mmap_ref(mmap: &'l Arc<Mmap>, subslice: &[u8]) -> Self {
        debug_assert!(is_subslice_of(subslice, mmap));
        Self {
            data: subslice as *const [u8],
            backing: Backing::MmapRef { _backing: mmap },
        }
    }
    pub(crate) fn from_decompressed(
        uncompressed_length: u32,
        block: &[u8],
    ) -> anyhow::Result<ArcBytes<'static>> {
        Ok(ArcBytes::from(decompress_into_arc(
            uncompressed_length,
            block,
        )?))
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    #[test]
    fn borrowed_mmap_can_be_sliced_and_promoted() -> anyhow::Result<()> {
        let mut file = tempfile::tempfile()?;
        file.write_all(b"0123456789")?;
        let mmap = Arc::new(unsafe { Mmap::map(&file)? });
        let borrowed = unsafe { ArcBytes::from_mmap_ref(&mmap, &mmap[2..8]) };
        let promoted = borrowed.slice(1..5).into_static();
        drop(mmap);
        assert_eq!(&*promoted, b"3456");
        Ok(())
    }
}
