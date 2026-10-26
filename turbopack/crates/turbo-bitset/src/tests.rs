use std::{collections::BTreeSet, hash::BuildHasher};

use bincode::{
    BorrowDecode, Encode,
    config::{self, Configuration},
    de::{
        BorrowDecoder, DecoderImpl,
        read::{BorrowReader, SliceReader},
    },
    enc::{EncoderImpl, write::Writer},
    error::{DecodeError, EncodeError},
};
use rand::{RngExt, SeedableRng, rngs::SmallRng, seq::SliceRandom};
use roaring::RoaringBitmap;
use rustc_hash::FxBuildHasher;
use shrink_to_fit::ShrinkToFit;
use smallvec::smallvec;

use crate::Bitset;

const STANDARD: Configuration = config::standard();

fn encode(set: &Bitset) -> Vec<u8> {
    bincode::encode_to_vec(set, STANDARD).unwrap()
}

fn decode(bytes: &[u8]) -> Result<Bitset, DecodeError> {
    let (set, read) = bincode::decode_from_slice::<Bitset, _>(bytes, STANDARD)?;
    assert_eq!(read, bytes.len(), "trailing bytes");
    Ok(set)
}

/// Decodes the length header of an encoding with the standard config.
fn header(bytes: &[u8]) -> i64 {
    bincode::decode_from_slice(bytes, STANDARD).unwrap().0
}

/// Checks that `set` round-trips through the standard and the fixed-int config, that the standard
/// encoding is the reference encoding of the form chosen by the rule, and that the fixed-int config
/// always uses the bitmap form.
fn check_encoding(set: &Bitset, expected: &BTreeSet<u32>) {
    let bytes = encode(set);
    let decoded = decode(&bytes).unwrap();
    assert_eq!(&decoded, set);
    assert_eq!(decoded.iter().collect::<BTreeSet<_>>(), *expected);
    assert_eq!(bytes, reference_encoding(expected, STANDARD));
    assert_eq!(header(&bytes) < 0, reference_prefers_list(expected));

    let fixint = config::standard().with_fixed_int_encoding();
    let fixed_bytes = bincode::encode_to_vec(set, fixint).unwrap();
    let (fixed_decoded, _): (Bitset, _) = bincode::decode_from_slice(&fixed_bytes, fixint).unwrap();
    assert_eq!(&fixed_decoded, set);
    let fixed_header: i64 = bincode::decode_from_slice(&fixed_bytes, fixint).unwrap().0;
    assert!(
        fixed_header >= 0,
        "the fixed-int config uses the bitmap form"
    );
    if let Some(bits) = (!expected.is_empty()).then(|| expected.iter().copied().collect::<Vec<_>>())
    {
        assert_eq!(fixed_bytes, reference_bitmap_encoding(&bits, fixint));
    }

    // Big endian goes through the same rule with big-endian integers.
    let big_endian = config::standard().with_big_endian();
    let big_bytes = bincode::encode_to_vec(set, big_endian).unwrap();
    assert_eq!(big_bytes, reference_encoding(expected, big_endian));
    let (big_decoded, _): (Bitset, _) = bincode::decode_from_slice(&big_bytes, big_endian).unwrap();
    assert_eq!(&big_decoded, set);
}

/// The payload length of the bitmap form of `bits` (`len`), or `None` for the empty set.
fn reference_bitmap_len(bits: &BTreeSet<u32>) -> Option<u64> {
    let (Some(&first), Some(&last)) = (bits.first(), bits.last()) else {
        return None;
    };
    Some((last / 8 - first / 8 + 1) as u64)
}

/// Whether the encoder uses the list form for `bits` with varint integers: only if `5 * n < 4 *
/// len`, with `n` the number of bits and `len` the bitmap form's payload length.
fn reference_prefers_list(bits: &BTreeSet<u32>) -> bool {
    reference_bitmap_len(bits).is_some_and(|len| 5 * (bits.len() as u64) < 4 * len)
}

/// The encoding of `bits` with the varint `config`, in the form chosen by the rule, produced
/// through bincode's normal integer encoding.
fn reference_encoding<C: config::Config>(bits: &BTreeSet<u32>, config: C) -> Vec<u8> {
    if bits.is_empty() {
        return bincode::encode_to_vec(0i64, config).unwrap();
    }
    let list = reference_prefers_list(bits);
    let bits = bits.iter().copied().collect::<Vec<_>>();
    if list {
        reference_list_encoding(&bits, config)
    } else {
        reference_bitmap_encoding(&bits, config)
    }
}

/// Checks every read operation of `set` against the reference `expected`.
fn check(set: &Bitset, expected: &BTreeSet<u32>) {
    assert_eq!(
        set.iter().collect::<Vec<_>>(),
        expected.iter().copied().collect::<Vec<_>>()
    );
    assert_eq!(set.count_ones(), expected.len());
    assert_eq!(set.is_zero(), expected.is_empty());
    for &bit in expected {
        assert!(set.contains(bit), "missing {bit}");
    }
    // Neighbors of every bit, plus some fixed probes.
    let probes = expected
        .iter()
        .flat_map(|&b| [b.wrapping_sub(1), b.wrapping_add(1), b ^ 64])
        .chain([0, 1, 63, 64, 65, 127, 128, 1000, u32::MAX - 1, u32::MAX]);
    for bit in probes {
        assert_eq!(
            set.contains(bit),
            expected.contains(&bit),
            "contains({bit})"
        );
    }
    check_encoding(set, expected);
    let roaring = set.to_roaring();
    assert_eq!(
        roaring.iter().collect::<Vec<_>>(),
        expected.iter().copied().collect::<Vec<_>>()
    );
    // Same internal representation as inserting the bits.
    assert_eq!(roaring, expected.iter().copied().collect::<RoaringBitmap>());
    // Rebuilding from the bits gives an equal set.
    let rebuilt = expected.iter().copied().collect::<Bitset>();
    assert_eq!(&rebuilt, set);
    assert_eq!(hash(&rebuilt), hash(set));
}

fn hash(set: &Bitset) -> u64 {
    FxBuildHasher.hash_one(set)
}

/// The pointer and capacity of the storage, to check whether it was reallocated.
fn storage(set: &Bitset) -> (*const usize, usize) {
    (set.blocks.as_ptr(), set.blocks.capacity())
}

fn from_bits(bits: &[u32]) -> (Bitset, BTreeSet<u32>) {
    (
        bits.iter().copied().collect(),
        bits.iter().copied().collect(),
    )
}

/// A set storing the given block range, including leading or trailing zero blocks.
fn with_storage(offset: usize, blocks: Vec<usize>) -> Bitset {
    Bitset {
        offset,
        blocks: blocks.into(),
    }
}

/// The bits of a block range, starting at block `offset`.
fn bits_of(offset: usize, blocks: &[usize]) -> BTreeSet<u32> {
    blocks
        .iter()
        .enumerate()
        .flat_map(|(index, &block)| {
            (0..usize::BITS as usize)
                .filter(move |bit| block & (1 << bit) != 0)
                .map(move |bit| ((offset + index) * usize::BITS as usize + bit) as u32)
        })
        .collect()
}

#[test]
fn empty() {
    let set = Bitset::new();
    check(&set, &BTreeSet::new());
    assert_eq!(set, Bitset::default());
    assert!(set.is_superset(&Bitset::new()));
    assert!(!set.is_proper_superset(&Bitset::new()));
}

/// Bit counts around block boundaries, for the constructors that size the storage.
fn constructor_lengths() -> [u32; 5] {
    let block = usize::BITS;
    [0, 1, block, block + 1, 10_000]
}

/// Bits below `bits` at both ends and in the middle, in this order (back first, then front), to
/// insert into a sized set.
fn bits_below(bits: u32) -> Vec<u32> {
    let mut result = Vec::new();
    for bit in [bits.wrapping_sub(1), 0, bits / 2] {
        if bit < bits && !result.contains(&bit) {
            result.push(bit);
        }
    }
    result
}

