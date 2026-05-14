//! `TaskStorage`: thin owning pointer to a heap allocation that contains
//! both the [`TaskStorageInner`] head and the byte-packed tail holding lazy-field
//! payloads.
//!
//! Allocation layout:
//!
//! ```text
//! offset 0:                       TaskStorageInner { inline head fields, flags, lazy_tail metadata }
//! offset size_of::<TaskStorageInner>: [u8; tail_cap] — payloads in tag order
//! ```
//!
//! `TaskStorageInner`'s alignment is ≥ 8 (it transitively contains `Arc`/`Box`
//! fields), and `size_of::<TaskStorageInner>()` is a multiple of that alignment,
//! so the tail base is always aligned for every payload type. A
//! `debug_assert!` in [`TaskStorage::new`] enforces this.
//!
//! Growing the allocation requires updating the owning pointer, which is
//! why this type exists — `&mut TaskStorageInner` alone can't relocate.

use std::{
    alloc::{Layout, alloc, dealloc, handle_alloc_error, realloc},
    fmt,
    ops::{Deref, DerefMut},
    ptr::NonNull,
};

use turbo_tasks::ShrinkToFit;

use crate::backend::{
    lazy_tail::{TAIL_BUFFER_ALIGN, Tag},
    storage_schema::{LAZY_MAX_ALIGN, LAZY_PADDED_SIZE, TaskStorageInner, lazy_drop_dispatch},
};

/// Owning thin pointer to a heap allocation containing the [`TaskStorageInner`]
/// head and its byte-packed lazy tail.
///
/// Same machine-word footprint as a plain `Box<TaskStorageInner>`, so DashMap
/// entries stay 8 B + key.
pub struct TaskStorage {
    ptr: NonNull<TaskStorageInner>,
}

// `TaskStorage` is a single `NonNull<TaskStorageInner>`, so `Option<TaskStorage>`
// must use the null-pointer niche and stay the same size. If this assert
// fails, the DashMap entry layouts that depend on the thin-pointer assumption
// have silently grown.
const _: () = assert!(
    std::mem::size_of::<Option<TaskStorage>>() == std::mem::size_of::<TaskStorage>(),
    "Option<TaskStorage> must use the NonNull niche",
);

// SAFETY: We own the unified allocation; no one else can observe these bytes
// while we hold a unique reference. The lazy-tail payloads are only
// interpreted through typed accessors carrying SAFETY contracts.
// `TaskStorageInner: Send + Sync` is the natural derive.
unsafe impl Send for TaskStorage {}
unsafe impl Sync for TaskStorage {}

impl TaskStorage {
    /// Allocate a fresh `TaskStorage` with no lazy payloads installed.
    /// The initial allocation is sized to the head only — the first lazy
    /// install triggers a grow.
    pub fn new() -> Self {
        Self::with_tail_capacity(0)
    }

    /// Allocate a fresh `TaskStorage` with the given initial tail
    /// capacity. Useful when the caller knows several lazy fields will be
    /// installed (e.g. decode) and wants to skip the small-grow steps.
    pub fn with_tail_capacity(tail_cap: u16) -> Self {
        let layout = Self::layout(tail_cap);
        // SAFETY: `layout` has non-zero size (head is non-empty) and a
        // valid alignment.
        let raw = unsafe { alloc(layout) };
        if raw.is_null() {
            handle_alloc_error(layout);
        }
        let head_ptr = raw as *mut TaskStorageInner;
        // SAFETY: `head_ptr` is a fresh, properly-aligned allocation of at
        // least `size_of::<TaskStorageInner>()` bytes. We write the default
        // value, then bump `tail_cap` to reflect the allocated capacity.
        unsafe {
            head_ptr.write(TaskStorageInner::default());
            (*head_ptr).lazy_tail.cap = tail_cap;
        }
        Self {
            // SAFETY: `head_ptr` is non-null (we checked above).
            ptr: unsafe { NonNull::new_unchecked(head_ptr) },
        }
    }

