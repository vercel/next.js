use std::alloc::{GlobalAlloc, Layout};

/// Turbo's preferred global allocator. This is a new type instead of a type
/// alias because you can't use type aliases to instantiate unit types (E0423).
pub struct TurboMalloc;

#[cfg(not(all(target_os = "linux", target_arch = "aarch64")))]
unsafe impl GlobalAlloc for TurboMalloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        mimalloc::MiMalloc.alloc(layout)
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        mimalloc::MiMalloc.dealloc(ptr, layout)
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        mimalloc::MiMalloc.alloc_zeroed(layout)
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        mimalloc::MiMalloc.realloc(ptr, layout, new_size)
    }
}

#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
unsafe impl GlobalAlloc for TurboMalloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        std::alloc::System.alloc(layout)
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        std::alloc::System.dealloc(ptr, layout)
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        std::alloc::System.alloc_zeroed(layout)
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        std::alloc::System.realloc(ptr, layout, new_size)
    }
}