/// The number of blocks that hold `bits` bits.
fn blocks_for(bits: u32) -> usize {
    (bits as usize).div_ceil(usize::BITS as usize)
}

#[test]
fn with_len_stores_zero_blocks() {
    for bits in constructor_lengths() {
        let expected_blocks = blocks_for(bits);
        let mut set = Bitset::with_len(bits);
        // An empty set, whatever its storage.
        check(&set, &BTreeSet::new());
        assert_eq!(set, Bitset::new(), "bits={bits}");
        assert_eq!(hash(&set), hash(&Bitset::new()), "bits={bits}");
        // Exactly the blocks for `bits`, without spare capacity.
        assert_eq!(set.offset, 0, "bits={bits}");
        assert_eq!(set.blocks.len(), expected_blocks, "bits={bits}");
        assert_eq!(set.blocks.capacity(), expected_blocks, "bits={bits}");
        // Bits below `bits` are already stored.
        let before = storage(&set);
        let inserted = bits_below(bits);
        for &bit in &inserted {
            assert!(set.insert(bit));
        }
        assert_eq!(storage(&set), before, "bits={bits}");
        check(&set, &inserted.into_iter().collect());
    }
}

#[test]
fn with_capacity_reserves_blocks() {
    for bits in constructor_lengths() {
        let expected_blocks = blocks_for(bits);
        let mut set = Bitset::with_capacity(bits);
        check(&set, &BTreeSet::new());
        assert_eq!(set.blocks.len(), 0, "bits={bits}");
        assert!(set.blocks.capacity() >= expected_blocks, "bits={bits}");
        if bits == 0 {
            assert_eq!(set.blocks.capacity(), 0);
        }
        // The first insert picks the offset; the others grow within the reserved capacity, at the
        // front and at the back.
        let before = storage(&set);
        let inserted = bits_below(bits);
        for &bit in &inserted {
            set.insert(bit);
        }
        if bits > 0 {
            assert_eq!(storage(&set), before, "bits={bits}");
        }
        check(&set, &inserted.into_iter().collect());
    }
}

#[test]
fn insert_returns_whether_added() {
    let mut set = Bitset::new();
    assert!(set.insert(5));
    assert!(!set.insert(5));
    assert!(set.insert(1000));
    assert!(!set.insert(1000));
    // Below the current offset (front growth).
    assert!(set.insert(0));
    assert!(!set.insert(0));
    check(&set, &[0, 5, 1000].into());
}

#[test]
fn block_boundaries() {
    let block = usize::BITS;
    for bits in [
        &[0][..],
        &[block - 1],
        &[block],
        &[block - 1, block],
        &[2 * block - 1, 2 * block],
        &[0, block - 1, block, 3 * block - 1],
        &[u32::MAX],
        &[u32::MAX - block, u32::MAX],
    ] {
        let (set, expected) = from_bits(bits);
        check(&set, &expected);
    }
}

#[test]
fn front_and_back_growth() {
    let mut set = Bitset::new();
    let mut expected = BTreeSet::new();
    // High first, then progressively lower and higher bits.
    for bit in [10_000, 9_000, 20_000, 64, 63, 0, 100_000, 99_999] {
        assert_eq!(set.insert(bit), expected.insert(bit));
        check(&set, &expected);
    }
}

#[test]
fn front_growth_reuses_capacity() {
    let block = usize::BITS;
    let mut set = Bitset::new();
    let mut expected = BTreeSet::new();
    for bit in [100 * block + 3, 101 * block] {
        set.insert(bit);
        expected.insert(bit);
    }
    // Leave room for 8 more blocks.
    set.blocks.reserve(8);
    let (ptr, capacity) = storage(&set);
    assert!(capacity >= 10);

    // Growing at the front and the back at once within the capacity doesn't reallocate.
    let other = [99 * block, 102 * block + 5]
        .into_iter()
        .collect::<Bitset>();
    set |= &other;
    expected.extend(other.iter());
    check(&set, &expected);
    assert_eq!(storage(&set), (ptr, capacity));

    // Growing at the front within the capacity doesn't reallocate either.
    for bit in [98 * block + 7, 96 * block, 98 * block - 1, 95 * block + 1] {
        assert_eq!(set.insert(bit), expected.insert(bit));
        check(&set, &expected);
        assert_eq!(storage(&set), (ptr, capacity));
    }

    // Growing beyond the reserved capacity keeps all bits.
    let bit = 10 * block + 1;
    assert!(set.insert(bit));
    expected.insert(bit);
    check(&set, &expected);
}

#[test]
fn front_and_back_growth_in_one_step() {
    let block = usize::BITS;
    for reserve in [0, 2, 100] {
        let mut set = [10 * block, 11 * block - 1].into_iter().collect::<Bitset>();
        set.blocks.reserve(reserve);
        let mut expected = set.iter().collect::<BTreeSet<_>>();
        // A union that extends the range below and above.
        let other = [3 * block + 2, 10 * block, 20 * block + 9];
        set |= &other.into_iter().collect::<Bitset>();
        expected.extend(other);
        check(&set, &expected);
        // Extending below and above.
        let more = [block, 2 * block - 1, 30 * block];
        set.extend(more);
        expected.extend(more);
        check(&set, &expected);
    }
}

#[test]
fn union() {
    let cases: &[(&[u32], &[u32])] = &[
        (&[], &[]),
        (&[], &[1, 2, 3]),
        (&[1, 2, 3], &[]),
        // Disjoint, other below.
        (&[5_000, 5_001], &[1, 2]),
        // Disjoint, other above.
        (&[1, 2], &[5_000, 5_001]),
        // Overlapping ranges.
        (&[100, 200, 300], &[200, 250, 400]),
        // Other inside self's range.
        (&[0, 10_000], &[5_000]),
        // Self inside other's range.
        (&[5_000], &[0, 10_000]),
        // Equal.
        (&[7, 700, 7_000], &[7, 700, 7_000]),
    ];
    for &(a, b) in cases {
        let (mut set, mut expected) = from_bits(a);
        let (other, other_expected) = from_bits(b);
        set |= &other;
        expected.extend(other_expected.iter().copied());
        check(&set, &expected);
        // `other` is unchanged.
        check(&other, &other_expected);

        let (mut set2, expected2) = from_bits(a);
        assert_eq!(
            set2.union_with(&other),
            !other_expected.is_subset(&expected2),
            "{a:?} ∪ {b:?}"
        );
        assert_eq!(set2, set);
    }
}

#[test]
fn superset() {
    let cases: &[(&[u32], &[u32])] = &[
        (&[], &[]),
        (&[1], &[]),
        (&[], &[1]),
        (&[1, 2, 3], &[1, 2, 3]),
        (&[1, 2, 3], &[2]),
        (&[2], &[1, 2, 3]),
        (&[0, 10_000], &[10_000]),
        (&[10_000], &[0, 10_000]),
        (&[5_000, 5_001], &[1, 2]),
        (&[1, 2], &[5_000, 5_001]),
        (&[0, 64, 128, 192], &[64, 128]),
        (&[64, 128], &[0, 64, 128, 192]),
        (&[64, 128], &[64, 129]),
    ];
    for &(a, b) in cases {
        let (set, expected) = from_bits(a);
        let (other, other_expected) = from_bits(b);
        let is_superset = expected.is_superset(&other_expected);
        assert_eq!(set.is_superset(&other), is_superset, "{a:?} ⊇ {b:?}");
        assert_eq!(
            set.is_proper_superset(&other),
            is_superset && expected != other_expected,
            "{a:?} ⊋ {b:?}"
        );
        assert_eq!(
            set.is_subset(&other),
            expected.is_subset(&other_expected),
            "{a:?} ⊆ {b:?}"
        );
    }
}

