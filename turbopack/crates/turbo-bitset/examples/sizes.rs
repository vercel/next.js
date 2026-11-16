//! Measures the in-memory storage and serialized size of `Bitset` for the inputs of the benchmarks
//! (see `benches/common/inputs.rs`).
//!
//! Storage is measured with a counting global allocator: the bytes requested from the allocator
//! by the set (its heap allocations), plus `size_of` the set itself. Allocator bookkeeping and
//! size-class rounding are not included.
//!
//! Serialized sizes are measured by actually encoding (and decoding again) with the writer, reader
//! and config Turbopack persists with (`turbo_bincode`, bincode's standard config), using
//! `Bitset`'s own encoding (the trimmed bitmap bytes, or the delta-encoded list of bits if that is
//! below 80% of the bitmap's size).
//!
//! Run with `cargo run --release -p turbo-bitset --example sizes`. Prints CSV.

#[cfg(not(target_pointer_width = "64"))]
compile_error!("this measurement assumes 64-bit `usize` blocks");

#[path = "../benches/common/inputs.rs"]
mod inputs;

use std::{
    alloc::{GlobalAlloc, Layout, System},
    sync::atomic::{AtomicUsize, Ordering},
};

use rand::seq::SliceRandom;
use turbo_bincode::{TURBO_BINCODE_CONFIG, turbo_bincode_decode, turbo_bincode_encode};
use turbo_bitset::Bitset;

use self::inputs::{SmallRng, inputs, rng};

struct Counting;

static ALLOCATED: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOCATED.fetch_add(layout.size(), Ordering::Relaxed);
        unsafe { System.alloc(layout) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        ALLOCATED.fetch_add(layout.size(), Ordering::Relaxed);
        unsafe { System.alloc_zeroed(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        ALLOCATED.fetch_sub(layout.size(), Ordering::Relaxed);
        unsafe { System.dealloc(ptr, layout) }
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        ALLOCATED.fetch_add(new_size, Ordering::Relaxed);
        ALLOCATED.fetch_sub(layout.size(), Ordering::Relaxed);
        unsafe { System.realloc(ptr, layout, new_size) }
    }
}

#[global_allocator]
static GLOBAL: Counting = Counting;

/// Heap bytes allocated by `build` that are still live when it returns, plus the inline size.
fn storage<T>(build: impl FnOnce() -> T) -> (T, usize) {
    let before = ALLOCATED.load(Ordering::Relaxed);
    let value = build();
    let after = ALLOCATED.load(Ordering::Relaxed);
    (value, after - before + size_of::<T>())
}

/// Drops `value` and checks that this frees exactly the heap bytes `storage` measured for it.
fn check_freed<T>(value: T, measured: usize) {
    let before = ALLOCATED.load(Ordering::Relaxed);
    drop(value);
    let freed = before - ALLOCATED.load(Ordering::Relaxed);
    assert_eq!(freed + size_of::<T>(), measured, "unbalanced allocation");
}

fn shuffled(rng: &mut SmallRng, bits: &[u32]) -> Vec<u32> {
    let mut bits = bits.to_vec();
    bits.shuffle(rng);
    bits
}

fn main() {
    println!(
        "input,universe,bits,density_ppm,bitset_sorted,bitset_random,bitset_words,bitset_ser,\
         bitset_form"
    );
    let mut rng = rng(7);
    for input in inputs() {
        let bits = &input.bits;
        let random_order = shuffled(&mut rng, bits);

        let (bitset_sorted, bitset_sorted_bytes) =
            storage(|| bits.iter().copied().collect::<Bitset>());
        let (bitset_random, bitset_random_bytes) = storage(|| {
            let mut set = Bitset::new();
            for &bit in &random_order {
                set.insert(bit);
            }
            set
        });
        assert_eq!(bitset_sorted, bitset_random);
        assert!(bitset_sorted.iter().eq(bits.iter().copied()));

        // The block-aligned word range of the set: from the lowest to the highest word.
        let words = match (bits.first(), bits.last()) {
            (Some(&first), Some(&last)) => (last / 64 - first / 64 + 1) as usize,
            _ => 0,
        };
        let bitset_ser = turbo_bincode_encode(&bitset_sorted).unwrap();
        let decoded: Bitset = turbo_bincode_decode(&bitset_ser).unwrap();
        assert_eq!(decoded, bitset_sorted);
        // The sign of the decoded header tells the form.
        let header: i64 = bincode::decode_from_slice(&bitset_ser, TURBO_BINCODE_CONFIG)
            .unwrap()
            .0;
        let bitset_form = match header {
            0 => "empty",
            ..0 => "list",
            _ => "bitmap",
        };

        println!(
            "{},{},{},{},{bitset_sorted_bytes},{bitset_random_bytes},{words},{},{bitset_form}",
            input.name,
            input.universe,
            bits.len(),
            bits.len() as u64 * 1_000_000 / input.universe as u64,
            bitset_ser.len(),
        );
        check_freed(bitset_sorted, bitset_sorted_bytes);
        check_freed(bitset_random, bitset_random_bytes);
    }
}
