//! The allocator that [`crate::TurboMalloc`] wraps.
//!
//! Every function also returns the size to account for, so that `TurboMalloc` can keep its
//! allocation counters up to date.

#[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
mod platform {
    //! mimalloc, through its size-returning entry points (`mi_umalloc`, `mi_ufree`, ...).
    //!
    //! These report the size of the block they allocate or free as a by-product. That saves the
    //! extra page lookup a separate `mi_usable_size` call would cost on every operation.
    //!
    //! All of them report `mi_page_block_size`. Never mix in `mi_usable_size`: for over-aligned
    //! allocations it can be smaller than the block size, which would unbalance the counters.

    use std::{alloc::Layout, ptr};

    use mimalloc::sys;

    /// Mirrors `MI_MAX_ALIGN_SIZE`: the alignment `mi_malloc` guarantees for every allocation.
    const MAX_ALIGN_SIZE: usize = 16;

    /// Whether a plain (unaligned) mimalloc allocation of `size` bytes is already `align`-aligned.
    #[inline(always)]
    fn is_malloc_aligned(size: usize, align: usize) -> bool {
        align <= MAX_ALIGN_SIZE && align <= size
    }

    #[inline]
    pub unsafe fn alloc(layout: Layout) -> (*mut u8, usize) {
        let size = layout.size();
        let mut block_size = 0;
        let ptr = unsafe {
            if !is_malloc_aligned(size, layout.align()) {
                sys::mi_umalloc_aligned(size, layout.align(), &mut block_size)
            } else if size <= sys::MI_SMALL_SIZE_MAX {
                sys::mi_umalloc_small(size, &mut block_size)
            } else {
                sys::mi_umalloc(size, &mut block_size)
            }
        };
        (ptr.cast(), block_size)
    }

    #[inline]
    pub unsafe fn alloc_zeroed(layout: Layout) -> (*mut u8, usize) {
        let size = layout.size();
        let mut block_size = 0;
        let ptr = unsafe {
            if !is_malloc_aligned(size, layout.align()) {
                sys::mi_uzalloc_aligned(size, layout.align(), &mut block_size)
            } else if size <= sys::MI_SMALL_SIZE_MAX {
                sys::mi_uzalloc_small(size, &mut block_size)
            } else {
                sys::mi_ucalloc(1, size, &mut block_size)
            }
        };
        (ptr.cast(), block_size)
    }

    #[inline]
    pub unsafe fn dealloc(ptr: *mut u8, _layout: Layout) -> usize {
        let mut block_size = 0;
        unsafe { sys::mi_ufree(ptr.cast(), &mut block_size) };
        block_size
    }

    /// Returns the new pointer, the old block size and the new block size. The sizes are only
    /// meaningful if the pointer is non-null.
    #[inline]
    pub unsafe fn realloc(
        ptr: *mut u8,
        layout: Layout,
        new_size: usize,
    ) -> (*mut u8, usize, usize) {
        let mut old_block_size = 0;
        let mut new_block_size = 0;
        if is_malloc_aligned(new_size, layout.align()) {
            let ret = unsafe {
                sys::mi_urealloc(
                    ptr.cast(),
                    new_size,
                    &mut old_block_size,
                    &mut new_block_size,
                )
            };
            return (ret.cast(), old_block_size, new_block_size);
        }
        // There is no size-returning `mi_realloc_aligned`, so reallocate over-aligned memory by
        // hand. This is rare.
        let ret = unsafe { sys::mi_umalloc_aligned(new_size, layout.align(), &mut new_block_size) };
        if !ret.is_null() {
            unsafe {
                ptr::copy_nonoverlapping(ptr, ret.cast(), layout.size().min(new_size));
                sys::mi_ufree(ptr.cast(), &mut old_block_size);
            }
        }
        (ret.cast(), old_block_size, new_block_size)
    }
}

#[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri))))]
mod platform {
    //! The system allocator. It can't report block sizes, so the requested sizes are used instead.

    use std::alloc::{GlobalAlloc, Layout, System};

    #[inline]
    pub unsafe fn alloc(layout: Layout) -> (*mut u8, usize) {
        (unsafe { System.alloc(layout) }, layout.size())
    }

    #[inline]
    pub unsafe fn alloc_zeroed(layout: Layout) -> (*mut u8, usize) {
        (unsafe { System.alloc_zeroed(layout) }, layout.size())
    }

    #[inline]
    pub unsafe fn dealloc(ptr: *mut u8, layout: Layout) -> usize {
        unsafe { System.dealloc(ptr, layout) };
        layout.size()
    }

    #[inline]
    pub unsafe fn realloc(
        ptr: *mut u8,
        layout: Layout,
        new_size: usize,
    ) -> (*mut u8, usize, usize) {
        (
            unsafe { System.realloc(ptr, layout, new_size) },
            layout.size(),
            new_size,
        )
    }
}

pub use platform::{alloc, alloc_zeroed, dealloc, realloc};
