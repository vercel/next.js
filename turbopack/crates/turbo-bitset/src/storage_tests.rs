//! Tests that run for every [`BlockStorage`], plus the storage-specific capacity behavior.

use std::{collections::BTreeSet, hash::BuildHasher, panic::AssertUnwindSafe};

use arrayvec::ArrayVec;
use bincode::config::{self, Configuration};
use rand::{RngExt, SeedableRng, rngs::SmallRng};
use rustc_hash::FxBuildHasher;
use shrink_to_fit::ShrinkToFit;
use smallvec::SmallVec;

use crate::{Bitset, BlockStorage};

const STANDARD: Configuration = config::standard();
const BLOCK_BITS: u32 = usize::BITS;

/// The `ArrayVec` capacity of the shared suite, which bounds the spans of its inputs.
const ARRAY_BLOCKS: usize = 300;
/// The inline capacity of the `SmallVec` storage, small so that most inputs spill to the heap.
const INLINE_BLOCKS: usize = 2;

type VecSet = Bitset;

fn hash<S: BlockStorage>(set: &Bitset<S>) -> u64 {
    FxBuildHasher.hash_one(set)
}

fn bits<S: BlockStorage>(set: &Bitset<S>) -> BTreeSet<u32> {
    set.iter().collect()
}

/// Checks the read operations and the encoding of `set` against the reference `expected`.
fn check<S: BlockStorage>(set: &Bitset<S>, expected: &BTreeSet<u32>) {
    assert_eq!(bits(set), *expected);
    assert_eq!(set.count_ones(), expected.len());
    assert_eq!(set.is_zero(), expected.is_empty());
    let probes = expected
        .iter()
        .flat_map(|&b| [b.wrapping_sub(1), b, b.wrapping_add(1), b ^ 64])
        .chain([0, 1, 63, 64, 1000, u32::MAX - 1, u32::MAX]);
    for bit in probes {
        assert_eq!(
            set.contains(bit),
            expected.contains(&bit),
            "contains({bit})"
        );
    }

    // Every storage encodes like the default storage, in all configs, and the bytes decode into
    // every storage.
    let default = expected.iter().copied().collect::<VecSet>();
    let configs = [
        bincode::encode_to_vec(set, STANDARD).unwrap()
            == bincode::encode_to_vec(&default, STANDARD).unwrap(),
        bincode::encode_to_vec(set, config::standard().with_fixed_int_encoding()).unwrap()
            == bincode::encode_to_vec(&default, config::standard().with_fixed_int_encoding())
                .unwrap(),
        bincode::encode_to_vec(set, config::standard().with_big_endian()).unwrap()
            == bincode::encode_to_vec(&default, config::standard().with_big_endian()).unwrap(),
    ];
    assert_eq!(
        configs, [true; 3],
        "encoding differs from the default storage"
    );
    let bytes = bincode::encode_to_vec(&default, STANDARD).unwrap();
    let (decoded, read): (Bitset<S>, _) = bincode::decode_from_slice(&bytes, STANDARD).unwrap();
    assert_eq!(read, bytes.len());
    assert_eq!(&decoded, set);
    let (vec, _): (VecSet, _) =
        bincode::decode_from_slice(&bincode::encode_to_vec(set, STANDARD).unwrap(), STANDARD)
            .unwrap();
    assert_eq!(vec, default);

    // Rebuilding from the bits gives an equal set with the same hash.
    let rebuilt = expected.iter().copied().collect::<Bitset<S>>();
    assert_eq!(&rebuilt, set);
    assert_eq!(hash(&rebuilt), hash(set));
}

/// A random set of bits within `base..base + span` bits.
fn random_bits(rng: &mut SmallRng, base: u32, span: u32) -> BTreeSet<u32> {
    let count = match rng.random_range(0..4) {
        0 => 0,
        1 => rng.random_range(1..4),
        2 => rng.random_range(1..40),
        _ => rng.random_range(1..span.min(2_000) + 1),
    };
    (0..count)
        .map(|_| base + rng.random_range(0..span))
        .collect()
}