/// `union_with` returns whether `other` had a bit that the set didn't have, for any storage layout
/// of both sets.
#[test]
fn union_with_returns_whether_changed() {
    let block = usize::BITS as usize;
    // Empty, equal, subset, superset, disjoint and incomparable sets, each with leading and
    // trailing zero blocks at different storage offsets.
    let cases: &[(&[u32], &[u32])] = &[
        (&[], &[]),
        (&[], &[7]),
        (&[7], &[]),
        (&[1, 70, 300], &[1, 70, 300]),
        (&[70], &[1, 70, 300]),
        (&[1, 70, 300], &[70]),
        (&[1, 2], &[5_000, 5_001]),
        (&[1, 300], &[70, 300]),
    ];
    for &(a, b) in cases {
        // `b ∪= a` changes `b` iff `a` has a bit that `b` doesn't have.
        let expected = !a.iter().all(|bit| b.contains(bit));
        for (offset_a, offset_b) in [(0, 0), (0, 3), (2, 0), (1, 5)] {
            let padded = |bits: &[u32], offset: usize| {
                // Store the bits with `offset` zero blocks before and after them.
                let first = bits.iter().min().map_or(0, |&bit| bit as usize / block);
                let start = first.saturating_sub(offset);
                let end = bits
                    .iter()
                    .max()
                    .map_or(start, |&bit| bit as usize / block + 1)
                    + offset;
                let mut blocks = vec![0; end - start];
                for &bit in bits {
                    blocks[bit as usize / block - start] |= 1 << (bit as usize % block);
                }
                with_storage(start, blocks)
            };
            let set = padded(a, offset_a);
            let mut other = padded(b, offset_b);
            let union = b.iter().chain(a).copied().collect::<BTreeSet<_>>();
            assert_eq!(other.union_with(&set), expected, "{b:?} ∪ {a:?}");
            check(&other, &union);
            // A second union adds nothing.
            assert!(!other.union_with(&set), "{b:?} ∪ {a:?} again");
            check(&other, &union);
        }
    }

    // Random sets, compared with `!is_subset` before the union and `|=` after it.
    let mut rng = SmallRng::seed_from_u64(7);
    for _ in 0..500 {
        let universe = rng.random_range(1..2_000);
        let random_set = |rng: &mut SmallRng, count: usize| {
            (0..count)
                .map(|_| rng.random_range(0..universe))
                .collect::<Bitset>()
        };
        let set_len = rng.random_range(0..20);
        let set = random_set(&mut rng, set_len);
        let other_len = rng.random_range(0..40);
        let mut other = random_set(&mut rng, other_len);
        if rng.random_bool(0.5) {
            other |= &set;
        }
        let changed = !set.is_subset(&other);
        let mut expected = other.clone();
        expected |= &set;
        assert_eq!(other.union_with(&set), changed);
        assert_eq!(other, expected);
    }
}

#[test]
fn equality_and_hash_ignore_layout() {
    // Same bits, built so that the storage has different offsets and capacities.
    let mut a = Bitset::new();
    a.insert(1_000);
    a.insert(1_100);

    let mut b = Bitset::new();
    b.insert(0);
    b.insert(1_000);
    b.insert(1_100);
    b.insert(50_000);
    assert_ne!(a, b);

    // `c` was built in a different order and unioned with an empty set.
    let mut c = [1_100, 1_000].into_iter().collect::<Bitset>();
    c |= &Bitset::new();
    let mut wide = Bitset::new();
    wide.insert(1_000);
    wide.insert(1_100);
    wide |= &a;
    assert_eq!(a, c);
    assert_eq!(a, wide);
    assert_eq!(hash(&a), hash(&c));
    assert_eq!(hash(&a), hash(&wide));

    // Sets that only differ in where a high bit lives.
    let x = [64].into_iter().collect::<Bitset>();
    let y = [0].into_iter().collect::<Bitset>();
    assert_ne!(x, y);
    assert_ne!(Bitset::new(), y);
}

#[test]
fn equal_sets_with_different_storage_ranges() {
    // Build a set by hand whose storage has extra zero blocks before and after its bits.
    let a = [3_000, 3_001].into_iter().collect::<Bitset>();
    let block = usize::BITS as usize;
    let offset = 3_000 / block - 2;
    let mut blocks = vec![0usize; 6];
    for bit in [3_000, 3_001] {
        let bit = bit - offset * block;
        blocks[bit / block] |= 1 << (bit % block);
    }
    let wide = Bitset {
        offset,
        blocks: blocks.into(),
    };
    check(&wide, &[3_000, 3_001].into());
    assert_eq!(a, wide);
    assert_eq!(hash(&a), hash(&wide));
    assert!(a.is_superset(&wide));
    assert!(wide.is_superset(&a));
    assert!(!a.is_proper_superset(&wide));

    // An empty set with allocated storage equals the default empty set.
    let empty_wide = Bitset {
        offset: 10,
        blocks: smallvec![0; 3],
    };
    check(&empty_wide, &BTreeSet::new());
    assert_eq!(empty_wide, Bitset::new());
    assert_eq!(hash(&empty_wide), hash(&Bitset::new()));
    assert!(empty_wide.is_superset(&Bitset::new()));
    assert!(a.is_proper_superset(&empty_wide));

    // Unions into and from wide storage.
    let mut u = wide.clone();
    u |= &[5].into_iter().collect();
    check(&u, &[5, 3_000, 3_001].into());
    let mut v = [5].into_iter().collect::<Bitset>();
    v |= &wide;
    assert_eq!(u, v);
}

#[test]
fn extend() {
    let mut set = Bitset::new();
    set.extend([900, 3, 70_000, 3]);
    check(&set, &[3, 900, 70_000].into());
}

#[test]
fn extend_with_any_order() {
    // `extend` inserts the items one by one: check ascending, descending, shuffled, duplicate and
    // empty inputs, also when extending a set that already has bits below and above the new ones,
    // and iterators that hide their length.
    let block = usize::BITS;
    let mut rng = SmallRng::seed_from_u64(3);
    for len in [0, 1, 2, 15, 16, 17, 100, 1_000] {
        let ascending = (0..len)
            .map(|i| 10 * block + i * 37 % (50 * block))
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        let descending = ascending.iter().rev().copied().collect::<Vec<_>>();
        let mut shuffled = ascending.clone();
        shuffled.shuffle(&mut rng);
        let mut duplicates = shuffled.clone();
        duplicates.extend(shuffled.iter().step_by(3));
        for bits in [&ascending, &descending, &shuffled, &duplicates] {
            let (set, expected) = from_bits(bits);
            check(&set, &expected);

            let mut set = [block, 100 * block].into_iter().collect::<Bitset>();
            let mut expected = set.iter().collect::<BTreeSet<_>>();
            set.extend(bits.iter().copied());
            expected.extend(bits.iter().copied());
            check(&set, &expected);

            // An iterator that hides its length.
            let mut set = Bitset::new();
            set.extend(bits.iter().copied().filter(|_| true));
            check(&set, &bits.iter().copied().collect());
        }
    }
}

#[test]
fn front_growth_beyond_the_capacity_keeps_all_bits() {
    // Growing at the front when the capacity doesn't suffice allocates a new buffer; the existing
    // blocks must end up at their shifted position, with zeros before and after them.
    let block = usize::BITS;
    for (existing, new) in [
        (&[50 * block, 52 * block + 3][..], 40 * block + 1),
        (&[50 * block + block - 1][..], 0),
        (
            &[50 * block, 51 * block - 1, 60 * block][..],
            50 * block - 1,
        ),
    ] {
        let mut set = Bitset::new();
        let mut expected = BTreeSet::new();
        for &bit in existing {
            set.insert(bit);
            expected.insert(bit);
        }
        set.blocks.shrink_to_fit();
        let capacity = set.blocks.capacity();
        assert_eq!(capacity, set.blocks.len());
        assert!(set.insert(new));
        expected.insert(new);
        check(&set, &expected);
        assert!(set.blocks.capacity() > capacity);
    }
}

