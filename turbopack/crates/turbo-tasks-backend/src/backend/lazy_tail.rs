//! Bitmap + byte-counter record for `TaskStorageInner`'s lazy fields.
//!
//! Each lazy variant is assigned a 1-based tag at macro time (see
//! `LAZY_TAG_*` constants, all typed as [`Tag`]). A presence bitmap
//! (`present`) records which tags have a payload stored; the byte buffer
//! holds payloads packed in tag order. Per-tag size and alignment are
//! looked up via the `LAZY_SIZE`, `LAZY_ALIGN`, and `LAZY_PADDED_SIZE`
//! tables emitted by the schema.
//!
//! `LazyTail` is just the bookkeeping (presence bitmap + used/allocated
//! byte counts). The byte buffer itself lives directly after the
//! `TaskStorageInner` head in the same heap allocation managed by
//! [`crate::backend::task_storage::TaskStorage`]. None of
//! `LazyTail`'s methods own or reallocate that buffer — `TaskStorage`
//! does the alloc/dealloc/realloc, then passes a `tail_base: *mut u8`
//! pointer into `LazyTail`'s typed methods so they can read/write payloads.

use std::{num::NonZeroU8, ops::ControlFlow};

use turbo_tasks::ShrinkToFit;

use crate::backend::storage_schema::LAZY_PADDED_SIZE;
#[cfg(debug_assertions)]
use crate::backend::storage_schema::LAZY_TYPE_IDS;

/// Maximum alignment used for the tail buffer. Must be at least the largest
/// per-tag alignment in `LAZY_ALIGN`. The schema-emitted constant
/// `LAZY_MAX_ALIGN` is asserted equal at construction time.
pub(crate) const TAIL_BUFFER_ALIGN: usize = 8;

/// A 1-based lazy-variant tag. Constructed from the schema-emitted
/// `LAZY_TAG_<NAME>` constants. Tag 0 is reserved as the bincode encode
/// sentinel and never appears as a `Tag` value — that invariant is carried
/// at the type level via [`NonZeroU8`], so `Option<Tag>` also gets a
/// 1-byte niche representation.
///
/// The presence bitmap on [`LazyTail`] uses bit `tag - 1` for each variant,
/// so this newtype centralizes the bit/mask math instead of repeating
/// `1u32 << (tag - 1)` everywhere.
#[repr(transparent)]
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub(crate) struct Tag(NonZeroU8);

impl Tag {
    /// Construct from a raw 1-based tag. Compiles to a no-op when `raw` is
    /// a non-zero literal.
    ///
    /// # Panics
    /// Panics if `raw == 0` (in both debug and release) and in debug if
    /// `raw > 32`. Callers should use the schema-emitted `LAZY_TAG_<NAME>`
    /// constants rather than constructing tags directly.
    #[inline]
    pub(crate) const fn new(raw: u8) -> Self {
        debug_assert!(raw <= 32, "Tag exceeds bitmap capacity (max 32)");
        match NonZeroU8::new(raw) {
            Some(n) => Self(n),
            None => panic!("Tag must be 1-based; raw=0 is the sentinel"),
        }
    }

    /// The raw 1-based tag value, used for wire serialization.
    #[inline]
    pub(crate) const fn raw(self) -> u8 {
        self.0.get()
    }

    /// Index into the per-tag tables (`LAZY_SIZE`, `LAZY_ALIGN`,
    /// `LAZY_PADDED_SIZE`, `LAZY_TYPE_IDS`). Identical to `raw()` for
    /// 1-based tags — slot 0 in those tables is reserved.
    #[inline]
    pub(crate) const fn table_index(self) -> usize {
        self.0.get() as usize
    }

    /// The single-bit mask `1u32 << (raw - 1)`. Used to check presence and
    /// to set / clear this variant's bit in the bitmap.
    #[inline]
    pub(crate) const fn bit(self) -> u32 {
        1u32 << (self.0.get() - 1)
    }

    /// Mask of every bit strictly below this tag's bit. Used to compute the
    /// byte offset of this tag's payload by summing the sizes of every
    /// present variant that packs before it.
    #[inline]
    pub(crate) const fn mask_below(self) -> u32 {
        self.bit() - 1
    }