    /// Compute the `Layout` of a `TaskStorage` with `tail_cap` tail bytes.
    #[inline]
    fn layout(tail_cap: u16) -> Layout {
        let head_size = std::mem::size_of::<TaskStorageInner>();
        let align = std::mem::align_of::<TaskStorageInner>();
        debug_assert!(
            align >= LAZY_MAX_ALIGN,
            "TaskStorageInner alignment ({align}) must be ≥ LAZY_MAX_ALIGN ({LAZY_MAX_ALIGN}) so \
             the tail starts at a valid offset for every payload",
        );
        debug_assert!(
            head_size.is_multiple_of(LAZY_MAX_ALIGN),
            "size_of::<TaskStorageInner>() ({head_size}) must be a multiple of LAZY_MAX_ALIGN \
             ({LAZY_MAX_ALIGN}) so the tail base is aligned for every payload",
        );
        debug_assert_eq!(
            TAIL_BUFFER_ALIGN, LAZY_MAX_ALIGN,
            "TAIL_BUFFER_ALIGN ({TAIL_BUFFER_ALIGN}) must equal LAZY_MAX_ALIGN ({LAZY_MAX_ALIGN})",
        );
        // SAFETY: `head_size + tail_cap` fits in usize; `align` is a valid
        // alignment.
        unsafe { Layout::from_size_align_unchecked(head_size + tail_cap as usize, align) }
    }

    /// Read-only pointer to the first byte of the tail (immediately after
    /// the head).
    ///
    /// The returned pointer carries provenance over the full head+tail
    /// allocation (derived from `self.ptr`, which was constructed with the
    /// allocation's full layout). Reading through it is sound under
    /// Stacked Borrows even though a plain `&TaskStorageInner` reference
    /// only has provenance over the head bytes.
    ///
    /// # Safety
    /// The returned pointer is valid for `head.lazy_tail.cap` bytes. Reads
    /// must respect `head.lazy_tail.present` — only present payloads have
    /// valid initialized bytes.
    #[inline]
    pub(crate) fn tail_ptr(&self) -> *const u8 {
        let head_size = std::mem::size_of::<TaskStorageInner>();
        // SAFETY: the allocation has at least `head_size + cap` bytes, so
        // adding `head_size` to the head pointer is in-bounds.
        unsafe { (self.ptr.as_ptr() as *const u8).add(head_size) }
    }

    /// Mutable pointer to the first byte of the tail.
    #[inline]
    pub(crate) fn tail_ptr_mut(&mut self) -> *mut u8 {
        let head_size = std::mem::size_of::<TaskStorageInner>();
        // SAFETY: see `tail_ptr`.
        unsafe { (self.ptr.as_ptr() as *mut u8).add(head_size) }
    }

