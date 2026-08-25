use std::ops::{Deref, Range};

use crate::file_content::FileContent;

/// Trait abstracting over `ArcBytes` and `RcBytes`.
///
/// Both types are owned byte slices backed by either a ref-counted heap allocation or an open
/// persistence file (memory-mapped normally, read into an owned buffer under Miri). The only
/// difference is the refcount flavor: `Arc` (atomic, thread-safe) vs `Rc` (non-atomic,
/// single-threaded).
///
/// This trait captures the shared interface so that code in
/// `static_sorted_file.rs` (block reading, key matching, etc.) can be written
/// once and used for both lookup (ArcBytes) and iteration (RcBytes) paths.
pub trait SharedBytes: Clone + Deref<Target = [u8]> + Sized {
    /// The ref-counted handle to the file contents.
    type FileContentHandle: Deref<Target = FileContent>;

    /// Returns a new instance that points to a sub-range of the current slice.
    fn slice(self, range: Range<usize>) -> Self;

    /// Creates a sub-slice from a reference that points into this instance's
    /// backing data.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `subslice` points to memory within this
    /// instance's backing storage.
    unsafe fn slice_from_subslice(&self, subslice: &[u8]) -> Self;

    /// Creates an instance backed by a persistence file's contents.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `subslice` points to memory within the
    /// given `file_content`.
    unsafe fn from_file_content(file_content: &Self::FileContentHandle, subslice: &[u8]) -> Self;

    /// Creates an instance from a decompressed block.
    fn from_decompressed(uncompressed_length: u32, block: &[u8]) -> anyhow::Result<Self>;
}

/// Returns `true` if `subslice` lies entirely within `backing`.
pub(crate) fn is_subslice_of(subslice: &[u8], backing: &[u8]) -> bool {
    let backing = backing.as_ptr_range();
    let sub = subslice.as_ptr_range();
    sub.start >= backing.start && sub.end <= backing.end
}
