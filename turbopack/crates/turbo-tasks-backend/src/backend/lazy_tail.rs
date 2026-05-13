//! Bitmap + byte-counter record for `TaskStorageInner`'s lazy fields.
//!
//! Each lazy variant is assigned a 1-based tag at macro time (see
//! `LAZY_TAG_*` constants). A presence bitmap (`present`) records which tags
//! have a payload stored; the byte buffer holds payloads packed in tag order.
//! Per-tag size and alignment are looked up via the `LAZY_SIZE`,
//! `LAZY_ALIGN`, and `LAZY_PADDED_SIZE` tables emitted by the schema.
//!
//! `LazyTail` is just the bookkeeping (presence bitmap + used/allocated
//! byte counts). The byte buffer itself lives directly after the
//! `TaskStorageInner` head in the same heap allocation managed by
//! [`crate::backend::task_storage::TaskStorage`]. None of
//! `LazyTail`'s methods own or reallocate that buffer — `TaskStorage`
//! does the alloc/dealloc/realloc, then passes a `tail_base: *mut u8`
//! pointer into `LazyTail`'s typed methods so they can read/write payloads.

use turbo_tasks::ShrinkToFit;

use crate::backend::storage_schema::LAZY_PADDED_SIZE;

/// Maximum alignment used for the tail buffer. Must be at least the largest
/// per-tag alignment in `LAZY_ALIGN`. The schema-emitted constant
/// `LAZY_MAX_ALIGN` is asserted equal at construction time.
pub(crate) const TAIL_BUFFER_ALIGN: usize = 8;

/// Presence bitmap + length/capacity counters for the lazy-payload byte
/// buffer. The buffer itself lives in `TaskStorage`'s allocation, just
/// past the end of the `TaskStorageInner` head — `LazyTail` only carries the
/// metadata needed to interpret that buffer.
///
/// Laid out as `(present, len, cap)` under explicit `#[repr(C)]`. Total size
/// 8 B on 64-bit (down from 16 B in the previous design that included a
/// `NonNull<u8>` to a separately-allocated buffer).
#[repr(C)]
#[derive(Default)]
pub(crate) struct LazyTail {
    /// Presence bitmap: bit `tag - 1` is set iff the variant with that tag
    /// is stored in the tail buffer.
    pub(crate) present: u32,
    /// Bytes used in the tail buffer.
    pub(crate) len: u16,
    /// Bytes allocated in the tail buffer.
    pub(crate) cap: u16,
}

impl std::fmt::Debug for LazyTail {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Don't dump the buffer — its bytes are meaningless without per-tag
        // payload type information. The presence bitmap is enough to be
        // useful in logs.
        f.debug_struct("LazyTail")
            .field("present", &format_args!("{:#034b}", self.present))
            .field("len", &self.len)
            .field("cap", &self.cap)
            .finish()
    }
}

impl ShrinkToFit for LazyTail {
    /// `LazyTail` doesn't own the buffer, so it has nothing to shrink itself.
    /// `TaskStorage::shrink_to_fit` does the actual realloc.
    fn shrink_to_fit(&mut self) {}
}

impl LazyTail {
    /// Compute the byte offset of the payload for `tag` in the tail buffer,
    /// assuming the `present` bitmap is consistent. Returns `Some(offset)`
    /// if `tag` is currently present, else `None`.
    ///
    /// The offset is the sum of `LAZY_PADDED_SIZE[k]` over every set bit `k`
    /// strictly below the bit for `tag` in `present`.
    #[inline]
    pub(crate) fn offset_of(&self, tag: u8) -> Option<usize> {
        let bit = 1u32 << (tag - 1);
        if self.present & bit == 0 {
            return None;
        }
        let mask_below = self.present & (bit - 1);
        Some(Self::sum_padded_sizes(mask_below))
    }

    /// Sum of `LAZY_PADDED_SIZE[k+1]` over every set bit `k` in `mask`.
    #[inline]
    pub(crate) fn sum_padded_sizes(mut mask: u32) -> usize {
        let mut offset = 0usize;
        while mask != 0 {
            let bit_idx = mask.trailing_zeros();
            // `bit_idx` is in 0..32; tag is `bit_idx + 1`, in 1..=LAZY_N.
            offset += LAZY_PADDED_SIZE[bit_idx as usize + 1] as usize;
            mask &= mask - 1;
        }
        offset
    }

    /// `true` iff the variant with `tag` has a payload in the tail.
    #[inline]
    pub(crate) fn has(&self, tag: u8) -> bool {
        self.present & (1u32 << (tag - 1)) != 0
    }