    /// Insert a payload for `tag`. Grows the allocation if needed. The
    /// variant must not already be present.
    ///
    /// # Safety
    /// `T` must match the payload type for `tag` per the schema's tag → type
    /// mapping.
    pub(crate) unsafe fn lazy_insert<T: 'static>(&mut self, tag: Tag, value: T) {
        debug_assert!(
            !self.lazy_tail.has(tag),
            "lazy variant tag {} already present",
            tag.raw(),
        );
        let payload_size = LAZY_PADDED_SIZE[tag.table_index()] as usize;
        let new_len = self.lazy_tail.len as usize + payload_size;
        if new_len > self.lazy_tail.cap as usize {
            // SAFETY: `grow_to` reallocates the buffer to fit at least
            // `new_len` tail bytes. `self.ptr` is updated to the new
            // allocation.
            unsafe { self.grow_to(new_len) };
        }
        // SAFETY: caller ensures `T` matches `tag`; capacity is sufficient.
        unsafe {
            let tail_base = self.tail_ptr_mut();
            self.head_mut()
                .lazy_tail
                .insert_unchecked::<T>(tag, value, tail_base);
        }
    }

    /// Replace the payload for `tag` with `value`. If absent, inserts the
    /// new value (may grow). Returns the previous payload if any.
    ///
    /// # Safety
    /// `T` must match the payload type for `tag`.
    pub(crate) unsafe fn lazy_replace<T: 'static>(&mut self, tag: Tag, value: T) -> Option<T> {
        if self.lazy_tail.has(tag) {
            // SAFETY: caller ensures type match; same-tag replace is
            // in-place, no shifts or growth.
            unsafe {
                let tail_base = self.tail_ptr_mut();
                Some(
                    self.head_mut()
                        .lazy_tail
                        .replace_in_place::<T>(tag, value, tail_base),
                )
            }
        } else {
            // SAFETY: caller ensures type match; variant not present.
            unsafe { self.lazy_insert(tag, value) };
            None
        }
    }

    /// Get-or-create: if the variant is absent, insert `Default::default()`
    /// (which may grow), then return a mutable reference to the payload.
    ///
    /// # Safety
    /// `T` must match the payload type for `tag`.
    pub(crate) unsafe fn lazy_get_or_create<T: Default + 'static>(&mut self, tag: Tag) -> &mut T {
        if !self.lazy_tail.has(tag) {
            // SAFETY: caller ensures `T` matches `tag`; variant not present.
            unsafe { self.lazy_insert::<T>(tag, T::default()) };
        }
        // SAFETY: just confirmed presence (and inserted if needed).
        unsafe { self.lazy_find_mut::<T>(tag).unwrap_unchecked() }
    }

    /// Get a typed reference to a present lazy payload.
    ///
    /// # Safety
    /// `T` must match the payload type for `tag`.
    #[inline]
    pub(crate) unsafe fn lazy_find<T: 'static>(&self, tag: Tag) -> Option<&T> {
        let tail_base = self.tail_ptr();
        // SAFETY: caller ensures `T` matches `tag`; `tail_base` is the start
        // of the tail buffer for this allocation, with provenance over the
        // full head+tail allocation (derived from `self.ptr`).
        unsafe { self.head().lazy_tail.find::<T>(tag, tail_base) }
    }

    /// Get a typed mutable reference to a present lazy payload.
    ///
    /// # Safety
    /// `T` must match the payload type for `tag`.
    #[inline]
    pub(crate) unsafe fn lazy_find_mut<T: 'static>(&mut self, tag: Tag) -> Option<&mut T> {
        let tail_base = self.tail_ptr_mut();
        // SAFETY: caller ensures `T` matches `tag`; `tail_base` is the start
        // of the tail buffer for this allocation.
        unsafe { self.head_mut().lazy_tail.find_mut::<T>(tag, tail_base) }
    }

    /// Take a present lazy payload, removing it. Returns `None` if absent.
    ///
    /// # Safety
    /// `T` must match the payload type for `tag`.
    pub(crate) unsafe fn lazy_take<T: 'static>(&mut self, tag: Tag) -> Option<T> {
        let tail_base = self.tail_ptr_mut();
        // SAFETY: caller ensures `T` matches `tag`; tail_base has provenance
        // over the full allocation.
        unsafe { self.head_mut().lazy_tail.take::<T>(tag, tail_base) }
    }

    /// "Are all lazy data-category fields empty?" — used by eviction
    /// predicates.
    ///
    /// Returns true iff every data-category variant present in the lazy
    /// area reports `is_empty()` via the schema's per-tag dispatch. Lives
    /// on `TaskStorage` (not `TaskStorageInner`) so the dispatch can read
    /// payload bytes through a pointer with provenance over the full
    /// head+tail allocation.
    pub(crate) fn all_lazy_data_empty_or_absent(&self) -> bool {
        self.all_lazy_in_mask_empty(crate::backend::storage_schema::LAZY_DATA_MASK)
    }

    /// "Are all lazy meta-category fields empty?" — used by eviction
    /// predicates.
    pub(crate) fn all_lazy_meta_empty_or_absent(&self) -> bool {
        self.all_lazy_in_mask_empty(crate::backend::storage_schema::LAZY_META_MASK)
    }

    /// "Are all transient lazy fields empty?" — used by eviction predicates.
    pub(crate) fn all_transient_lazy_empty(&self) -> bool {
        // Transient variants are the bits NOT in `LAZY_PERSISTENT_MASK`.
        self.all_lazy_in_mask_empty(!crate::backend::storage_schema::LAZY_PERSISTENT_MASK)
    }

    /// Walk every present tag whose bit is set in `mask` and return `true`
    /// only if all of those payloads report `is_empty()` via the schema's
    /// per-tag dispatch.
    fn all_lazy_in_mask_empty(&self, mask: u32) -> bool {
        let mut bits = self.head().lazy_tail.present & mask;
        let tail_base = self.tail_ptr();
        while bits != 0 {
            let bit_idx = bits.trailing_zeros();
            // `bit_idx` is in `0..32` because `bits != 0`, so `bit_idx + 1`
            // is a valid 1-based tag.
            let tag = Tag::new((bit_idx + 1) as u8);
            // SAFETY: `tag` is present in the bitmap, and the byte at the
            // computed offset is a live payload whose type
            // `lazy_is_empty_dispatch` matches by tag.
            let is_empty = unsafe {
                let offset = crate::backend::lazy_tail::LazyTail::sum_padded_sizes(
                    self.head().lazy_tail.present & tag.mask_below(),
                );
                let ptr = tail_base.add(offset);
                crate::backend::storage_schema::lazy_is_empty_dispatch(tag, ptr)
            };
            if !is_empty {
                return false;
            }
            bits &= bits - 1;
        }
        true
    }

    /// Shrink the allocation so the tail occupies the smallest size class
    /// that still fits `lazy_tail.len`. Skips the realloc when it would land
    /// in the same allocator bin (mimalloc-aware).
    pub(crate) fn lazy_shrink_to_fit(&mut self) {
        let tail_cap = self.head().lazy_tail.cap;
        let tail_len = self.head().lazy_tail.len;
        if tail_cap == 0 || tail_len == tail_cap {
            return;
        }
        let head_size = std::mem::size_of::<TaskStorageInner>();
        let target_total =
            turbo_tasks_malloc::TurboMalloc::get_bucket_size(head_size + tail_len as usize);
        let current_bin =
            turbo_tasks_malloc::TurboMalloc::get_bucket_size(head_size + tail_cap as usize);
        if target_total >= current_bin {
            return;
        }
        // SAFETY: `&mut self` excludes any outstanding `&mut TaskStorageInner`
        // reference into the allocation.
        unsafe { self.realloc_to_total(target_total) };
    }

    /// Read-only access to the head.
    #[inline]
    pub(crate) fn head(&self) -> &TaskStorageInner {
        // SAFETY: `self.ptr` points to a properly-initialized `TaskStorageInner`
        // for the lifetime of `self`.
        unsafe { self.ptr.as_ref() }
    }

    /// Mutable access to the head.
    ///
    /// # Safety
    /// Caller must not call a method that may reallocate while holding the
    /// returned reference — the realloc would invalidate it.
    #[inline]
    pub(crate) unsafe fn head_mut(&mut self) -> &mut TaskStorageInner {
        // SAFETY: see `head`; `&mut self` gives exclusive access.
        unsafe { self.ptr.as_mut() }
    }

    /// Grow the allocation so the tail has at least `min_tail_bytes`
    /// capacity. Uses `mi_good_size` to pre-round to the allocator bin.
    ///
    /// # Safety
    /// No outstanding `&mut TaskStorageInner` may exist (we relocate the
    /// allocation, which would invalidate it).
    unsafe fn grow_to(&mut self, min_tail_bytes: usize) {
        debug_assert!(min_tail_bytes > self.head().lazy_tail.cap as usize);
        let head_size = std::mem::size_of::<TaskStorageInner>();
        let target_total =
            turbo_tasks_malloc::TurboMalloc::get_bucket_size(head_size + min_tail_bytes);
        // SAFETY: caller contract.
        unsafe { self.realloc_to_total(target_total) };
    }

    /// Reallocate the underlying buffer to `new_total` bytes (head + tail),
    /// updating `self.ptr` and the head's `lazy_tail.cap`.
    ///
    /// # Safety
    /// No outstanding `&mut TaskStorageInner` may exist.
    unsafe fn realloc_to_total(&mut self, new_total: usize) {
        let head_size = std::mem::size_of::<TaskStorageInner>();
        let align = std::mem::align_of::<TaskStorageInner>();
        let old_tail_cap = self.head().lazy_tail.cap as usize;
        let old_total = head_size + old_tail_cap;
        let new_tail_cap = new_total - head_size;
        assert!(
            new_tail_cap <= u16::MAX as usize,
            "tail capacity overflow: requested {new_tail_cap}, max {}",
            u16::MAX,
        );

        // SAFETY: `old_total` was the current allocation size; the new
        // size and alignment are valid.
        let old_layout = unsafe { Layout::from_size_align_unchecked(old_total, align) };
        let new_layout = unsafe { Layout::from_size_align_unchecked(new_total, align) };
        // SAFETY: `self.ptr` was obtained from a prior `alloc(old_layout)`.
        let new_raw = unsafe { realloc(self.ptr.as_ptr() as *mut u8, old_layout, new_total) };
        if new_raw.is_null() {
            handle_alloc_error(new_layout);
        }
        // SAFETY: realloc returned non-null with `new_total` bytes available.
        self.ptr = unsafe { NonNull::new_unchecked(new_raw as *mut TaskStorageInner) };
        // SAFETY: just relocated; update the recorded capacity.
        unsafe { self.head_mut().lazy_tail.cap = new_tail_cap as u16 };
    }
}

