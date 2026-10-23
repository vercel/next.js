//! Measures the in-memory storage and serialized size of `Bitset` and `RoaringBitmap` for the
//! inputs of the benchmarks (see `benches/common/inputs.rs`).
//!
//! Storage is measured with a counting global allocator: the bytes requested from the allocator
//! by the set (its heap allocations), plus `size_of` the set itself. Allocator bookkeeping and
//! size-class rounding are not included.
//!
//! Serialized sizes are measured by actually encoding (and decoding again) with the writer, reader
//! and config Turbopack persists with (`turbo_bincode`, bincode's standard config):
//! - `Bitset` with its own encoding (the trimmed bitmap bytes, or the delta-encoded list of bits if
//!   that is below 80% of the bitmap's size).
//! - `RoaringBitmap` through its serde implementation (the portable Roaring format as a
//!   length-prefixed byte string), how Turbopack persisted these sets before `Bitset`.
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

use roaring::RoaringBitmap;
use turbo_bincode::{
    TURBO_BINCODE_CONFIG, TurboBincodeBuffer, TurboBincodeReader, TurboBincodeWriter,
    turbo_bincode_decode, turbo_bincode_encode,
};
use turbo_bitset::Bitset;

use self::inputs::{Lcg, inputs};

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

fn shuffled(rng: &mut Lcg, bits: &[u32]) -> Vec<u32> {
    let mut bits = bits.to_vec();
    for i in (1..bits.len()).rev() {
        bits.swap(i, rng.next() as usize % (i + 1));
    }
    bits
}

/// Encodes through serde with the writer and config Turbopack persists with.
fn encode_roaring(set: &RoaringBitmap) -> TurboBincodeBuffer {
    let mut buffer = TurboBincodeBuffer::new();
    bincode::serde::encode_into_writer(
        set,
        TurboBincodeWriter::new(&mut buffer),
        TURBO_BINCODE_CONFIG,
    )
    .unwrap();
    buffer
}

/// Decodes through serde with the reader and config Turbopack persists with.
fn decode_roaring(bytes: &[u8]) -> RoaringBitmap {
    bincode::serde::decode_from_reader(TurboBincodeReader::new(bytes), TURBO_BINCODE_CONFIG)
        .unwrap()
}

fn main() {
    println!(
        "input,universe,bits,density_ppm,bitset_sorted,bitset_random,roaring_sorted,\
         roaring_random,bitset_words,bitset_ser,bitset_form,roaring_portable,roaring_ser,\
         roaring_ser_optimized"
    );
    let mut rng = Lcg(7);
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
        let (roaring_sorted, roaring_sorted_bytes) =
            storage(|| RoaringBitmap::from_sorted_iter(bits.iter().copied()).unwrap());
        let (roaring_random, roaring_random_bytes) = storage(|| {
            let mut set = RoaringBitmap::new();
            for &bit in &random_order {
                set.insert(bit);
            }
            set
        });
        assert_eq!(bitset_sorted, bitset_random);
        assert_eq!(roaring_sorted, roaring_random);
        assert!(bitset_sorted.iter().eq(roaring_sorted.iter()));

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

        // The portable Roaring format, and the same through bincode's serde support.
        let mut portable = Vec::new();
        roaring_sorted.serialize_into(&mut portable).unwrap();
        assert_eq!(portable.len(), roaring_sorted.serialized_size());
        let roaring_ser = encode_roaring(&roaring_sorted);
        assert_eq!(decode_roaring(&roaring_ser), roaring_sorted);
        let mut optimized = roaring_sorted.clone();
        optimized.optimize();
        let optimized_ser = encode_roaring(&optimized);
        assert_eq!(decode_roaring(&optimized_ser), roaring_sorted);

        println!(
            "{},{},{},{},{bitset_sorted_bytes},{bitset_random_bytes},{roaring_sorted_bytes},\
             {roaring_random_bytes},{words},{},{bitset_form},{},{},{}",
            input.name,
            input.universe,
            bits.len(),
            bits.len() as u64 * 1_000_000 / input.universe as u64,
            bitset_ser.len(),
            portable.len(),
            roaring_ser.len(),
            optimized_ser.len(),
        );
        check_freed(bitset_sorted, bitset_sorted_bytes);
        check_freed(bitset_random, bitset_random_bytes);
        check_freed(roaring_sorted, roaring_sorted_bytes);
        check_freed(roaring_random, roaring_random_bytes);
    }
}
