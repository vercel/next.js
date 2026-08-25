use std::{ops::Deref, path::Path};

use anyhow::{Context, Result};

#[cfg(not(miri))]
use crate::mmap_helper::advise_mmap_for_persistence;

/// The contents of a persistence file.
///
/// Normal builds memory-map files for efficient random access. Miri does not support file-backed
/// memory mappings, so Miri builds read each file into an owned buffer instead.
pub struct FileContent {
    #[cfg(not(miri))]
    mmap: memmap2::Mmap,
    #[cfg(miri)]
    bytes: Vec<u8>,
}

impl FileContent {
    pub(crate) fn open(path: &Path) -> Result<Self> {
        #[cfg(not(miri))]
        {
            let file = fs_err::File::open(path)?;
            let mmap = unsafe { memmap2::Mmap::map(file.file()) }.with_context(|| {
                format!(
                    "Failed to mmap file {} ({} bytes)",
                    path.display(),
                    file.metadata().map(|m| m.len()).unwrap_or(0)
                )
            })?;
            Ok(Self { mmap })
        }
        #[cfg(miri)]
        {
            let bytes = fs_err::read(path)
                .with_context(|| format!("Failed to read file {}", path.display()))?;
            Ok(Self { bytes })
        }
    }

    pub(crate) fn advise_persistence(&self) -> Result<()> {
        #[cfg(not(miri))]
        advise_mmap_for_persistence(&self.mmap)?;
        Ok(())
    }

    pub(crate) fn advise_random(&self) -> Result<()> {
        #[cfg(all(unix, not(miri)))]
        self.mmap.advise(memmap2::Advice::Random)?;
        Ok(())
    }

    pub(crate) fn advise_sequential(&self) -> Result<()> {
        #[cfg(all(unix, not(miri)))]
        self.mmap.advise(memmap2::Advice::Sequential)?;
        Ok(())
    }

    pub(crate) fn advise_will_need(&self) -> Result<()> {
        #[cfg(all(unix, not(miri)))]
        self.mmap.advise(memmap2::Advice::WillNeed)?;
        Ok(())
    }

    pub(crate) fn advise_sequential_range(&self, offset: usize, len: usize) -> Result<()> {
        #[cfg(all(unix, not(miri)))]
        self.mmap
            .advise_range(memmap2::Advice::Sequential, offset, len)?;
        #[cfg(any(miri, not(unix)))]
        let _ = (offset, len);
        Ok(())
    }
}

impl Deref for FileContent {
    type Target = [u8];

    fn deref(&self) -> &Self::Target {
        #[cfg(not(miri))]
        {
            &self.mmap
        }
        #[cfg(miri)]
        {
            &self.bytes
        }
    }
}