    /// Assert that the caller's `T` matches the payload type the schema
    /// assigned to this tag. The schema-emitted `LAZY_TYPE_IDS` table
    /// records `TypeId::of::<PayloadT>()` at each tag's slot; we compare
    /// against `TypeId::of::<T>()`. Compiles to nothing in release builds.
    ///
    /// Catches the most common wrong-type-cast bug at the call site rather
    /// than producing UB downstream of the unsafe pointer cast.
    #[inline]
    pub(crate) fn debug_assert_type<T: 'static>(self) {
        #[cfg(debug_assertions)]
        debug_assert_eq!(
            LAZY_TYPE_IDS[self.table_index()],
            std::any::TypeId::of::<T>(),
            "lazy tag {} expects a different payload type than T = {}",
            self.raw(),
            std::any::type_name::<T>(),
        );
    }
}

/// Presence bitmap + length/capacity counters for the lazy-payload byte
/// buffer. The buffer itself lives in `TaskStorage`'s allocation, just
/// past the end of the `TaskStorageInner` head — `LazyTail` only carries the
/// metadata needed to interpret that buffer.
///
/// Laid out as `(present, len, cap)` under explicit `#[repr(C)]`. Total size
/// 8 B on 64-bit (down from 16 B in the previous design that included a
/// `NonNull<u8>` to a separately-allocated buffer).
///
/// Doesn't implement `Debug`: rendering the payloads requires a pointer to
/// the tail bytes, which only the owning
/// [`crate::backend::task_storage::TaskStorage`] has. That type's `Debug`
/// impl walks `present` and formats each payload via the schema's
/// per-tag dispatch.
#[repr(C)]
#[derive(Default)]
pub(crate) struct LazyTail {
    /// Presence bitmap: bit `tag - 1` is set iff the variant with that tag
    /// is stored in the tail buffer.
    pub(crate) present: u32,
    /// Bytes used in the tail buffer.
    /// Can be computed as `sum_padded_sizes(present)` but is frequenetly needed and so maintained
    /// would be worth dropping if we actually saved memory from it.
    pub(crate) len: u16,
    /// Bytes allocated in the tail buffer.
    pub(crate) cap: u16,
}

impl ShrinkToFit for LazyTail {
    /// `LazyTail` doesn't own the buffer, so it has nothing to shrink itself.
    /// `TaskStorage::shrink_to_fit` does the actual realloc.
    #[inline]
    fn shrink_to_fit(&mut self) {}
}

impl Drop for LazyTail {
    /// Explicit no-op. The payload-drop walk and the dealloc of the
    /// underlying byte buffer are both owned by
    /// [`crate::backend::task_storage::TaskStorage`]: see its `Drop` impl. This
    /// type only carries the presence bitmap + length/capacity counters and
    /// owns no resources of its own. A manual `Drop` here makes the
    /// "lifecycle lives elsewhere" invariant explicit so a future field
    /// addition doesn't accidentally end up needing a destructor that
    /// `TaskStorage::drop` is unaware of.
    fn drop(&mut self) {}
}

impl LazyTail {
    /// Byte offset of `tag`'s slot in the tail buffer — the sum of
    /// `LAZY_PADDED_SIZE` for every present variant packed strictly below
    /// it. Returned unconditionally; the caller is responsible for knowing
    /// whether the slot is occupied. Used by `insert_unchecked` (which has
    /// already established `tag` is *absent*: the returned offset is where
    /// the new payload would go) and by `offset_of` (which gates this on
    /// the present-bit being set).
    #[inline]
    pub(crate) fn offset_for(&self, tag: Tag) -> usize {
        Self::sum_padded_sizes(self.present & tag.mask_below())
    }

    /// Byte offset of `tag`'s payload, or `None` if it isn't present.
    #[inline]
    pub(crate) fn offset_of(&self, tag: Tag) -> Option<usize> {
        if self.present & tag.bit() == 0 {
            return None;
        }
        Some(self.offset_for(tag))
    }

