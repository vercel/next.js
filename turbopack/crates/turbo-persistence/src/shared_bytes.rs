use std::ops::{Deref, Range};

use memmap2::Mmap;

/// Bytes that fit in this many bytes are stored directly inside an `ArcBytes`/`RcBytes` rather
/// than as a pointer into ref-counted backing storage.
///
/// Sized to hold any inline value or key-value tombstone payload, which the writer caps at
/// [`MAX_INLINE_VALUE_SIZE`][crate::constants::MAX_INLINE_VALUE_SIZE]. Those are the only values
/// that live in a key block, so covering them means a lookup that returns one does not have to
/// keep the whole block alive.
///
/// It is a capacity, not a contract: the size a reader derives for such a value comes from an
/// on-disk type byte, so a corrupt file can claim more. Anything longer simply takes the
/// pointer-and-backing path.
pub(crate) const INLINE_CAPACITY: usize = 8;

// Anything the writer can place in a key block must fit, or the common case would silently fall
// back to the pointer path.
const _: () = assert!(
    INLINE_CAPACITY >= crate::constants::MAX_INLINE_VALUE_SIZE,
    "INLINE_CAPACITY must cover every inline value the writer can emit"
);

/// Trait abstracting over `ArcBytes` and `RcBytes`.
///
/// Both types are owned byte slices backed by either a ref-counted heap
/// allocation or a memory-mapped file. The only difference is the refcount
/// flavor: `Arc` (atomic, thread-safe) vs `Rc` (non-atomic, single-threaded).
///
/// This trait captures the shared interface so that code in
/// `static_sorted_file.rs` (block reading, key matching, etc.) can be written
/// once and used for both lookup (ArcBytes) and iteration (RcBytes) paths.
pub trait SharedBytes: Clone + Deref<Target = [u8]> + Sized {
    /// The ref-counted handle to the memory-mapped file.
    type MmapHandle: Deref<Target = Mmap>;

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

    /// Creates an instance backed by a memory-mapped file.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `subslice` points to memory within the
    /// given `mmap`.
    unsafe fn from_mmap(mmap: &Self::MmapHandle, subslice: &[u8]) -> Self;

    /// Creates an instance from a decompressed block.
    fn from_decompressed(uncompressed_length: u32, block: &[u8]) -> anyhow::Result<Self>;

    /// Copies `bytes` into an inline buffer, so the result owns them and borrows nothing.
    ///
    /// # Panics
    ///
    /// If `bytes.len() > INLINE_CAPACITY`. Callers reading a length off disk must bound it first —
    /// [`entry_val_size`][crate::static_sorted_file] does this for key block entries.
    fn from_inline(block: &[u8]) -> Self;
}

/// Returns `true` if `subslice` lies entirely within `backing`.
pub(crate) fn is_subslice_of(subslice: &[u8], backing: &[u8]) -> bool {
    let backing = backing.as_ptr_range();
    let sub = subslice.as_ptr_range();
    sub.start >= backing.start && sub.end <= backing.end
}