/// Runs random operation sequences on `Bitset<S>` against a `BTreeSet`. The stored range of every
/// set stays within `max_blocks` blocks.
fn random_operations<S: BlockStorage>(seed: u64, max_blocks: usize) {
    let mut rng = SmallRng::seed_from_u64(seed);
    // The span leaves room for the block alignment on both ends.
    let max_span = (max_blocks as u32 - 2) * BLOCK_BITS;
    for _ in 0..300 {
        let span = rng.random_range(1..max_span);
        let base = match rng.random_range(0..3) {
            0 => 0,
            1 => rng.random_range(0..1_000_000),
            _ => u32::MAX - span + 1,
        };
        let a_bits = random_bits(&mut rng, base, span);
        let b_bits = random_bits(&mut rng, base, span);
        let mut a = a_bits.iter().copied().collect::<Bitset<S>>();
        let b = b_bits.iter().copied().collect::<Bitset<S>>();
        check(&a, &a_bits);
        check(&b, &b_bits);

        assert_eq!(a.is_subset(&b), a_bits.is_subset(&b_bits));
        assert_eq!(a.is_superset(&b), a_bits.is_superset(&b_bits));
        assert_eq!(
            a.is_proper_superset(&b),
            a_bits.is_superset(&b_bits) && a_bits != b_bits
        );
        assert_eq!(a.is_disjoint(&b), a_bits.is_disjoint(&b_bits));
        let intersection = a_bits
            .intersection(&b_bits)
            .copied()
            .collect::<BTreeSet<_>>();
        assert_eq!(a.intersection_len(&b), intersection.len());
        check(&(&a & &b), &intersection);
        check(&a.intersection(&b), &intersection);
        let difference = a_bits.difference(&b_bits).copied().collect::<BTreeSet<_>>();
        check(&(&a - &b), &difference);
        check(&a.difference(&b), &difference);

        // `union_with` returns whether it added a bit, also for a new and an empty set.
        let union = a_bits.union(&b_bits).copied().collect::<BTreeSet<_>>();
        let mut fresh = Bitset::<S>::new();
        assert_eq!(fresh.union_with(&b), !b_bits.is_empty());
        check(&fresh, &b_bits);
        let mut target = a.clone();
        assert_eq!(target.union_with(&b), union.len() > a_bits.len());
        check(&target, &union);
        assert!(!target.union_with(&b));
        let mut or = a.clone();
        or |= &b;
        check(&or, &union);

        // Inserting and removing single bits.
        let mut expected = a_bits.clone();
        for _ in 0..20 {
            let bit = base + rng.random_range(0..span);
            if rng.random_bool(0.5) {
                assert_eq!(a.insert(bit), expected.insert(bit));
            } else {
                assert_eq!(a.remove(bit), expected.remove(&bit));
            }
        }
        check(&a, &expected);
        a.extend(b_bits.iter().copied());
        expected.extend(b_bits.iter().copied());
        check(&a, &expected);

        // Shrinking keeps the bits.
        a.shrink_to_fit();
        check(&a, &expected);
    }
}

macro_rules! storage_suite {
    ($name:ident, $storage:ty, $max_blocks:expr) => {
        mod $name {
            use super::*;

            #[test]
            fn random_operations() {
                super::random_operations::<$storage>(1, $max_blocks);
            }

            #[test]
            fn empty_and_edge_bits() {
                for bits in [
                    &[][..],
                    &[0],
                    &[63, 64],
                    &[u32::MAX],
                    &[u32::MAX - 64, u32::MAX],
                    &[0, 1, 2, 1000, 10_000],
                ] {
                    let expected = bits.iter().copied().collect::<BTreeSet<_>>();
                    let set = bits.iter().copied().collect::<Bitset<$storage>>();
                    check(&set, &expected);
                    let mut shrunk = set.clone();
                    shrunk.shrink_to_fit();
                    check(&shrunk, &expected);
                }
            }

            #[test]
            fn equality_ignores_the_stored_range() {
                let mut padded = Bitset::<$storage>::with_len(20 * BLOCK_BITS);
                padded.insert(5 * BLOCK_BITS + 3);
                let mut tight = Bitset::<$storage>::new();
                tight.insert(5 * BLOCK_BITS + 3);
                assert_eq!(padded, tight);
                assert_eq!(hash(&padded), hash(&tight));
                padded.remove(5 * BLOCK_BITS + 3);
                assert_eq!(padded, Bitset::<$storage>::new());
                assert_eq!(hash(&padded), hash(&Bitset::<$storage>::new()));
            }
        }
    };
}