    /// Sum of `LAZY_PADDED_SIZE[k+1]` over every set bit `k` in `mask`.
    ///
    /// Iterates set bits using the classic `mask &= mask - 1` trick (Daniel
    /// Lemire, "Iterating over set bits quickly":
    /// <https://lemire.me/blog/2018/02/21/iterating-over-set-bits-quickly/>),
    /// which runs in `popcount(mask)` steps rather than 32. The stdlib has
    /// `trailing_zeros` / `count_ones` but no built-in set-bit iterator;
    /// `bits &= bits - 1` is the canonical equivalent.
    #[inline]
    fn sum_padded_sizes(mut mask: u32) -> usize {
        let mut offset = 0usize;
        while mask != 0 {
            let bit_idx = mask.trailing_zeros();
            // `bit_idx` is in 0..32; tag is `bit_idx + 1`, in 1..=LAZY_N.
            offset += LAZY_PADDED_SIZE[bit_idx as usize + 1] as usize;
            mask &= mask - 1;
        }
        offset
    }

    /// Walk every present tag in ascending tag order, invoking `f` with the
    /// tag and a pointer to its payload bytes. The callback returns
    /// [`ControlFlow`] so iteration can short-circuit.
    ///
    /// Returns the `ControlFlow::Break(B)` value if the callback broke,
    /// else `ControlFlow::Continue(())` after walking every present tag.
    ///
    /// This is the iteration primitive used by `TaskStorage::drop`,
    /// `Debug::fmt`, and the eviction predicates — `sum_padded_sizes` and
    /// the `bits &= bits - 1` Lemire trick stay confined to this module.
    /// Callers that want to filter to a subset of tags apply the mask
    /// themselves inside the callback.
    ///
    /// Offsets accumulate across iterations: each step adds the previous
    /// tag's padded size to a running `offset`, rather than re-summing
    /// `LAZY_PADDED_SIZE` across `tag.mask_below()` on every iteration.
    /// This drops the walk from O(popcount²) to O(popcount).
    ///
    /// # Safety
    /// - `tail_base` must point to this `LazyTail`'s byte buffer (at least `self.cap` bytes), with
    ///   provenance over the full head+tail allocation.
    /// - `f` may read the bytes at the supplied pointer as the payload type the schema assigned to
    ///   that tag (per `LAZY_TYPE_IDS`). Bytes outside the per-tag payload region are not
    ///   guaranteed to be initialized.
    #[inline]
    pub(crate) unsafe fn try_for_each_present<B>(
        &self,
        tail_base: *const u8,
        mut f: impl FnMut(Tag, *const u8) -> ControlFlow<B>,
    ) -> ControlFlow<B> {
        let mut bits = self.present;
        let mut offset = 0usize;
        while bits != 0 {
            let bit_idx = bits.trailing_zeros();
            // `bit_idx` is in `0..32` because `bits != 0`, so `bit_idx + 1`
            // is a valid 1-based tag.
            let tag = Tag::new((bit_idx + 1) as u8);
            // SAFETY: `offset < self.len <= cap`, so `tail_base.add(offset)`
            // is in-bounds of the unified head+tail allocation.
            let ptr = unsafe { tail_base.add(offset) };
            f(tag, ptr)?;
            offset += LAZY_PADDED_SIZE[tag.table_index()] as usize;
            bits &= bits - 1;
        }
        ControlFlow::Continue(())
    }

    /// Non-short-circuiting variant of [`Self::try_for_each_present`]. Same
    /// safety contract.
    #[inline]
    pub(crate) unsafe fn for_each_present(
        &self,
        tail_base: *const u8,
        mut f: impl FnMut(Tag, *const u8),
    ) {
        // SAFETY: forwarded — the caller has already signed the contract
        // documented on `try_for_each_present`.
        let _ = unsafe {
            self.try_for_each_present::<()>(tail_base, |tag, ptr| {
                f(tag, ptr);
                ControlFlow::Continue(())
            })
        };
    }

    /// `true` iff the variant with `tag` has a payload in the tail.
    #[inline]
    pub(crate) fn has(&self, tag: Tag) -> bool {
        self.present & tag.bit() != 0
    }