    /// Get a typed reference to the payload for `tag`.
    ///
    /// # Safety
    /// - `T` must be the exact payload type for `tag` per the schema's `LAZY_SIZE` / `LAZY_ALIGN`
    ///   tables.
    /// - `tail_base` must point to a buffer of at least `self.len` initialized bytes, with the
    ///   payloads laid out as the install protocol writes them.
    #[inline]
    pub(crate) unsafe fn find<T>(&self, tag: u8, tail_base: *const u8) -> Option<&T> {
        let offset = self.offset_of(tag)?;
        // SAFETY: `offset < self.len <= cap`, so `tail_base.add(offset)` is
        // inside the buffer. The bytes at that offset were written as a `T`
        // by `install`; the caller's `T` matches the tag per the contract.
        unsafe { Some(&*tail_base.add(offset).cast::<T>()) }
    }

    /// Get a typed mutable reference to the payload for `tag`.
    ///
    /// # Safety
    /// Same as [`Self::find`]; caller has exclusive access via the `&mut`
    /// chain from `TaskStorage`.
    #[inline]
    pub(crate) unsafe fn find_mut<T>(&self, tag: u8, tail_base: *mut u8) -> Option<&mut T> {
        let offset = self.offset_of(tag)?;
        // SAFETY: see `find`.
        unsafe { Some(&mut *tail_base.add(offset).cast::<T>()) }
    }

    /// Take a payload for `tag`, removing it. Returns `None` if not present.
    ///
    /// # Safety
    /// - `T` must match the payload type for `tag`.
    /// - `tail_base` must point to a buffer matching this `LazyTail`'s metadata.
    pub(crate) unsafe fn take<T>(&mut self, tag: u8, tail_base: *mut u8) -> Option<T> {
        let offset = self.offset_of(tag)?;
        let bit = 1u32 << (tag - 1);
        let payload_size = LAZY_PADDED_SIZE[tag as usize] as usize;
        let mask_above = self.present & !((bit << 1) - 1);
        let above_bytes = Self::sum_padded_sizes(mask_above);

        // SAFETY: `offset` is valid; we read the payload as `T` (caller
        // guarantees the type matches), then memmove the bytes above
        // `offset + payload_size` left by `payload_size` to repack the
        // remaining payloads.
        let value = unsafe {
            let value = std::ptr::read(tail_base.add(offset).cast::<T>());
            if above_bytes > 0 {
                std::ptr::copy(
                    tail_base.add(offset + payload_size),
                    tail_base.add(offset),
                    above_bytes,
                );
            }
            value
        };

        self.len -= payload_size as u16;
        self.present &= !bit;
        Some(value)
    }

    /// Install a payload for `tag`. Caller must have already ensured the
    /// buffer has enough capacity (`self.cap - self.len >= padded_size`).
    ///
    /// # Safety
    /// - `T` must match the payload type for `tag`.
    /// - The variant must NOT already be present (caller should `take` it first to replace).
    /// - `tail_base` must point to a buffer of at least `self.cap` bytes.
    pub(crate) unsafe fn install_unchecked<T>(&mut self, tag: u8, value: T, tail_base: *mut u8) {
        debug_assert!(!self.has(tag), "lazy variant tag {tag} already present");
        let bit = 1u32 << (tag - 1);
        let mask_below = self.present & (bit - 1);
        let mask_above = self.present & !mask_below;
        let payload_size = LAZY_PADDED_SIZE[tag as usize] as usize;
        let offset = Self::sum_padded_sizes(mask_below);
        let above_bytes = Self::sum_padded_sizes(mask_above);
        let new_len = self.len as usize + payload_size;
        debug_assert!(
            new_len <= self.cap as usize,
            "install_unchecked exceeds capacity ({} > {}); caller must grow first",
            new_len,
            self.cap,
        );

        // SAFETY: capacity ensured by caller. Shift payloads at or above
        // `offset` right by `payload_size`, then write the new value.
        unsafe {
            if above_bytes > 0 {
                std::ptr::copy(
                    tail_base.add(offset),
                    tail_base.add(offset + payload_size),
                    above_bytes,
                );
            }
            std::ptr::write(tail_base.add(offset).cast::<T>(), value);
        }

        self.len = new_len as u16;
        self.present |= bit;
    }

    /// Replace the payload for `tag` in place (same tag, same size).
    /// Returns the old payload.
    ///
    /// # Safety
    /// - `T` must match the payload type for `tag`.
    /// - The variant must already be present (caller checked `has(tag)`).
    /// - `tail_base` must point to a buffer matching this `LazyTail`.
    pub(crate) unsafe fn replace_in_place<T>(
        &mut self,
        tag: u8,
        value: T,
        tail_base: *mut u8,
    ) -> T {
        debug_assert!(
            self.has(tag),
            "replace_in_place expects tag {tag} to be present"
        );
        // SAFETY: `has(tag)` => `offset_of(tag)` is `Some`. Caller guarantees
        // type match; same-tag replace has constant payload size so no
        // shifts are needed.
        unsafe {
            let offset = self.offset_of(tag).unwrap_unchecked();
            let ptr = tail_base.add(offset).cast::<T>();
            let old = std::ptr::read(ptr);
            std::ptr::write(ptr, value);
            old
        }
    }
}