storage_suite!(vec_storage, Vec<usize>, ARRAY_BLOCKS);
storage_suite!(
    small_vec_storage,
    SmallVec<[usize; INLINE_BLOCKS]>,
    ARRAY_BLOCKS
);
storage_suite!(array_vec_storage, ArrayVec<usize, ARRAY_BLOCKS>, ARRAY_BLOCKS);

/// The heap path of `SmallVec` with spans like the default suite's randomized tests.
#[test]
fn small_vec_large_spans() {
    random_operations::<SmallVec<[usize; INLINE_BLOCKS]>>(2, 16_400);
}

/// The default storage behaves the same with spans beyond the `ArrayVec` capacity.
#[test]
fn vec_large_spans() {
    random_operations::<Vec<usize>>(3, 16_400);
}

/// The ptr, length, capacity and offset of the storage, to check whether it changed.
fn layout<S: BlockStorage>(set: &Bitset<S>) -> (*const usize, usize, usize, usize) {
    let blocks = set.blocks.as_slice();
    (
        blocks.as_ptr(),
        blocks.len(),
        set.blocks.capacity(),
        set.offset,
    )
}

type Array4 = Bitset<ArrayVec<usize, 4>>;
type Small4 = Bitset<SmallVec<[usize; 4]>>;

fn panics(f: impl FnOnce()) -> bool {
    std::panic::catch_unwind(AssertUnwindSafe(f)).is_err()
}

#[test]
fn array_vec_holds_exactly_its_capacity() {
    let mut set = Array4::new();
    for block in 10..14 {
        set.insert(block * BLOCK_BITS + 1);
    }
    assert_eq!(set.blocks.capacity(), 4);
    assert_eq!(set.blocks.as_slice().len(), 4);
    assert_eq!(set.count_ones(), 4);
    let full = Array4::with_len(4 * BLOCK_BITS);
    assert_eq!(full.blocks.as_slice().len(), 4);
    let reserved = Array4::with_capacity(4 * BLOCK_BITS);
    assert!(reserved.blocks.as_slice().is_empty());
    // A union that fits after trimming the zero edge blocks of `other` works.
    let mut padded = Array4::with_len(4 * BLOCK_BITS);
    padded.insert(BLOCK_BITS);
    let mut target = Array4::new();
    target.insert(3 * BLOCK_BITS);
    assert!(target.union_with(&padded));
    assert_eq!(bits(&target), BTreeSet::from([BLOCK_BITS, 3 * BLOCK_BITS]));
}

/// Growth at the front fills the capacity with zero blocks in front of the bits. With a storage of
/// limited size, later growth at the back must drop them instead of panicking while the bits fit.
#[test]
fn array_vec_front_growth_then_back_growth() {
    let mut set = Array4::new();
    set.insert(10 * BLOCK_BITS);
    set.insert(9 * BLOCK_BITS);
    // The front growth used the whole capacity: blocks 7..11.
    assert_eq!(set.blocks.as_slice().len(), 4);
    assert_eq!(set.offset, 7);
    set.insert(12 * BLOCK_BITS);
    assert_eq!(
        bits(&set),
        BTreeSet::from([9 * BLOCK_BITS, 10 * BLOCK_BITS, 12 * BLOCK_BITS])
    );
    // The same through `union_with`.
    let mut set = Array4::new();
    set.insert(10 * BLOCK_BITS);
    set.insert(9 * BLOCK_BITS);
    let other = [11 * BLOCK_BITS, 12 * BLOCK_BITS]
        .into_iter()
        .collect::<Array4>();
    assert!(set.union_with(&other));
    assert_eq!(set.count_ones(), 4);
    // After removing all bits, the storage can be reused for a distant range.
    for bit in set.iter().collect::<Vec<_>>() {
        set.remove(bit);
    }
    set.insert(1000 * BLOCK_BITS);
    assert_eq!(bits(&set), BTreeSet::from([1000 * BLOCK_BITS]));
}