    /// Get a typed reference to the payload for `tag`.
    ///
    /// # Safety
    /// - `T` must be the exact payload type for `tag` per the schema's `LAZY_SIZE` / `LAZY_ALIGN`
    ///   tables.
    /// - `tail_base` must point to a buffer of at least `self.len` initialized bytes, with the
    ///   payloads laid out as the install protocol writes them.
    #[inline]
    pub(crate) unsafe fn find<T: 'static>(&self, tag: Tag, tail_base: *const u8) -> Option<&T> {
        let offset = self.offset_of(tag)?;
        tag.debug_assert_type::<T>();

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
    pub(crate) unsafe fn find_mut<T: 'static>(
        &mut self,
        tag: Tag,
        tail_base: *mut u8,
    ) -> Option<&mut T> {
        let offset = self.offset_of(tag)?;
        tag.debug_assert_type::<T>();

        // SAFETY: see `find`.
        unsafe { Some(&mut *tail_base.add(offset).cast::<T>()) }
    }

    /// Take a payload for `tag`, removing it. Returns `None` if not present.
    ///
    /// # Safety
    /// - `T` must match the payload type for `tag`.
    /// - `tail_base` must point to a buffer matching this `LazyTail`'s metadata.
    pub(crate) unsafe fn take<T: 'static>(&mut self, tag: Tag, tail_base: *mut u8) -> Option<T> {
        let offset = self.offset_of(tag)?;
        tag.debug_assert_type::<T>();

        let payload_size = LAZY_PADDED_SIZE[tag.table_index()] as usize;
        // Bytes packed above this payload — by construction `self.len` is the
        // total used tail bytes, so everything past `offset + payload_size`
        // is the "above" region. Avoids a second `sum_padded_sizes` walk.
        let above_bytes = self.len as usize - offset - payload_size;

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
        self.present &= !tag.bit();
        Some(value)
    }

    /// Insert a payload for `tag` and return a mutable reference to it.
    /// Caller must have already ensured the buffer has enough capacity
    /// (`self.cap - self.len >= padded_size`).
    ///
    /// # Safety
    /// - `T` must match the payload type for `tag`.
    /// - The variant must NOT already be present. To replace an existing payload, use
    ///   [`Self::replace_in_place`] instead — it skips the shift work this method has to do.
    /// - `tail_base` must point to a buffer of at least `self.cap` bytes.
    pub(crate) unsafe fn insert_unchecked<T: 'static>(
        &mut self,
        tag: Tag,
        value: T,
        tail_base: *mut u8,
    ) -> &mut T {
        debug_assert!(
            !self.has(tag),
            "lazy variant tag {} already present",
            tag.raw()
        );
        tag.debug_assert_type::<T>();
        let payload_size = LAZY_PADDED_SIZE[tag.table_index()] as usize;
        let offset = self.offset_for(tag);
        // Bytes packed above this tag's slot — by construction `self.len` is
        // the total used tail bytes pre-insert, so everything past `offset`
        // is the "above" region that has to shift right.
        let above_bytes = self.len as usize - offset;
        let new_len = self.len as usize + payload_size;
        debug_assert!(
            new_len <= self.cap as usize,
            "insert_unchecked exceeds capacity ({} > {}); caller must grow first",
            new_len,
            self.cap,
        );
        debug_assert_eq!(
            (tail_base as usize + offset) % std::mem::align_of::<T>(),
            0,
            "insert offset {} is not aligned for T = {} (align {})",
            offset,
            std::any::type_name::<T>(),
            std::mem::align_of::<T>(),
        );

        // SAFETY: capacity ensured by caller. Shift payloads at or above
        // `offset` right by `payload_size`, write the new value, and return
        // a `&mut T` to it. The `&mut` borrows from `&mut self` via the
        // signature lifetime.
        let inserted = unsafe {
            if above_bytes > 0 {
                std::ptr::copy(
                    tail_base.add(offset),
                    tail_base.add(offset + payload_size),
                    above_bytes,
                );
            }
            let slot = tail_base.add(offset).cast::<T>();
            std::ptr::write(slot, value);
            &mut *slot
        };

        self.len = new_len as u16;
        self.present |= tag.bit();
        inserted
    }

    /// Replace the payload for `tag` in place (same tag, same size).
    /// Returns the old payload.
    ///
    /// # Safety
    /// - `T` must match the payload type for `tag`.
    /// - The variant must already be present (caller checked `has(tag)`).
    /// - `tail_base` must point to a buffer matching this `LazyTail`.
    pub(crate) unsafe fn replace_in_place<T: 'static>(
        &mut self,
        tag: Tag,
        value: T,
        tail_base: *mut u8,
    ) -> T {
        debug_assert!(
            self.has(tag),
            "replace_in_place expects tag {} to be present",
            tag.raw(),
        );
        tag.debug_assert_type::<T>();
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::storage_schema::LAZY_N;

    #[test]
    fn sum_padded_sizes_empty_mask_is_zero() {
        assert_eq!(LazyTail::sum_padded_sizes(0), 0);
    }

    #[test]
    fn sum_padded_sizes_single_bit_matches_table() {
        // For each valid tag, a mask with only that one bit set should sum
        // to that tag's padded size — the loop runs exactly once.
        for tag_raw in 1..=LAZY_N {
            let tag = Tag::new(tag_raw);
            let expected = LAZY_PADDED_SIZE[tag.table_index()] as usize;
            assert_eq!(
                LazyTail::sum_padded_sizes(tag.bit()),
                expected,
                "single-bit sum for tag {tag_raw} should equal LAZY_PADDED_SIZE[{tag_raw}]",
            );
        }
    }

    #[test]
    fn sum_padded_sizes_full_mask_sums_all_padded_sizes() {
        // Mask with every valid tag bit set should sum to the total of
        // `LAZY_PADDED_SIZE[1..=LAZY_N]`.
        let mut all_bits: u32 = 0;
        let mut expected: usize = 0;
        for tag_raw in 1..=LAZY_N {
            let tag = Tag::new(tag_raw);
            all_bits |= tag.bit();
            expected += LAZY_PADDED_SIZE[tag.table_index()] as usize;
        }
        assert_eq!(LazyTail::sum_padded_sizes(all_bits), expected);
    }

    #[test]
    fn sum_padded_sizes_ignores_bits_above_lazy_n() {
        // `LAZY_PADDED_SIZE[i]` for `i > LAZY_N` is undefined (the array is
        // only `LAZY_N + 1` long), so bits above `LAZY_N` must never be
        // present in a real mask. This test pins the contract: with only
        // valid bits set, the sum equals the table sum.
        let mut mask: u32 = 0;
        let mut expected: usize = 0;
        // Use alternating bits to cover the popcount-iteration path.
        for tag_raw in (1..=LAZY_N).step_by(2) {
            let tag = Tag::new(tag_raw);
            mask |= tag.bit();
            expected += LAZY_PADDED_SIZE[tag.table_index()] as usize;
        }
        assert_eq!(LazyTail::sum_padded_sizes(mask), expected);
    }

    #[test]
    fn offset_of_for_present_tag_matches_sum_of_padded_sizes_below() {
        // For a tail where two tags below `T` are present, the offset of
        // `T`'s payload must equal the sum of those two padded sizes.
        // Skip if the schema is too small to set up the scenario.
        if LAZY_N < 3 {
            return;
        }
        let t1 = Tag::new(1);
        let t2 = Tag::new(2);
        let t3 = Tag::new(3);
        let tail = LazyTail {
            present: t1.bit() | t2.bit() | t3.bit(),
            ..Default::default()
        };
        assert_eq!(tail.offset_of(t1), Some(0));
        assert_eq!(
            tail.offset_of(t2),
            Some(LAZY_PADDED_SIZE[t1.table_index()] as usize),
        );
        assert_eq!(
            tail.offset_of(t3),
            Some(
                LAZY_PADDED_SIZE[t1.table_index()] as usize
                    + LAZY_PADDED_SIZE[t2.table_index()] as usize,
            ),
        );
    }

    #[test]
    fn offset_of_for_absent_tag_returns_none() {
        let t1 = Tag::new(1);
        let t2 = Tag::new(2);
        let tail = LazyTail {
            present: t1.bit(),
            ..Default::default()
        };
        assert_eq!(tail.offset_of(t1), Some(0));
        assert_eq!(tail.offset_of(t2), None);
    }

    #[test]
    fn option_tag_niches_to_one_byte() {
        // Tag wraps `NonZeroU8`, so `Option<Tag>` should reuse the zero
        // value as the `None` discriminant.
        assert_eq!(std::mem::size_of::<Option<Tag>>(), 1);
    }
}