impl Default for TaskStorage {
    fn default() -> Self {
        Self::new()
    }
}

impl Deref for TaskStorage {
    type Target = TaskStorageInner;
    #[inline]
    fn deref(&self) -> &TaskStorageInner {
        self.head()
    }
}

impl DerefMut for TaskStorage {
    #[inline]
    fn deref_mut(&mut self) -> &mut TaskStorageInner {
        // SAFETY: returning `&mut TaskStorageInner` is only invalid if the
        // caller subsequently triggers a realloc. Methods that may realloc
        // take `&mut self` (TaskStorage), which would borrow-conflict
        // with the outstanding `&mut TaskStorageInner`.
        unsafe { self.head_mut() }
    }
}

impl Drop for TaskStorage {
    fn drop(&mut self) {
        // 1. Walk `lazy_tail.present`, drop each payload via the schema's per-tag dispatch.
        let mut bits = self.head().lazy_tail.present;
        let head_size = std::mem::size_of::<TaskStorageInner>();
        while bits != 0 {
            let bit_idx = bits.trailing_zeros();
            // `bit_idx` is in `0..32` because `bits != 0`.
            let tag = Tag::new((bit_idx + 1) as u8);
            // SAFETY: `tag` is in `1..=LAZY_N` and the bytes at the
            // computed offset are a live payload whose type matches the
            // schema's tag → type mapping.
            unsafe {
                let mask_below = self.head().lazy_tail.present & tag.mask_below();
                let offset = crate::backend::lazy_tail::LazyTail::sum_padded_sizes(mask_below);
                let ptr = (self.ptr.as_ptr() as *mut u8).add(head_size).add(offset);
                lazy_drop_dispatch(tag, ptr);
            }
            bits &= bits - 1;
        }

        // 2. Clear the bitmap so `TaskStorageInner`'s field-level Drop (which we're about to
        //    trigger via `drop_in_place`) doesn't try to re-interpret the bytes.
        // SAFETY: we're about to drop the head; no outstanding borrows.
        unsafe {
            let head = self.head_mut();
            head.lazy_tail.present = 0;
            head.lazy_tail.len = 0;
        }

        // 3. Drop the head fields (Arc, Box, AutoMap, etc.).
        // SAFETY: head is initialized; we own the only reference.
        unsafe { std::ptr::drop_in_place(self.ptr.as_ptr()) };

        // 4. Dealloc the unified buffer.
        let align = std::mem::align_of::<TaskStorageInner>();
        // We zeroed `lazy_tail.cap` in step 2? No — we only cleared
        // `present` and `len`. `cap` is still valid for dealloc.
        // Actually we did NOT zero cap above. Re-read it from the head.
        // SAFETY: the head bytes are still valid POD memory for `cap`
        // even after `drop_in_place` — `drop_in_place` doesn't overwrite,
        // it just runs destructors that don't touch primitive fields.
        let tail_cap = unsafe { (*self.ptr.as_ptr()).lazy_tail.cap as usize };
        let total = std::mem::size_of::<TaskStorageInner>() + tail_cap;
        // SAFETY: we allocated with this layout (`total`, `align`).
        let layout = unsafe { Layout::from_size_align_unchecked(total, align) };
        // SAFETY: `self.ptr` was obtained from a prior alloc with this
        // layout.
        unsafe { dealloc(self.ptr.as_ptr() as *mut u8, layout) };
    }
}