#[test]
fn front_growth_leaves_headroom() {
    let block = usize::BITS;
    let mut set = [1000 * block, 1001 * block].into_iter().collect::<Bitset>();
    let mut expected = set.iter().collect::<BTreeSet<_>>();
    set.blocks.reserve(8);
    let (ptr, capacity) = storage(&set);

    // A growth at the front moves the blocks to the end of the capacity, once.
    assert!(set.insert(999 * block + 1));
    expected.insert(999 * block + 1);
    check(&set, &expected);
    assert_eq!(storage(&set), (ptr, capacity));
    assert_eq!(set.offset + set.blocks.len(), 1002);
    assert_eq!(set.blocks.len(), capacity);

    // Further growth at the front within that headroom doesn't move the blocks again.
    let offset = set.offset;
    for bit in [998 * block, (1002 - capacity as u32) * block + 5] {
        assert!(set.insert(bit));
        expected.insert(bit);
        check(&set, &expected);
        assert_eq!(set.offset, offset);
        assert_eq!(storage(&set), (ptr, capacity));
    }

    // A reallocation at the front leaves headroom too: the range ends at the end of the new
    // capacity.
    let mut set = [500 * block, 501 * block].into_iter().collect::<Bitset>();
    set.blocks.shrink_to_fit();
    let capacity = set.blocks.capacity();
    assert!(set.insert(499 * block));
    assert!(set.blocks.capacity() >= 2 * capacity);
    assert_eq!(set.offset + set.blocks.len(), 502);
    assert_eq!(set.blocks.len(), set.blocks.capacity());
    check(&set, &[499 * block, 500 * block, 501 * block].into());

    // Near block 0, the headroom is limited by block 0.
    let mut set = [3 * block, 4 * block].into_iter().collect::<Bitset>();
    set.blocks.reserve(20);
    assert!(set.insert(2 * block + 9));
    assert_eq!(set.offset, 0);
    assert_eq!(set.blocks.len(), 5);
    check(&set, &[2 * block + 9, 3 * block, 4 * block].into());
}

#[test]
fn descending_inserts_are_amortized() {
    // Inserting one bit per block in descending order must not move the stored blocks on every
    // insert (which would be quadratic): the blocks only move when the headroom at the front is
    // used up, which happens O(log n) times with amortized growth.
    let block = usize::BITS;
    let n = 4_096u32;
    let mut set = Bitset::new();
    let mut inserted = Vec::new();
    let mut relocations = 0;
    let mut reallocations = 0;
    let (mut offset, mut storage_before) = (set.offset, storage(&set));
    for i in 0..n {
        let bit = (100 + n - 1 - i) * block + i % block;
        assert!(set.insert(bit));
        inserted.push(bit);
        if set.offset != offset {
            relocations += 1;
            offset = set.offset;
            // Every bit survives a move.
            assert!(inserted.iter().all(|&bit| set.contains(bit)));
        }
        if storage(&set) != storage_before {
            reallocations += 1;
            storage_before = storage(&set);
        }
    }
    let limit = 2 * n.ilog2() + 4;
    assert!(relocations <= limit, "{relocations} relocations");
    assert!(reallocations <= limit, "{reallocations} reallocations");
    check(&set, &inserted.iter().copied().collect());
}

#[test]
fn superset_chunk_boundaries() {
    // The subset check compares chunks of `CHUNK_BLOCKS` blocks and then the remaining blocks.
    // Place a missing bit in every block of overlaps of different lengths, with zero-padding
    // that makes the stored ranges and chunk alignment differ.
    let chunk = crate::CHUNK_BLOCKS;
    for len in [1, chunk - 1, chunk, chunk + 1, 2 * chunk, 3 * chunk + 2] {
        for a_padding in [0, 1, chunk] {
            for b_padding in [0, 1, chunk + 1] {
                let offset = 10 + chunk;
                let a_blocks = vec![usize::MAX / 3; len];
                let mut a_storage = vec![0; a_padding];
                a_storage.extend_from_slice(&a_blocks);
                let a = with_storage(offset - a_padding, a_storage);

                let b_blocks = a_blocks
                    .iter()
                    .map(|&block| block & !(1 << 4))
                    .collect::<Vec<_>>();
                let mut b_storage = vec![0; b_padding];
                b_storage.extend_from_slice(&b_blocks);
                b_storage.extend(std::iter::repeat_n(0, b_padding));
                let b = with_storage(offset - b_padding, b_storage);

                assert!(a.is_superset(&b));
                assert!(a.is_proper_superset(&b));
                assert!(b.is_subset(&a));
                assert!(!a.is_subset(&b));
                assert!(a.is_superset(&a));
                assert!(!a.is_proper_superset(&a));
                for index in 0..len {
                    let mut missing_blocks = b_blocks.clone();
                    missing_blocks[index] |= 1 << 1;
                    let mut storage = vec![0; b_padding];
                    storage.extend_from_slice(&missing_blocks);
                    storage.extend(std::iter::repeat_n(0, b_padding));
                    let c = with_storage(offset - b_padding, storage);
                    assert!(!a.is_superset(&c), "missing bit in block {index} of {len}");
                    assert!(!a.is_proper_superset(&c));
                    assert!(!c.is_subset(&a));
                }
            }
        }
    }
}

#[test]
fn superset_differential_over_chunk_lengths() {
    // Every overlap length up to 20 blocks, with zero-padded storage and subset, equal and
    // incomparable operands.
    let mut rng = Lcg(11);
    let mut random_block = || ((u64::from(rng.next()) << 32) | u64::from(rng.next())) as usize;
    for len in 0..=20 {
        for padding in [0, 1, crate::CHUNK_BLOCKS] {
            for case in 0..6 {
                let a_blocks = (0..len).map(|_| random_block()).collect::<Vec<_>>();
                let b_blocks = a_blocks
                    .iter()
                    .enumerate()
                    .map(|(index, &block)| match case {
                        0 => block,
                        1 => block & random_block(),
                        2 if index == len / 2 => block | 1,
                        3 => random_block(),
                        4 => 0,
                        _ => block & !(1 << (index % usize::BITS as usize)),
                    })
                    .collect::<Vec<_>>();
                let offset = 30;
                let mut a_storage = vec![0; padding];
                a_storage.extend_from_slice(&a_blocks);
                let a = with_storage(offset - padding, a_storage);
                let mut b_storage = b_blocks.clone();
                b_storage.extend(std::iter::repeat_n(0, padding));
                let b = with_storage(offset, b_storage);
                let a_expected = bits_of(offset, &a_blocks);
                let b_expected = bits_of(offset, &b_blocks);

                assert_eq!(a.is_superset(&b), a_expected.is_superset(&b_expected));
                assert_eq!(
                    a.is_proper_superset(&b),
                    a_expected.is_superset(&b_expected) && a_expected != b_expected
                );
                assert_eq!(a.is_subset(&b), a_expected.is_subset(&b_expected));
                assert_eq!(b.is_subset(&a), b_expected.is_subset(&a_expected));
            }
        }
    }
}

#[test]
fn encoding_edge_cases() {
    // The empty set, single bits, the bounds of the range, a full block, sets with an offset, and
    // bits spanning several bytes. (A set with both bit 0 and `u32::MAX` would allocate 512 MiB,
    // as the set is meant for bounded ranges.)
    for bits in [
        &[][..],
        &[0],
        &[7],
        &[8],
        &[u32::MAX],
        &[u32::MAX - 70_000, u32::MAX - 1, u32::MAX],
        &[0, 1, 63, 64, 65_535, 65_536],
        &(0..64).collect::<Vec<_>>(),
        &(1_000..1_064).collect::<Vec<_>>(),
        &(4_000_000..4_000_200).step_by(3).collect::<Vec<_>>(),
    ] {
        let (set, expected) = from_bits(bits);
        check(&set, &expected);
    }
    assert_eq!(encode(&Bitset::new()), [0]);
}

