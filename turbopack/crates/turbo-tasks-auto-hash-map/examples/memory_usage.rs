//! Prints the memory used by `AutoSet`, `hashbrown::HashSet`, `AutoIndexSet` and
//! `indexmap::IndexSet` after inserting `n` keys, for the sizes of the `auto_set` benchmark plus a
//! few more small ones, with the same keys as the benchmark.
//!
//! The memory of a set is `size_of` the set itself plus the heap bytes it holds, measured with a
//! counting global allocator. The sets are built by inserting the keys one by one. `bytes` is
//! measured right after that, so it includes the spare capacity left by growing. `shrunk_bytes` is
//! measured after a following `shrink_to_fit()` on the same set; for the auto sets this also
//! converts a small map back into the list.
//!
//! The output is CSV (`set,n,bytes,shrunk_bytes`) on stdout:
//!
//! ```sh
//! cargo run --release -p auto-hash-map --example memory_usage
//! ```

use std::{
    alloc::{GlobalAlloc, Layout, System},
    hash::BuildHasherDefault,
    hint::black_box,
    sync::atomic::{AtomicUsize, Ordering},
};

use auto_hash_map::{AutoIndexSet, AutoSet};
use rustc_hash::FxHasher;

type FxBuildHasher = BuildHasherDefault<FxHasher>;

/// Forwards to the system allocator and tracks the number of live requested bytes.
struct CountingAlloc;

static LIVE_BYTES: AtomicUsize = AtomicUsize::new(0);

// SAFETY: All calls are forwarded unchanged to `System`; only a counter is updated besides.
unsafe impl GlobalAlloc for CountingAlloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        // SAFETY: Forwarded with the caller's guarantees.
        let ptr = unsafe { System.alloc(layout) };
        if !ptr.is_null() {
            LIVE_BYTES.fetch_add(layout.size(), Ordering::Relaxed);
        }
        ptr
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        // SAFETY: Forwarded with the caller's guarantees.
        let ptr = unsafe { System.alloc_zeroed(layout) };
        if !ptr.is_null() {
            LIVE_BYTES.fetch_add(layout.size(), Ordering::Relaxed);
        }
        ptr
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        // SAFETY: Forwarded with the caller's guarantees.
        unsafe { System.dealloc(ptr, layout) };
        LIVE_BYTES.fetch_sub(layout.size(), Ordering::Relaxed);
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        // SAFETY: Forwarded with the caller's guarantees.
        let new_ptr = unsafe { System.realloc(ptr, layout, new_size) };
        if !new_ptr.is_null() {
            LIVE_BYTES.fetch_sub(layout.size(), Ordering::Relaxed);
            LIVE_BYTES.fetch_add(new_size, Ordering::Relaxed);
        }
        new_ptr
    }
}

#[global_allocator]
static ALLOC: CountingAlloc = CountingAlloc;

/// The sizes of the `auto_set` benchmark, plus 3, 5, 6, 7 and 12.
const SIZES: [usize; 21] = [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    12,
    16,
    24,
    32,
    48,
    64,
    96,
    128,
    1024,
    16 * 1024,
    128 * 1024,
    1024 * 1024,
];

/// Same keys as the `auto_set` benchmark.
fn key(i: usize) -> u64 {
    (i as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)
}

trait MeasuredSet: Default {
    const NAME: &'static str;

    fn insert(&mut self, key: u64);
    fn len(&self) -> usize;
    fn shrink_to_fit(&mut self);
}

macro_rules! impl_measured_set {
    ($ty:ty, $name:literal) => {
        impl MeasuredSet for $ty {
            const NAME: &'static str = $name;

            fn insert(&mut self, key: u64) {
                <$ty>::insert(self, key);
            }
            fn len(&self) -> usize {
                <$ty>::len(self)
            }
            fn shrink_to_fit(&mut self) {
                <$ty>::shrink_to_fit(self);
            }
        }
    };
}

impl_measured_set!(AutoSet<u64>, "AutoSet");
impl_measured_set!(hashbrown::HashSet<u64, FxBuildHasher>, "HashSet");
impl_measured_set!(AutoIndexSet<u64>, "AutoIndexSet");
impl_measured_set!(indexmap::IndexSet<u64, FxBuildHasher>, "IndexSet");

/// Returns the bytes used by a set of type `S` after inserting `n` keys, and after a following
/// `shrink_to_fit()`.
fn measure<S: MeasuredSet>(n: usize) -> (usize, usize) {
    let before = LIVE_BYTES.load(Ordering::Relaxed);
    let mut set = S::default();
    for i in 0..n {
        set.insert(key(i));
    }
    assert_eq!(set.len(), n);
    let heap = LIVE_BYTES.load(Ordering::Relaxed) - before;
    set.shrink_to_fit();
    assert_eq!(set.len(), n);
    let shrunk_heap = LIVE_BYTES.load(Ordering::Relaxed) - before;
    drop(black_box(set));
    (size_of::<S>() + heap, size_of::<S>() + shrunk_heap)
}

fn print<S: MeasuredSet>(n: usize) {
    let (bytes, shrunk_bytes) = measure::<S>(n);
    println!("{},{n},{bytes},{shrunk_bytes}", S::NAME);
}

fn main() {
    println!("set,n,bytes,shrunk_bytes");
    for n in SIZES {
        print::<AutoSet<u64>>(n);
        print::<hashbrown::HashSet<u64, FxBuildHasher>>(n);
        print::<AutoIndexSet<u64>>(n);
        print::<indexmap::IndexSet<u64, FxBuildHasher>>(n);
    }
}