#[test]
fn zero_capacity_storages() {
    let mut array = Bitset::<ArrayVec<usize, 0>>::new();
    assert!(array.is_zero());
    assert!(!array.union_with(&Bitset::new()));
    array.shrink_to_fit();
    assert_eq!(array.blocks.capacity(), 0);
    assert!(panics(|| {
        Bitset::<ArrayVec<usize, 0>>::new().insert(0);
    }));

    let mut small = Bitset::<SmallVec<[usize; 0]>>::new();
    assert!(!small.blocks.spilled());
    small.insert(3 * BLOCK_BITS);
    assert!(small.blocks.spilled());
    small.remove(3 * BLOCK_BITS);
    small.shrink_to_fit();
    assert!(!small.blocks.spilled());
    assert!(small.is_zero());
}

#[test]
fn array_vec_overflow_panics() {
    let four = || (0..4).map(|b| b * BLOCK_BITS).collect::<Array4>();
    assert!(panics(|| {
        four().insert(4 * BLOCK_BITS);
    }));
    assert!(panics(|| {
        let mut set = four();
        set.insert(u32::MAX);
    }));
    assert!(panics(|| {
        let mut other = Array4::new();
        other.insert(10 * BLOCK_BITS);
        four().union_with(&other);
    }));
    assert!(panics(|| {
        Array4::with_len(4 * BLOCK_BITS + 1);
    }));
    assert!(panics(|| {
        Array4::with_capacity(5 * BLOCK_BITS);
    }));
    assert!(panics(|| {
        let _ = [0, 5 * BLOCK_BITS].into_iter().collect::<Array4>();
    }));
    // A failed insert panics before changing the set.
    let mut set = four();
    assert!(panics(|| {
        set.insert(100 * BLOCK_BITS);
    }));
    assert_eq!(bits(&set), (0..4).map(|b| b * BLOCK_BITS).collect());
    set.insert(3 * BLOCK_BITS + 5);
    assert_eq!(set.count_ones(), 5);
}

#[test]
fn array_vec_decode_overflow_is_an_error() {
    let fits = [0, 4 * BLOCK_BITS - 1].into_iter().collect::<VecSet>();
    let too_large = [0, 4 * BLOCK_BITS].into_iter().collect::<VecSet>();
    let sparse = (0..20).map(|i| i * 1000).collect::<VecSet>();
    let fixint = config::standard().with_fixed_int_encoding();
    let bytes = bincode::encode_to_vec(&fits, STANDARD).unwrap();
    let (decoded, _): (Array4, _) = bincode::decode_from_slice(&bytes, STANDARD).unwrap();
    assert_eq!(bits(&decoded), bits(&fits));
    let bytes = bincode::encode_to_vec(&fits, fixint).unwrap();
    let (decoded, _): (Array4, _) = bincode::decode_from_slice(&bytes, fixint).unwrap();
    assert_eq!(bits(&decoded), bits(&fits));
    for set in [&too_large, &sparse] {
        for fixint in [false, true] {
            let bytes = if fixint {
                bincode::encode_to_vec(set, config::standard().with_fixed_int_encoding()).unwrap()
            } else {
                bincode::encode_to_vec(set, STANDARD).unwrap()
            };
            let result = if fixint {
                bincode::decode_from_slice::<Array4, _>(
                    &bytes,
                    config::standard().with_fixed_int_encoding(),
                )
            } else {
                bincode::decode_from_slice::<Array4, _>(&bytes, STANDARD)
            };
            assert!(result.is_err(), "decoding {set:?} into 4 blocks");
        }
    }
}

#[test]
fn small_vec_inline_and_spill() {
    let mut set = Small4::new();
    assert!(!set.blocks.spilled());
    for block in 0..4 {
        set.insert(block * BLOCK_BITS);
    }
    assert!(!set.blocks.spilled());
    set.insert(4 * BLOCK_BITS);
    assert!(set.blocks.spilled());
    assert!(!Small4::with_capacity(4 * BLOCK_BITS).blocks.spilled());
    let reserved = Small4::with_capacity(5 * BLOCK_BITS);
    assert!(reserved.blocks.spilled());
    assert!(reserved.blocks.capacity() >= 5);
    assert!(!Small4::with_len(4 * BLOCK_BITS).blocks.spilled());
    assert!(Small4::with_len(5 * BLOCK_BITS).blocks.spilled());
}