#[test]
fn encoding_form_rule() {
    // Uses the list form iff `5 * n < 4 * len` (`n` bits, `len` bytes of bitmap payload).
    for (bits, list) in [
        // Two high bits far apart: n = 2, len = 12,501.
        (&[4_000_000_000, 4_000_100_000][..], true),
        // A single bit has a 1-byte payload, so it always uses the bitmap.
        (&[4_000_000_000], false),
        (&[0], false),
        // A full block: n = 64, len = 8.
        (&(0..64).collect::<Vec<_>>(), false),
        (&[1, 300, 9_000], true),
        (&[1, 2, 3, 5, 8, 13], false),
        // High bits close together: n = 2, len = 3. The bitmap would be about as small, but the
        // rule only looks at `n` and `len`.
        (&[1 << 31, (1 << 31) + 16], true),
        // n = 3, len = 4: 15 < 16.
        (&[0, 1, 31], true),
        // n = 4, len = 5: 20 == 20, so the bitmap.
        (&[0, 1, 2, 39], false),
        // n = 4, len = 6: 20 < 24.
        (&[0, 1, 2, 47], true),
    ] {
        let (set, expected) = from_bits(bits);
        assert_eq!(reference_prefers_list(&expected), list, "{bits:?}");
        assert_eq!(header(&encode(&set)) < 0, list, "{bits:?}");
        check_encoding(&set, &expected);
    }
    // A bitmap with a multi-byte header (whose first byte is the odd varint marker 251).
    let large_bitmap = encode(&(0..1_024).collect::<Bitset>());
    assert_eq!(large_bitmap[0], 251);
    assert!(header(&large_bitmap) > 0);

    // Random sets use both forms, and always the one chosen by the rule (checked by
    // `check_encoding`, which also checks that the fixed-int config uses the bitmap).
    let mut rng = Lcg(3);
    let (mut lists, mut bitmaps) = (0, 0);
    for round in 0..400 {
        let universe = [16, 200, 5_000, 1 << 20][round % 4];
        let base = [0, 1 << 31][round % 2];
        let count = rng.next() % 300;
        let bits = (0..count)
            .map(|_| base + rng.next() % universe)
            .collect::<Vec<_>>();
        let (set, expected) = from_bits(&bits);
        check_encoding(&set, &expected);
        if !expected.is_empty() {
            if reference_prefers_list(&expected) {
                lists += 1;
            } else {
                bitmaps += 1;
            }
        }
    }
    assert!(
        lists > 50 && bitmaps > 50,
        "lists: {lists}, bitmaps: {bitmaps}"
    );
}

/// The sizes of an encoding's parts: the bytes of the list form's differences (after the first
/// item), and the totals of both forms.
struct FormSizes {
    differences: usize,
    list_total: usize,
    bitmap_len: usize,
    bitmap_total: usize,
}

fn form_sizes(bits: &[u32]) -> FormSizes {
    let differences = bits
        .windows(2)
        .map(|pair| {
            bincode::encode_to_vec(pair[1] - pair[0], STANDARD)
                .unwrap()
                .len()
        })
        .sum();
    let bitmap_len = (*bits.last().unwrap() / 8 - bits[0] / 8 + 1) as usize;
    FormSizes {
        differences,
        list_total: reference_list_encoding(bits, STANDARD).len(),
        bitmap_len,
        bitmap_total: reference_bitmap_encoding(bits, STANDARD).len(),
    }
}

#[test]
fn encoding_size_bounds() {
    // Sets of different shapes: random dense and sparse ones, clusters of consecutive bits far
    // apart, gaps just above the 1-byte varint limit (250), huge gaps, and bits up to `u32::MAX`.
    let mut rng = Lcg(11);
    let mut sets: Vec<Vec<u32>> = Vec::new();
    for count in [1, 2, 3, 5, 10, 50, 200, 1_000, 3_000] {
        for universe in [64, 1_000, 10_000, 100_000, 1 << 24] {
            for base in [0, 1 << 31, u32::MAX - universe] {
                sets.push((0..count).map(|_| base + rng.next() % universe).collect());
            }
        }
    }
    for clusters in [1, 2, 5, 20] {
        for width in [1, 3, 16, 100] {
            for gap in [300, 5_000, 70_000] {
                sets.push(
                    (0..clusters)
                        .flat_map(|cluster| (0..width).map(move |i| cluster * gap + i))
                        .collect(),
                );
            }
        }
    }
    for count in [2, 10, 100, 1_000] {
        sets.push((0..count).map(|i| i * 251).collect());
        sets.push((0..count).map(|i| i * (251 + i % 10)).collect());
        sets.push((0..count.min(60_000)).map(|i| i * 65_537).collect());
        sets.push((0..count).map(|i| u32::MAX - i * 251).collect());
    }

    let (mut lists, mut bitmaps) = (0, 0);
    for bits in sets {
        let (set, expected) = from_bits(&bits);
        let bits = expected.iter().copied().collect::<Vec<_>>();
        let sizes = form_sizes(&bits);
        let n = bits.len();
        if reference_prefers_list(&expected) {
            lists += 1;
            assert!(
                sizes.differences < sizes.bitmap_len,
                "list differences {} >= bitmap payload {} for {n} bits",
                sizes.differences,
                sizes.bitmap_len
            );
            assert!(
                sizes.list_total <= sizes.bitmap_total + 13,
                "list {} > bitmap {} + 13 for {n} bits",
                sizes.list_total,
                sizes.bitmap_total
            );
        } else {
            bitmaps += 1;
            // Every list item takes at least one byte, so the list payload is at least `n`.
            assert!(
                4 * sizes.bitmap_len <= 5 * n,
                "bitmap payload {} > 1.25 * {n}",
                sizes.bitmap_len
            );
        }
        // The chosen form is the reference encoding of that form, and both forms decode.
        check_encoding(&set, &expected);
        for bytes in [
            reference_list_encoding(&bits, STANDARD),
            reference_bitmap_encoding(&bits, STANDARD),
        ] {
            assert_eq!(decode(&bytes).unwrap(), set);
        }
        let fixint = config::standard().with_fixed_int_encoding();
        for bytes in [
            reference_list_encoding(&bits, fixint),
            reference_bitmap_encoding(&bits, fixint),
        ] {
            let (decoded, _): (Bitset, _) = bincode::decode_from_slice(&bytes, fixint).unwrap();
            assert_eq!(decoded, set);
        }
    }
    assert!(
        lists > 50 && bitmaps > 20,
        "lists {lists}, bitmaps {bitmaps}"
    );
}

#[test]
fn encoding_ignores_the_storage_range() {
    // Zero blocks around the bits don't change the encoding.
    let trimmed = with_storage(5, vec![0b1011]);
    let padded = with_storage(3, vec![0, 0, 0b1011, 0, 0]);
    assert_eq!(encode(&trimmed), encode(&padded));
    check(&padded, &bits_of(5, &[0b1011]));
}

/// Encodes a header with the standard config.
fn raw_header(len: i64) -> Vec<u8> {
    bincode::encode_to_vec(len, STANDARD).unwrap()
}

/// Encodes a list header, the bitmap form's payload length `span` and unsigned `u32` items with
/// the standard config.
fn raw_list(len: i64, span: u32, items: &[u32]) -> Vec<u8> {
    let mut bytes = raw_header(len);
    bytes.extend(bincode::encode_to_vec(span, STANDARD).unwrap());
    for &item in items {
        bytes.extend(bincode::encode_to_vec(item, STANDARD).unwrap());
    }
    bytes
}

/// Encodes a header, a `u32` and raw payload bytes with the standard config.
fn raw_bitmap(len: i64, byte_offset: u32, payload: &[u8]) -> Vec<u8> {
    let mut bytes = raw_header(len);
    bytes.extend(bincode::encode_to_vec(byte_offset, STANDARD).unwrap());
    bytes.extend_from_slice(payload);
    bytes
}

/// A bincode writer that collects the encoded bytes.
#[derive(Default)]
struct BytesWriter(Vec<u8>);

impl Writer for BytesWriter {
    fn write(&mut self, bytes: &[u8]) -> Result<(), EncodeError> {
        self.0.extend_from_slice(bytes);
        Ok(())
    }
}