impl fmt::Debug for TaskStorage {
    /// Pretty-prints both the inline head and each present lazy variant by
    /// name and value. Each lazy payload is rendered through its own
    /// `Debug` impl via the schema-emitted dispatch.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let head = self.head();
        let mut map = f.debug_map();
        // Inline head: format it as a single nested `Debug` so the inline
        // fields keep their derived layout.
        map.entry(&"inline", &head.inline);
        map.entry(&"flags", &head.flags);

        // Walk every present lazy variant. Each arm in `lazy_debug_dispatch`
        // adds its own `(field_name, &value)` entry to `map`.
        let mut bits = head.lazy_tail.present;
        let tail_base = self.tail_ptr();
        while bits != 0 {
            let bit_idx = bits.trailing_zeros();
            // `bit_idx` is in `0..32` because `bits != 0`.
            let tag = Tag::new((bit_idx + 1) as u8);
            // SAFETY: `tag` is in `1..=LAZY_N` (its bit was set in
            // `present`), and the byte at the computed offset is a live
            // payload whose type the schema's `lazy_debug_dispatch` matches
            // by tag.
            unsafe {
                let offset = crate::backend::lazy_tail::LazyTail::sum_padded_sizes(
                    head.lazy_tail.present & tag.mask_below(),
                );
                let ptr = tail_base.add(offset);
                crate::backend::storage_schema::lazy_debug_dispatch(tag, ptr, &mut map);
            }
            bits &= bits - 1;
        }

        map.finish()
    }
}

impl ShrinkToFit for TaskStorage {
    fn shrink_to_fit(&mut self) {
        // First let the inline-field shrinks run via the head (`TaskStorageInner`
        // has its own `ShrinkToFit` derive that visits the inline
        // collections). The macro-emitted `cleanup_after_execution`
        // separately calls those — this only matters when someone calls
        // shrink_to_fit on the box directly.
        // SAFETY: shrink_to_fit on inline collection fields doesn't
        // reallocate the head; only the tail-buffer realloc below does.
        unsafe { self.head_mut().shrink_to_fit() };

        // Then shrink the tail buffer to fit its current contents.
        self.lazy_shrink_to_fit();
    }
}