#[test]
fn shrunk_capacity() {
    assert_eq!(<Vec<usize> as BlockStorage>::shrunk_capacity(0), 0);
    assert_eq!(<Vec<usize> as BlockStorage>::shrunk_capacity(7), 7);
    assert_eq!(
        <SmallVec<[usize; 4]> as BlockStorage>::shrunk_capacity(0),
        4
    );
    assert_eq!(
        <SmallVec<[usize; 4]> as BlockStorage>::shrunk_capacity(3),
        4
    );
    assert_eq!(
        <SmallVec<[usize; 4]> as BlockStorage>::shrunk_capacity(9),
        9
    );
    assert_eq!(<ArrayVec<usize, 4> as BlockStorage>::shrunk_capacity(0), 4);
    assert_eq!(<ArrayVec<usize, 4> as BlockStorage>::shrunk_capacity(4), 4);
}

#[test]
fn shrink_to_fit_leaves_storage_that_cannot_shrink() {
    // `ArrayVec` never releases capacity, so the blocks aren't moved, even with zero edge blocks.
    let mut array = Array4::with_len(4 * BLOCK_BITS);
    array.insert(2 * BLOCK_BITS);
    let before = layout(&array);
    array.shrink_to_fit();
    assert_eq!(layout(&array), before);
    let mut empty = Array4::with_len(3 * BLOCK_BITS);
    empty.shrink_to_fit();
    assert_eq!(empty.blocks.as_slice().len(), 3);

    // An inline `SmallVec` can't shrink either.
    let mut inline = Small4::with_len(3 * BLOCK_BITS);
    inline.insert(BLOCK_BITS);
    let before = layout(&inline);
    inline.shrink_to_fit();
    assert_eq!(layout(&inline), before);

    // A spilled `SmallVec` without spare capacity or zero edge blocks stays as it is.
    let mut full = (0..6).map(|b| b * BLOCK_BITS).collect::<Small4>();
    full.blocks.shrink_to_fit();
    let before = layout(&full);
    full.shrink_to_fit();
    assert_eq!(layout(&full), before);

    // Neither does a `Vec` that is already minimal.
    let mut vec = VecSet::with_len(5 * BLOCK_BITS);
    for block in 0..5 {
        vec.insert(block * BLOCK_BITS);
    }
    let before = layout(&vec);
    vec.shrink_to_fit();
    assert_eq!(layout(&vec), before);
}

#[test]
fn shrink_to_fit_releases_capacity() {
    // A spilled `SmallVec` whose trimmed blocks fit inline moves back inline.
    let mut set = Small4::with_len(10 * BLOCK_BITS);
    set.insert(6 * BLOCK_BITS + 1);
    set.insert(7 * BLOCK_BITS + 2);
    assert!(set.blocks.spilled());
    set.shrink_to_fit();
    assert!(!set.blocks.spilled());
    assert_eq!(set.blocks.as_slice().len(), 2);
    assert_eq!(set.offset, 6);
    assert_eq!(
        bits(&set),
        BTreeSet::from([6 * BLOCK_BITS + 1, 7 * BLOCK_BITS + 2])
    );

    // A spilled `SmallVec` with zero edge blocks shrinks to its trimmed blocks.
    let mut set = Small4::with_len(20 * BLOCK_BITS);
    for block in 3..9 {
        set.insert(block * BLOCK_BITS);
    }
    set.shrink_to_fit();
    assert!(set.blocks.spilled());
    assert_eq!(set.blocks.as_slice().len(), 6);
    assert_eq!(set.blocks.capacity(), 6);

    // An empty `Vec` gets unallocated.
    let mut set = VecSet::with_len(3 * BLOCK_BITS);
    set.shrink_to_fit();
    assert_eq!(set.blocks.capacity(), 0);
    assert_eq!(set.offset, 0);
}
