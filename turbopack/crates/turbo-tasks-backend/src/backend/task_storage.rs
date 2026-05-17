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
    mem::MaybeUninit,
    ops::{ControlFlow, Deref, DerefMut},
    ptr::NonNull,
};

use turbo_tasks::ShrinkToFit;

use crate::backend::{
    lazy_tail::Tag,
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

// The tail buffer starts immediately after the head, so the head's alignment
// must satisfy the largest per-payload alignment in the schema
// (`LAZY_MAX_ALIGN`), and the head's size must be a multiple of that alignment
// so every payload offset is aligned. These are compile-time invariants — if a
// future schema change violates one, the build fails rather than producing a
// release binary that reads misaligned payloads.
const _: () = assert!(
    std::mem::align_of::<TaskStorageInner>() >= LAZY_MAX_ALIGN,
    "TaskStorageInner alignment must be ≥ LAZY_MAX_ALIGN so the tail starts at a valid offset for \
     every payload",
);
const _: () = assert!(
    std::mem::size_of::<TaskStorageInner>().is_multiple_of(LAZY_MAX_ALIGN),
    "size_of::<TaskStorageInner>() must be a multiple of LAZY_MAX_ALIGN so the tail base is \
     aligned for every payload",
);

impl TaskStorage {
    /// Allocate a fresh `TaskStorage` with no lazy payloads installed.
    /// The initial allocation is sized to the head, rounded up to the
    /// nearest mimalloc bucket — any slack inside that bucket becomes
    /// initial tail capacity, so the first few lazy installs typically
    /// don't trigger a grow.
    pub fn new() -> Self {
        Self::with_tail_capacity(0)
    }

    /// Allocate a fresh `TaskStorage` with the given initial tail
    /// capacity. Useful when the caller knows several lazy fields will be
    /// installed (e.g. decode) and wants to skip the small-grow steps.
    ///
    /// The requested tail capacity is rounded through `mi_good_size` so
    /// the recorded `lazy_tail.cap` matches the mimalloc bucket that was
    /// actually reserved — the first install can use the full bucket
    /// without triggering an immediate realloc. This mirrors the rounding
    /// `grow_to` applies on subsequent grows, so `lazy_shrink_to_fit`'s
    /// `mi_good_size(head + cap)` check sees a consistent value.
    pub fn with_tail_capacity(tail_cap: u16) -> Self {
        let head_size = std::mem::size_of::<TaskStorageInner>();
        let total = Self::good_total_for_min_tail(tail_cap as usize);
        let actual_cap = (total - head_size) as u16;
        let layout = Layout::from_size_align(total, std::mem::align_of::<TaskStorageInner>())
            .expect("TaskStorage layout: size+align always valid");
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
            (*head_ptr).lazy_tail.cap = actual_cap;
        }
        Self {
            // SAFETY: `head_ptr` is non-null (we checked above).
            ptr: unsafe { NonNull::new_unchecked(head_ptr) },
        }
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
    /// The element type is `MaybeUninit<u8>` because padding bytes
    /// between packed payloads (when `size_of::<T>() < LAZY_PADDED_SIZE`)
    /// are legitimately uninitialized — the `ptr::copy` shifts in
    /// `LazyTail::insert_unchecked` / `take` must be able to copy those
    /// bytes without UB. A `*const u8` would assert "every byte is
    /// initialized", which doesn't hold for the tail buffer.
    ///
    /// # Safety
    /// The returned pointer is valid for `head.lazy_tail.cap` bytes. Reads
    /// of the payload region must respect `head.lazy_tail.present` — only
    /// present payloads have valid initialized bytes for the schema type.
    #[inline]
    pub(crate) fn tail_ptr(&self) -> *const MaybeUninit<u8> {
        let head_size = std::mem::size_of::<TaskStorageInner>();
        // SAFETY: the allocation has at least `head_size + cap` bytes, so
        // adding `head_size` to the head pointer is in-bounds.
        unsafe { (self.ptr.as_ptr() as *const MaybeUninit<u8>).add(head_size) }
    }

    /// Mutable pointer to the first byte of the tail. See [`Self::tail_ptr`]
    /// for the `MaybeUninit<u8>` element type rationale.
    #[inline]
    pub(crate) fn tail_ptr_mut(&mut self) -> *mut MaybeUninit<u8> {
        let head_size = std::mem::size_of::<TaskStorageInner>();
        // SAFETY: see `tail_ptr`.
        unsafe { (self.ptr.as_ptr() as *mut MaybeUninit<u8>).add(head_size) }
    }

    /// Insert a payload for `tag` and return a mutable reference to it.
    /// Grows the allocation if needed. The variant must not already be
    /// present.
    ///
    /// The `tag` is a `Tag<T>`, so the schema-emitted tag/type
    /// pairing is enforced at the type system: passing a tag whose
    /// schema-declared payload type differs from `T` will not compile.
    ///
    /// # Safety
    /// The variant must not already be present (debug-asserted).
    pub(crate) unsafe fn lazy_insert<T: 'static>(&mut self, tag: Tag<T>, value: T) -> &mut T {
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
        // SAFETY: `Tag<T>` guarantees `T` matches the schema's payload
        // type for `tag`; capacity is sufficient. `tail_base` is derived
        // from `self.ptr` (full-allocation provenance) BEFORE we reborrow
        // as `&mut LazyTail` so that under Stacked Borrows the raw pointer
        // sits below the typed reborrow on the parent's stack. The
        // reborrow only retags the head bytes (sizeof::<TaskStorageInner>),
        // which are disjoint from the tail bytes that `insert_unchecked`
        // writes through `tail_base` — so the typed reborrow doesn't
        // invalidate the raw pointer's access to the tail. The returned
        // `&mut T` borrows from `self` through `head_mut`.
        unsafe {
            let tail_base = self.tail_ptr_mut();
            self.head_mut()
                .lazy_tail
                .insert_unchecked(tag, value, tail_base)
        }
    }

    /// Replace the payload for `tag` with `value`. If absent, inserts the
    /// new value (may grow). Returns the previous payload if any.
    ///
    /// Uses a single `offset_of` lookup to decide between the in-place
    /// replace and grow-and-insert paths. The previous shape did
    /// `has(tag)` (popcount #1) then dispatched into `replace_in_place`
    /// (popcount #2 in `offset_of`) or `lazy_insert` (popcount #3 in
    /// `offset_for`); fusing the lookup here saves one popcount on every
    /// `set_<lazy field>` call.
    ///
    /// Safe: `Tag<T>` fixes the payload type, the pointer comes from
    /// `self.ptr` (full-allocation provenance), and `&mut self` gives
    /// exclusive access.
    pub(crate) fn lazy_replace<T: 'static>(&mut self, tag: Tag<T>, value: T) -> Option<T> {
        match self.lazy_tail.offset_of(tag) {
            Some(offset) => {
                // SAFETY: `offset_of` returned `Some`, so the slot at
                // `offset` holds an initialized `T` written by a prior
                // `lazy_insert`. `tail_base` shares provenance with the
                // full allocation; the disjoint head/tail byte ranges
                // mean the typed `&mut LazyTail` reborrow doesn't
                // invalidate raw access to the tail (see `lazy_insert`).
                unsafe {
                    let tail_base = self.tail_ptr_mut();
                    let ptr = tail_base.add(offset).cast::<T>();
                    let old = std::ptr::read(ptr);
                    std::ptr::write(ptr, value);
                    Some(old)
                }
            }
            None => {
                // SAFETY: variant confirmed absent.
                unsafe { self.lazy_insert(tag, value) };
                None
            }
        }
    }

    /// Get-or-create: if the variant is absent, insert `Default::default()`
    /// (which may grow), then return a mutable reference to the payload.
    pub(crate) fn lazy_get_or_create<T: Default + 'static>(&mut self, tag: Tag<T>) -> &mut T {
        // Compute offset once. `offset_of` returns `Some(offset)` for
        // present variants and `None` for absent ones — checking the
        // `Option` is one branch and saves the second `has(tag)` +
        // `offset_for(tag)` scan that the previous `has → find_mut → insert`
        // path performed.
        if let Some(offset) = self.lazy_tail.offset_of(tag) {
            // SAFETY: `offset_of` returned `Some`, so the slot at
            // `offset` is an initialized `T`. Provenance / Stacked
            // Borrows argument matches `lazy_replace`.
            unsafe {
                let tail_base = self.tail_ptr_mut();
                &mut *tail_base.add(offset).cast::<T>()
            }
        } else {
            // SAFETY: variant confirmed absent.
            unsafe { self.lazy_insert(tag, T::default()) }
        }
    }

    /// Get a typed reference to a present lazy payload.
    #[inline]
    pub(crate) fn lazy_find<T: 'static>(&self, tag: Tag<T>) -> Option<&T> {
        let tail_base = self.tail_ptr();
        // SAFETY: `Tag<T>` fixes the payload type; the slot is either
        // present (and was written as `T` by `lazy_insert`) or absent
        // (in which case `find` returns `None`). `tail_base` derives
        // from `self.ptr` with full-allocation provenance.
        unsafe { self.head().lazy_tail.find(tag, tail_base) }
    }

    /// Get a typed mutable reference to a present lazy payload.
    #[inline]
    pub(crate) fn lazy_find_mut<T: 'static>(&mut self, tag: Tag<T>) -> Option<&mut T> {
        let tail_base = self.tail_ptr_mut();
        // SAFETY: see `lazy_find`. `&mut self` gives exclusive access.
        unsafe { self.head_mut().lazy_tail.find_mut(tag, tail_base) }
    }

    /// Take a present lazy payload, removing it. Returns `None` if absent.
    pub(crate) fn lazy_take<T: 'static>(&mut self, tag: Tag<T>) -> Option<T> {
        let tail_base = self.tail_ptr_mut();
        // SAFETY: see `lazy_find`. Take only shrinks the tail.
        unsafe { self.head_mut().lazy_tail.take(tag, tail_base) }
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
        let tail_base = self.tail_ptr();
        // SAFETY: `tail_base` points to this storage's tail bytes with
        // full-allocation provenance; `lazy_is_empty_dispatch` reads each
        // payload as the type the schema assigned to that tag.
        let walk = unsafe {
            self.head()
                .lazy_tail
                .try_for_each_present(tail_base, |tag, ptr| {
                    if tag.bit() & mask == 0 {
                        // Tag is present in the tail but excluded by `mask` —
                        // skip without inspecting the payload.
                        return ControlFlow::Continue(());
                    }
                    if crate::backend::storage_schema::lazy_is_empty_dispatch(tag, ptr) {
                        ControlFlow::Continue(())
                    } else {
                        ControlFlow::Break(())
                    }
                })
        };
        walk.is_continue()
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

    /// Round a request of `head + min_tail_bytes` total bytes through
    /// `mi_good_size` and then clamp the resulting tail capacity to
    /// `u16::MAX` so it fits in `LazyTail::cap`. Used by both `grow_to`
    /// and `with_tail_capacity` so the initial allocation and every
    /// subsequent grow use the same rounding rule.
    #[inline]
    fn good_total_for_min_tail(min_tail_bytes: usize) -> usize {
        let head_size = std::mem::size_of::<TaskStorageInner>();
        // `min_tail_bytes` is asserted ≤ u16::MAX by the caller path, but
        // `mi_good_size` can round upward by a non-trivial fraction (it has
        // to land in an allocator bin). At the upper end of the u16 range
        // that rounding can push the resulting tail past `u16::MAX`. We
        // can't honor that — `cap` is a u16 — so clamp here. mimalloc still
        // gives us a full bucket; we just won't *use* the bytes past the
        // u16 ceiling.
        let target_total =
            turbo_tasks_malloc::TurboMalloc::get_bucket_size(head_size + min_tail_bytes);
        let max_total = head_size + u16::MAX as usize;
        target_total.min(max_total)
    }

    /// Pre-grow the tail to fit `min_tail_bytes` total before a batch
    /// of `lazy_insert`s — used by the macro-generated decode path to
    /// avoid N reallocs as N payloads install. Wraps the private
    /// `grow_to` (which has the same contract) with a stable
    /// `pub(crate)` symbol so the macro doesn't have to depend on
    /// private impl details.
    ///
    /// # Safety
    /// Same as [`Self::grow_to`]: no outstanding `&mut TaskStorageInner`
    /// reference may exist when this returns, because the realloc
    /// relocates the buffer.
    #[inline]
    pub(crate) unsafe fn grow_to_for_decode(&mut self, min_tail_bytes: usize) {
        // SAFETY: forwarded caller contract.
        unsafe { self.grow_to(min_tail_bytes) }
    }

    /// Grow the allocation so the tail has at least `min_tail_bytes`
    /// capacity. Uses `mi_good_size` to pre-round to the allocator bin.
    ///
    /// # Safety
    /// No outstanding `&mut TaskStorageInner` may exist (we relocate the
    /// allocation, which would invalidate it).
    unsafe fn grow_to(&mut self, min_tail_bytes: usize) {
        debug_assert!(min_tail_bytes > self.head().lazy_tail.cap as usize);
        // Schema invariant: total padded payload size fits in u16. Callers
        // that lazy-install only schema-emitted tags can never exceed this;
        // we assert to catch a future schema overflow loudly.
        assert!(
            min_tail_bytes <= u16::MAX as usize,
            "lazy tail capacity request {min_tail_bytes} exceeds u16::MAX; the schema's total \
             padded payload size has overflowed",
        );
        let target_total = Self::good_total_for_min_tail(min_tail_bytes);
        // SAFETY: caller contract.
        unsafe { self.realloc_to_total(target_total) };
    }

    /// Reallocate the underlying buffer to `new_total` bytes (head + tail),
    /// updating `self.ptr` and the head's `lazy_tail.cap`.
    ///
    /// # Safety
    /// No outstanding `&mut TaskStorageInner` may exist. `new_total` must
    /// be `head_size + tail_cap` where `tail_cap <= u16::MAX` — `grow_to`
    /// and `lazy_shrink_to_fit` are responsible for that clamp; this
    /// function debug_asserts it.
    unsafe fn realloc_to_total(&mut self, new_total: usize) {
        let head_size = std::mem::size_of::<TaskStorageInner>();
        let align = std::mem::align_of::<TaskStorageInner>();
        let old_tail_cap = self.head().lazy_tail.cap as usize;
        let old_total = head_size + old_tail_cap;
        let new_tail_cap = new_total - head_size;
        debug_assert!(
            new_tail_cap <= u16::MAX as usize,
            "realloc_to_total invariant violated: caller must clamp tail capacity to u16::MAX \
             (got {new_tail_cap})",
        );

        let old_layout = Layout::from_size_align(old_total, align)
            .expect("TaskStorage old layout: size+align always valid");
        let new_layout = Layout::from_size_align(new_total, align)
            .expect("TaskStorage new layout: size+align always valid");
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
    /// # Panics during drop
    ///
    /// If a payload's destructor (invoked through `lazy_drop_dispatch` in
    /// step 1) panics, the unwind propagates out of `drop` and steps 2/3
    /// are skipped — meaning the head fields are *not* dropped, the buffer
    /// is *not* freed, and any payloads at higher tags than the panicking
    /// one are *not* run. Lower-tag payloads dropped before the panic are
    /// gone. This is the standard Rust drop-on-panic behavior (no
    /// `catch_unwind` in destructors); we accept it because payload
    /// destructors are written by schema authors and expected to be
    /// panic-free.
    fn drop(&mut self) {
        // Snapshot `cap` and `present` while the head is still a live
        // `TaskStorageInner`; after `drop_in_place` we never reborrow it.
        let tail_cap = self.head().lazy_tail.cap as usize;
        let head_size = std::mem::size_of::<TaskStorageInner>();
        let present = self.head().lazy_tail.present;

        // 1. Walk every present tag, run the per-tag drop dispatch on its payload. Skipped entirely
        //    for tasks whose lazy tail is empty — transient leaves and freshly-allocated entries
        //    hit this path constantly and don't need the for_each scaffolding.
        if present != 0 {
            let tail_base = self.tail_ptr_mut();
            // SAFETY: `tail_base` points to this storage's tail bytes with
            // full-allocation provenance. The iterator hands back
            // `*const MaybeUninit<u8>`; we cast to `*mut MaybeUninit<u8>`
            // because `tail_base` itself was derived from
            // `self.tail_ptr_mut()` (a mut-rooted raw pointer), and the
            // for_each closure runs sequentially under `FnMut`, so no two
            // payloads are ever live as `&mut` simultaneously.
            unsafe {
                self.head()
                    .lazy_tail
                    .for_each_present(tail_base, |tag, ptr| {
                        lazy_drop_dispatch(tag, ptr as *mut MaybeUninit<u8>)
                    });
            }
        }

        // 2. Drop the head fields (Arc, Box, AutoMap, etc.). `LazyTail::drop` is a no-op — payload
        //    lifecycle is owned by `TaskStorage`, which has already run step 1.
        // SAFETY: head is initialized; we own the only reference.
        unsafe { std::ptr::drop_in_place(self.ptr.as_ptr()) };

        // 3. Dealloc the unified buffer. `self.ptr` is only used as a `*mut u8` for `dealloc`; we
        //    never reborrow the dropped `TaskStorageInner`.
        let align = std::mem::align_of::<TaskStorageInner>();
        let total = head_size + tail_cap;
        let layout = Layout::from_size_align(total, align)
            .expect("TaskStorage dealloc layout: size+align always valid");
        // SAFETY: `self.ptr` was obtained from a prior alloc with this layout.
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
        let tail_base = self.tail_ptr();
        // SAFETY: `tail_base` points to this storage's tail bytes with
        // full-allocation provenance; `lazy_debug_dispatch` reads each
        // payload as the type the schema assigned to that tag.
        unsafe {
            head.lazy_tail.for_each_present(tail_base, |tag, ptr| {
                crate::backend::storage_schema::lazy_debug_dispatch(tag, ptr, &mut map);
            });
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
