//! Prints the memory used by `AutoSet`, `hashbrown::HashSet`, `AutoIndexSet` and
//! `indexmap::IndexSet` after inserting `n` keys, for the same sizes and keys as the `auto_set`
//! benchmark.
//!
//! The memory of a set is `size_of` the set itself plus the heap bytes it holds, measured with a
//! counting global allocator. The sets are built by inserting the keys one by one, without
//! `shrink_to_fit`, so this includes the spare capacity left by growing.
//!
//! The output is CSV (`set,n,bytes`) on stdout:
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

/// Same sizes as the `auto_set` benchmark.
const SIZES: [usize; 16] = [
    0,
    1,
    2,
    4,
    8,
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
        }
    };
}

impl_measured_set!(AutoSet<u64>, "AutoSet");
impl_measured_set!(hashbrown::HashSet<u64, FxBuildHasher>, "HashSet");
impl_measured_set!(AutoIndexSet<u64>, "AutoIndexSet");
impl_measured_set!(indexmap::IndexSet<u64, FxBuildHasher>, "IndexSet");

/// Returns the bytes used by a set of type `S` after inserting `n` keys.
fn measure<S: MeasuredSet>(n: usize) -> usize {
    let before = LIVE_BYTES.load(Ordering::Relaxed);
    let mut set = S::default();
    for i in 0..n {
        set.insert(key(i));
    }
    assert_eq!(set.len(), n);
    let heap = LIVE_BYTES.load(Ordering::Relaxed) - before;
    drop(black_box(set));
    size_of::<S>() + heap
}

fn print<S: MeasuredSet>(n: usize) {
    println!("{},{n},{}", S::NAME, measure::<S>(n));
}

fn main() {
    println!("set,n,bytes");
    for n in SIZES {
        print::<AutoSet<u64>>(n);
        print::<hashbrown::HashSet<u64, FxBuildHasher>>(n);
        print::<AutoIndexSet<u64>>(n);
        print::<indexmap::IndexSet<u64, FxBuildHasher>>(n);
    }
}