/// The list form produced through bincode's normal integer encoding, independent of the
/// encoder's optimized fast paths.
fn reference_list_encoding<C: config::Config>(bits: &[u32], config: C) -> Vec<u8> {
    let mut encoder = EncoderImpl::new(BytesWriter::default(), config);
    (-(bits.len() as i64)).encode(&mut encoder).unwrap();
    let len = *bits.last().unwrap() / 8 - bits[0] / 8 + 1;
    len.encode(&mut encoder).unwrap();
    let mut previous: Option<u32> = None;
    for &bit in bits {
        match previous {
            None => bit.encode(&mut encoder).unwrap(),
            Some(previous) => (bit - previous).encode(&mut encoder).unwrap(),
        }
        previous = Some(bit);
    }
    encoder.into_writer().0
}

/// The bitmap form produced from a set's bits, independent of the implementation's storage.
fn reference_bitmap_encoding<C: config::Config>(bits: &[u32], config: C) -> Vec<u8> {
    let first_byte = bits[0] / 8;
    let last_byte = *bits.last().unwrap() / 8;
    let mut payload = vec![0; (last_byte - first_byte + 1) as usize];
    for &bit in bits {
        payload[(bit / 8 - first_byte) as usize] |= 1 << (bit % 8);
    }
    let mut encoder = EncoderImpl::new(BytesWriter::default(), config);
    (payload.len() as i64).encode(&mut encoder).unwrap();
    first_byte.encode(&mut encoder).unwrap();
    let mut bytes = encoder.into_writer().0;
    bytes.extend(payload);
    bytes
}

#[test]
fn decoding_accepts_untrimmed_bitmaps() {
    // Zero bytes at both ends of the payload aren't produced by the encoder, but are valid.
    let bytes = raw_bitmap(4, 10, &[0, 0b101, 0, 0]);
    let set = decode(&bytes).unwrap();
    assert_eq!(set.iter().collect::<Vec<_>>(), [88, 90]);
    assert_eq!(set, from_bits(&[88, 90]).0);
}

#[test]
fn decoding_rejects_malformed_input() {
    let cases: Vec<(&str, Vec<u8>)> = vec![
        ("i64::MIN", raw_header(i64::MIN)),
        ("too many items", raw_list(-(1 << 32) - 1, 1, &[0])),
        ("bitmap past u32", raw_bitmap(2, (1 << 29) - 1, &[1, 1])),
        ("huge bitmap", raw_bitmap(i64::MAX, 0, &[])),
        ("zero difference", raw_list(-2, 1, &[5, 0])),
        ("difference past u32", raw_list(-2, 1, &[u32::MAX, 1])),
        ("truncated header", vec![]),
        ("truncated bitmap", raw_bitmap(4, 0, &[1, 2])),
        ("truncated list", raw_list(-3, 1, &[1, 1])),
        ("truncated list span", raw_header(-2)),
        ("zero list span", raw_list(-2, 0, &[1, 1])),
        ("list span past u32", raw_list(-1, 2, &[u32::MAX])),
        ("item past the list span", raw_list(-2, 1, &[1, 8])),
        ("item far past the list span", raw_list(-2, 2, &[1, 1_000])),
        ("list span too long", raw_list(-2, 3, &[1, 8])),
        ("list span too long for one item", raw_list(-1, 2, &[100])),
    ];
    for (name, bytes) in cases {
        assert!(decode(&bytes).is_err(), "{name} was accepted");
    }
    // The same lists with exact spans are valid.
    assert_eq!(
        decode(&raw_list(-2, 1, &[1, 1])).unwrap(),
        from_bits(&[1, 2]).0
    );
    assert_eq!(
        decode(&raw_list(-2, 2, &[1, 8])).unwrap(),
        from_bits(&[1, 9]).0
    );
    assert_eq!(
        decode(&raw_list(-1, 1, &[u32::MAX])).unwrap(),
        from_bits(&[u32::MAX]).0
    );

    // Every proper prefix of valid encodings of both forms fails.
    for bits in [
        &[3, 900, 70_000][..],
        &(100..300).step_by(2).collect::<Vec<_>>(),
    ] {
        let bytes = encode(&from_bits(bits).0);
        for len in 0..bytes.len() {
            assert!(decode(&bytes[..len]).is_err(), "prefix {len} of {bits:?}");
        }
    }
}

#[test]
fn encoding_matches_reference_wire_format() {
    // Varint boundaries of both the first item and the differences, at offsets where the list form
    // is clearly smaller than the bitmap.
    let lists = [
        &[100_000, 100_250][..],
        &[100_000, 100_251],
        &[100_000, 165_535],
        &[100_000, 165_536],
        &[250, 2_250],
        &[251, 2_251],
        &[65_535, 67_535],
        &[65_536, 67_536],
        // The payload length of the list form at its varint boundary (250 and 251 bytes).
        &[100_000, 101_999],
        &[100_000, 102_007],
        &[4_000_000_000, 4_000_100_000],
    ];
    for bits in lists {
        let expected = bits.iter().copied().collect::<BTreeSet<_>>();
        assert!(
            reference_prefers_list(&expected),
            "{bits:?} should use list form"
        );
        let set = bits.iter().copied().collect::<Bitset>();
        assert_eq!(
            encode(&set),
            reference_list_encoding(bits, STANDARD),
            "standard list {bits:?}"
        );
        let fixint = config::standard().with_fixed_int_encoding();
        assert_eq!(
            bincode::encode_to_vec(&set, fixint).unwrap(),
            reference_bitmap_encoding(bits, fixint),
            "fixint uses the bitmap form {bits:?}"
        );
        // The decoder accepts the list form in the fixed-int config too.
        let fixint_list = reference_list_encoding(bits, fixint);
        let (decoded, _): (Bitset, _) = bincode::decode_from_slice(&fixint_list, fixint).unwrap();
        assert_eq!(decoded, set, "fixint list {bits:?}");
        // Big-endian integers, with varints and with fixed-width integers.
        let big_endian = config::standard().with_big_endian();
        assert_eq!(
            bincode::encode_to_vec(&set, big_endian).unwrap(),
            reference_list_encoding(bits, big_endian),
            "big-endian list {bits:?}"
        );
        let big_fixint = big_endian.with_fixed_int_encoding();
        assert_eq!(
            bincode::encode_to_vec(&set, big_fixint).unwrap(),
            reference_bitmap_encoding(bits, big_fixint),
            "big-endian fixint {bits:?}"
        );
    }

    let bitmaps = [
        &(0..64).collect::<Vec<_>>()[..],
        &(8..72).step_by(2).collect::<Vec<_>>(),
        &(1_000..1_064).collect::<Vec<_>>(),
    ];
    for bits in bitmaps {
        let expected = bits.iter().copied().collect::<BTreeSet<_>>();
        assert!(
            !reference_prefers_list(&expected),
            "{bits:?} should use bitmap form"
        );
        let set = bits.iter().copied().collect::<Bitset>();
        assert_eq!(
            encode(&set),
            reference_bitmap_encoding(bits, STANDARD),
            "standard bitmap {bits:?}"
        );
        let fixint = config::standard().with_fixed_int_encoding();
        assert_eq!(
            bincode::encode_to_vec(&set, fixint).unwrap(),
            reference_bitmap_encoding(bits, fixint),
            "fixint bitmap {bits:?}"
        );
        fn check_big_endian<C: config::Config>(set: &Bitset, bits: &[u32], config: C) {
            let bytes = bincode::encode_to_vec(set, config).unwrap();
            assert_eq!(
                bytes,
                reference_bitmap_encoding(bits, config),
                "big-endian bitmap {bits:?}"
            );
            let (decoded, _): (Bitset, _) = bincode::decode_from_slice(&bytes, config).unwrap();
            assert_eq!(&decoded, set);
        }
        let big_endian = config::standard().with_big_endian();
        check_big_endian(&set, bits, big_endian);
        check_big_endian(&set, bits, big_endian.with_fixed_int_encoding());
    }
}

