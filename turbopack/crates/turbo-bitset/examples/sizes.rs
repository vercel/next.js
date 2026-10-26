//! Measures the in-memory storage and serialized size of `Bitset` and `RoaringBitmap` for
//! different universe sizes, densities and bit distributions.
//!
//! Storage is measured with a counting global allocator: the bytes requested from the allocator
//! by the set (its heap allocations), plus `size_of` the set itself. Allocator bookkeeping and
//! size-class rounding are not included.
//!
//! Serialized sizes are measured by actually encoding (and decoding again) with bincode's
//! standard config, the config Turbopack persists with:
//! - `Bitset` with its own encoding (the trimmed bitmap bytes or the delta-encoded list of bits,
//!   whichever is smaller).
//! - `RoaringBitmap` through its serde implementation (the portable Roaring format as a
//!   length-prefixed byte string), how Turbopack persisted these sets before `Bitset`.
//!
//! Run with `cargo run --release -p turbo-bitset --example sizes`. Prints CSV.

#[cfg(not(target_pointer_width = "64"))]
compile_error!("this measurement assumes 64-bit `usize` blocks");

use std::{
    alloc::{GlobalAlloc, Layout, System},
    sync::atomic::{AtomicUsize, Ordering},
};

use roaring::RoaringBitmap;
use turbo_bitset::Bitset;

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

struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u32 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (self.0 >> 33) as u32
    }
}

/// Bits of a set: `uniform` picks every bit independently with probability `density`;
/// `clustered` places runs of 64 consecutive bits at random positions until the density is
/// reached.
fn bits(rng: &mut Lcg, universe: u32, per_million: u32, clustered: bool) -> Vec<u32> {
    let mut bits = if clustered {
        let target = (universe as u64 * per_million as u64 / 1_000_000).max(1) as usize;
        let mut set = std::collections::BTreeSet::new();
        while set.len() < target {
            let start = rng.next() % universe;
            for bit in start..(start + 64).min(universe) {
                if set.len() == target {
                    break;
                }
                set.insert(bit);
            }
        }
        set.into_iter().collect::<Vec<_>>()
    } else {
        (0..universe)
            .filter(|_| rng.next() % 1_000_000 < per_million)
            .collect::<Vec<_>>()
    };
    if bits.is_empty() {
        bits.push(rng.next() % universe);
    }
    bits
}

fn shuffled(rng: &mut Lcg, bits: &[u32]) -> Vec<u32> {
    let mut bits = bits.to_vec();
    for i in (1..bits.len()).rev() {
        bits.swap(i, rng.next() as usize % (i + 1));
    }
    bits
}

fn main() {
    let varint = bincode::config::standard();
    println!(
        "distribution,universe,density_ppm,bits,actual_density_ppm,offset_sorted,offset_random,\
         roaring_sorted,roaring_random,offset_words,offset_ser,offset_form,roaring_portable,\
         roaring_ser,roaring_ser_optimized"
    );
    for clustered in [false, true] {
        for universe in [1_024u32, 16_384, 65_536, 1_048_576] {
            for per_million in [100u32, 1_000, 10_000, 100_000, 500_000, 1_000_000] {
                let mut rng = Lcg(42);
                let bits = bits(&mut rng, universe, per_million, clustered);
                let random_order = shuffled(&mut rng, &bits);

                let (offset_sorted, offset_sorted_bytes) =
                    storage(|| bits.iter().copied().collect::<Bitset>());
                let (offset_random, offset_random_bytes) = storage(|| {
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
                assert_eq!(offset_sorted, offset_random);
                assert_eq!(roaring_sorted, roaring_random);
                assert!(offset_sorted.iter().eq(roaring_sorted.iter()));

                // The block-aligned word range of the set: from the lowest to the highest word.
                let words = (*bits.last().unwrap() / 64 - bits[0] / 64 + 1) as usize;
                let offset_ser = bincode::encode_to_vec(&offset_sorted, varint).unwrap();
                let decoded: Bitset = bincode::decode_from_slice(&offset_ser, varint).unwrap().0;
                assert_eq!(decoded, offset_sorted);
                // The sign of the decoded header tells the form.
                let (header, _): (i64, _) =
                    bincode::decode_from_slice(&offset_ser, varint).unwrap();
                let offset_form = if header < 0 { "list" } else { "bitmap" };

                // The portable Roaring format, and the same through bincode's serde support.
                let mut portable = Vec::new();
                roaring_sorted.serialize_into(&mut portable).unwrap();
                assert_eq!(portable.len(), roaring_sorted.serialized_size());
                let roaring_ser = bincode::serde::encode_to_vec(&roaring_sorted, varint).unwrap();
                let decoded: RoaringBitmap =
                    bincode::serde::decode_from_slice(&roaring_ser, varint)
                        .unwrap()
                        .0;
                assert_eq!(decoded, roaring_sorted);
                let mut optimized = roaring_sorted.clone();
                optimized.optimize();
                let optimized_ser = bincode::serde::encode_to_vec(&optimized, varint).unwrap();
                let decoded: RoaringBitmap =
                    bincode::serde::decode_from_slice(&optimized_ser, varint)
                        .unwrap()
                        .0;
                assert_eq!(decoded, roaring_sorted);

                println!(
                    "{},{universe},{per_million},{},{},{offset_sorted_bytes},\
                     {offset_random_bytes},{roaring_sorted_bytes},{roaring_random_bytes},{words},\
                     {},{offset_form},{},{},{}",
                    if clustered { "clustered" } else { "uniform" },
                    bits.len(),
                    bits.len() as u64 * 1_000_000 / universe as u64,
                    offset_ser.len(),
                    portable.len(),
                    roaring_ser.len(),
                    optimized_ser.len(),
                );
                check_freed(offset_sorted, offset_sorted_bytes);
                check_freed(offset_random, offset_random_bytes);
                check_freed(roaring_sorted, roaring_sorted_bytes);
                check_freed(roaring_random, roaring_random_bytes);
            }
        }
    }
}