#[test]
fn encoding_rule_boundaries() {
    // Search a small deterministic space for sets just below, at and just above the threshold
    // `5 * n == 4 * len`.
    let (mut below, mut at, mut above) = (0, 0, 0);
    for first in (0..3_000).step_by(7) {
        for count in 1..6u32 {
            for gap in 1..400 {
                let bits = (0..count).map(|i| first + i * gap).collect::<Vec<_>>();
                let n = 5 * count as i64;
                let len = 4 * (bits[bits.len() - 1] / 8 - first / 8 + 1) as i64;
                let set = bits.iter().copied().collect::<Bitset>();
                let expected = match n - len {
                    -4..=-1 => {
                        below += 1;
                        reference_list_encoding(&bits, STANDARD)
                    }
                    0 => {
                        at += 1;
                        reference_bitmap_encoding(&bits, STANDARD)
                    }
                    1..=4 => {
                        above += 1;
                        reference_bitmap_encoding(&bits, STANDARD)
                    }
                    _ => continue,
                };
                assert_eq!(encode(&set), expected, "{bits:?}");
            }
        }
    }
    assert!(below > 20 && at > 20 && above > 20, "{below} {at} {above}");
}

#[test]
fn borrow_decode_matches_decode() {
    for bits in [
        &[][..],
        &[8],
        &[4_000_000_000],
        &(0..300).collect::<Vec<_>>(),
    ] {
        let set = bits.iter().copied().collect::<Bitset>();
        let bytes = encode(&set);
        let mut decoder = DecoderImpl::new(SliceReader::new(&bytes), STANDARD, ());
        let decoded = Bitset::borrow_decode(&mut decoder).unwrap();
        assert_eq!(decoded, set);
        assert!(decoder.borrow_reader().take_bytes(1).is_err());
    }
}

#[test]
fn decoding_claims_the_storage_from_the_limit() {
    let limited = config::standard().with_limit::<64>();
    let decode_limited =
        |bytes: &[u8]| bincode::decode_from_slice::<Bitset, _>(bytes, limited).map(|(set, _)| set);
    // Two bits far apart need a large storage even though the list form is tiny.
    let far_apart = encode(&from_bits(&[0, 1 << 20]).0);
    assert!(far_apart.len() < 16);
    assert!(header(&far_apart) < 0);
    assert!(matches!(
        decode_limited(&far_apart),
        Err(DecodeError::LimitExceeded)
    ));
    // A list whose span claims far more storage than the limit fails before allocating it.
    let huge_span = raw_list(-2, 1 << 28, &[0, (1 << 31) - 1]);
    assert!(matches!(
        decode_limited(&huge_span),
        Err(DecodeError::LimitExceeded)
    ));
    // Every item is claimed like `u32::decode` does (4 bytes), even if it is a single byte: 100
    // single-byte items exceed a 64-byte limit although their storage is small.
    let mut items = vec![0];
    items.extend([1; 99]);
    let many_items = raw_list(-100, 13, &items);
    assert_eq!(decode(&many_items).unwrap(), (0..100).collect::<Bitset>());
    assert!(matches!(
        decode_limited(&many_items),
        Err(DecodeError::LimitExceeded)
    ));
    // A bitmap larger than the limit.
    let big = encode(&(0..1_000).collect::<Bitset>());
    assert!(matches!(
        decode_limited(&big),
        Err(DecodeError::LimitExceeded)
    ));
    // Small sets fit into the limit.
    let small = from_bits(&[3, 70, 100]).0;
    assert_eq!(decode_limited(&encode(&small)).unwrap(), small);
}

/// A straightforward decoder of the encoding that goes through bincode's integer decoding for every
/// item and sets every bit separately, with the same validation and the same claims from the
/// decoder's limit (4 bytes per `u32`, the storage blocks). The real decoder must accept exactly
/// the same inputs.
fn reference_decode<D: bincode::de::Decoder>(
    decoder: &mut D,
) -> Result<BTreeSet<u32>, DecodeError> {
    use bincode::{Decode, de::read::Reader};
    const MAX_BYTES: u64 = 1 << 29;
    let invalid = || DecodeError::Other("invalid");
    let block_bytes = usize::BITS as u64 / 8;
    let claim_storage = |decoder: &mut D, byte_offset: u64, len: u64| {
        if len > MAX_BYTES || byte_offset + len > MAX_BYTES {
            return Err(invalid());
        }
        let blocks = (byte_offset + len).div_ceil(block_bytes) - byte_offset / block_bytes;
        decoder.claim_bytes_read((blocks * block_bytes) as usize)
    };
    let header = i64::decode(decoder)?;
    let mut bits = BTreeSet::new();
    if header > 0 {
        let len = header as u64;
        let byte_offset = u32::decode(decoder)? as u64;
        claim_storage(decoder, byte_offset, len)?;
        for i in 0..len {
            let mut byte = [0];
            decoder.reader().read(&mut byte)?;
            for j in 0..8 {
                if byte[0] & (1 << j) != 0 {
                    bits.insert((8 * (byte_offset + i) + j) as u32);
                }
            }
        }
    } else if header < 0 {
        let count = header.unsigned_abs();
        if count > 1 << 32 {
            return Err(invalid());
        }
        let len = u32::decode(decoder)? as u64;
        if len == 0 || count > len * 8 {
            return Err(invalid());
        }
        let first = u32::decode(decoder)? as u64;
        claim_storage(decoder, first / 8, len)?;
        let end = (first / 8 + len) * 8;
        let mut bit = first;
        bits.insert(bit as u32);
        for _ in 1..count {
            let difference = u32::decode(decoder)? as u64;
            bit += difference;
            if difference == 0 || bit >= end {
                return Err(invalid());
            }
            bits.insert(bit as u32);
        }
        if bit / 8 != first / 8 + len - 1 {
            return Err(invalid());
        }
    }
    Ok(bits)
}

/// Decodes `bytes` with the real and the reference decoder under `config`, and checks that both
/// accept or both reject it, with the same set and the same number of bytes read.
fn check_decoders_agree<C: config::Config>(bytes: &[u8], config: C) -> bool {
    let real = bincode::decode_from_slice::<Bitset, _>(bytes, config)
        .map(|(set, read)| (set.iter().collect::<BTreeSet<_>>(), read));
    let mut decoder = DecoderImpl::new(SliceReader::new(bytes), config, ());
    let reference = reference_decode(&mut decoder).map(|bits| {
        let mut remaining = 0;
        while decoder.borrow_reader().take_bytes(1).is_ok() {
            remaining += 1;
        }
        (bits, bytes.len() - remaining)
    });
    match (&real, &reference) {
        (Ok(a), Ok(b)) => assert_eq!(a, b, "{bytes:?}"),
        (Err(_), Err(_)) => {}
        _ => panic!(
            "decoders disagree on {bytes:?}: real {:?}, reference {:?}",
            real.as_ref().map(|r| r.1),
            reference.as_ref().map(|r| r.1)
        ),
    }
    real.is_ok()
}

#[test]
fn decoder_matches_the_reference_decoder() {
    // Valid encodings of random sets of both forms, and corruptions of them (truncations and
    // replaced bytes, including zero differences and varint markers), with and without limits.
    let mut rng = Lcg(11);
    let (mut inputs, mut accepted) = (0, 0);
    for round in 0..300 {
        let universe = [8, 64, 300, 2_000, 16_384, 1 << 20][round % 6];
        let base = [0, 13, 1_000_000, u32::MAX - universe][round % 4];
        let count = rng.next() % 200;
        let bits = (0..count)
            .map(|_| base + rng.next() % universe)
            .collect::<Vec<_>>();
        let bytes = encode(&from_bits(&bits).0);
        let mut variants = vec![bytes.clone()];
        for _ in 0..4 {
            variants.push(bytes[..rng.next() as usize % bytes.len()].to_vec());
        }
        for _ in 0..6 {
            let at = rng.next() as usize % bytes.len();
            for value in [0, 1, 7, 63, 250, 251, 252, 255] {
                let mut variant = bytes.clone();
                variant[at] = value;
                variants.push(variant);
            }
        }
        for variant in variants {
            inputs += 1;
            accepted += check_decoders_agree(&variant, STANDARD) as usize;
            check_decoders_agree(&variant, config::standard().with_limit::<64>());
            check_decoders_agree(&variant, config::standard().with_limit::<512>());
            check_decoders_agree(&variant, config::standard().with_limit::<4096>());
        }
    }
    // Both valid and invalid inputs were covered.
    assert!(
        accepted > 300 && inputs - accepted > 3_000,
        "{accepted} of {inputs}"
    );
}

/// Checks the binary operations of two sets against the reference sets.
fn check_operations(
    a: &Bitset,
    a_expected: &BTreeSet<u32>,
    b: &Bitset,
    b_expected: &BTreeSet<u32>,
) {
    let intersection = a_expected
        .intersection(b_expected)
        .copied()
        .collect::<BTreeSet<_>>();
    check(&(a & b), &intersection);
    assert_eq!(a.intersection_len(b), intersection.len());
    assert_eq!(a.is_disjoint(b), intersection.is_empty());
    let difference = a_expected
        .difference(b_expected)
        .copied()
        .collect::<BTreeSet<_>>();
    check(&(a - b), &difference);
}

#[test]
fn operations_on_disjoint_and_shifted_ranges() {
    let sets = [
        &[][..],
        &[5],
        &[5, 64, 200],
        &[1_000, 1_001, 5_000],
        &[64, 65, 66, 1_000],
        &(0..300).collect::<Vec<_>>(),
    ];
    for a in sets {
        for b in sets {
            let (a, a_expected) = from_bits(a);
            let (b, b_expected) = from_bits(b);
            check_operations(&a, &a_expected, &b, &b_expected);
        }
    }
    // Storage with zero blocks around the bits.
    let a = with_storage(2, vec![0, 0b110, 0]);
    let b = with_storage(0, vec![0, 0, 0, 0b011, 0]);
    check_operations(
        &a,
        &bits_of(2, &[0, 0b110, 0]),
        &b,
        &bits_of(0, &[0, 0, 0, 0b011]),
    );
}

#[test]
fn remove() {
    let (mut set, mut expected) = from_bits(&[3, 64, 200]);
    assert!(set.remove(64));
    assert!(!set.remove(64));
    assert!(!set.remove(1_000_000));
    assert!(!set.remove(0));
    expected.remove(&64);
    check(&set, &expected);
    assert!(set.remove(3));
    assert!(set.remove(200));
    check(&set, &BTreeSet::new());
    assert_eq!(set, Bitset::new());
    assert_eq!(hash(&set), hash(&Bitset::new()));
}

#[test]
fn shrink_to_fit() {
    let mut set = with_storage(2, vec![0, 0b110, 0, 0]);
    set.blocks.reserve(100);
    let expected = bits_of(2, &[0, 0b110]);
    set.shrink_to_fit();
    check(&set, &expected);
    assert_eq!((set.offset, set.blocks.len()), (3, 1));
    // `Vec::shrink_to_fit` doesn't promise an exact capacity, but it drops the reserved space.
    assert!(set.blocks.capacity() < 100);

    let mut empty = with_storage(5, vec![0, 0]);
    empty.shrink_to_fit();
    assert_eq!(empty.blocks.capacity(), 0);
    check(&empty, &BTreeSet::new());
}

#[test]
fn to_roaring() {
    // Bits spanning several containers, and the highest possible bits. (A set with both bit 0 and
    // `u32::MAX` would allocate 512 MiB, as the set is meant for bounded ranges.)
    for bits in [
        &[0, 1, 63, 64, 65_535, 65_536, 1 << 20][..],
        &[u32::MAX - 70_000, u32::MAX - 1, u32::MAX],
    ] {
        let (set, expected) = from_bits(bits);
        let roaring = set.to_roaring();
        assert_eq!(roaring, expected.iter().copied().collect::<RoaringBitmap>());
    }
}

#[test]
fn to_roaring_container_types() {
    // A dense container (stored as a bitmap by roaring), a sparse one (stored as an array), a
    // container at exactly the array limit, and a range that starts in the middle of a container.
    let bits = (0..5_000)
        .chain(70_000..70_010)
        .chain((2 << 16)..(2 << 16) + 4_096)
        .chain((3 << 16) + 1_000..(3 << 16) + 9_000)
        .collect::<Vec<u32>>();
    let (set, expected) = from_bits(&bits);
    check(&set, &expected);
    let roaring = set.to_roaring();
    let inserted = bits.iter().copied().collect::<RoaringBitmap>();
    assert_eq!(roaring, inserted);
    // The serialization (which `RoaringBitmapWrapper` uses for hashing) is identical too.
    let mut a = Vec::new();
    let mut b = Vec::new();
    roaring.serialize_into(&mut a).unwrap();
    inserted.serialize_into(&mut b).unwrap();
    assert_eq!(a, b);
}

/// A small deterministic linear congruential generator, so the test needs no random number crate.
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

#[test]
fn differential() {
    let mut rng = Lcg(42);
    for round in 0..200 {
        // Vary the universe, so that the sets are sometimes dense and sometimes sparse.
        let universe = [64, 200, 1_000, 20_000, 1 << 20][round % 5];
        let base = if round % 3 == 0 {
            rng.next() % 100_000
        } else {
            0
        };
        let gen_set = |rng: &mut Lcg| {
            let count = rng.next() % 50;
            let bits = (0..count)
                .map(|_| base + rng.next() % universe)
                .collect::<Vec<_>>();
            from_bits(&bits)
        };
        let (mut a, mut a_expected) = gen_set(&mut rng);
        let (b, b_expected) = gen_set(&mut rng);
        check(&a, &a_expected);
        check(&b, &b_expected);
        check_operations(&a, &a_expected, &b, &b_expected);
        check_operations(&b, &b_expected, &a, &a_expected);

        let is_superset = a_expected.is_superset(&b_expected);
        assert_eq!(a.is_superset(&b), is_superset);
        assert_eq!(
            a.is_proper_superset(&b),
            is_superset && a_expected != b_expected
        );
        assert_eq!(a.is_subset(&b), a_expected.is_subset(&b_expected));
        assert_eq!(a == b, a_expected == b_expected);

        a |= &b;
        a_expected.extend(b_expected.iter().copied());
        check(&a, &a_expected);
        assert!(a.is_superset(&b));
    }
}

#[test]
fn differential_dense() {
    // Dense sets over a few blocks, where most blocks are full and the sets often overlap or
    // contain each other.
    let mut rng = Lcg(7);
    for round in 0..300 {
        let universe = [64, 128, 300, 1_000][round % 4];
        let base = [0, 64, 1_000][round % 3];
        let gen_set = |rng: &mut Lcg, density: u32| {
            let bits = (0..universe)
                .filter(|_| rng.next() % 100 < density)
                .map(|i| base + i)
                .collect::<Vec<_>>();
            from_bits(&bits)
        };
        let density = [50, 90, 100][round % 3];
        let (mut a, mut a_expected) = gen_set(&mut rng, density);
        let (b, b_expected) = if round % 2 == 0 {
            // A subset of `a`.
            let bits = a_expected
                .iter()
                .copied()
                .filter(|_| rng.next().is_multiple_of(2))
                .collect::<Vec<_>>();
            from_bits(&bits)
        } else {
            gen_set(&mut rng, density)
        };
        check(&a, &a_expected);
        check(&b, &b_expected);
        check_operations(&a, &a_expected, &b, &b_expected);
        check_operations(&b, &b_expected, &a, &a_expected);

        let is_superset = a_expected.is_superset(&b_expected);
        assert_eq!(a.is_superset(&b), is_superset);
        assert_eq!(
            a.is_proper_superset(&b),
            is_superset && a_expected != b_expected
        );
        assert_eq!(a.is_subset(&b), a_expected.is_subset(&b_expected));
        assert_eq!(b.is_subset(&a), b_expected.is_subset(&a_expected));
        assert_eq!(a == b, a_expected == b_expected);

        a |= &b;
        a_expected.extend(b_expected.iter().copied());
        check(&a, &a_expected);
    }
}
