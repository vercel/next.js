//! Compares [`Bitset`] with [`FixedBitSet`] and [`RoaringBitmap`] on the operations that the
//! module graph algorithms use, over a range of bit densities.
//!
//! Every benchmark id is `<impl>/<input>`, see [`inputs`] for the input names.
//!
//! The `serialize` and `deserialize` groups use the writer and reader that Turbopack persists
//! with (`turbo_bincode`'s `TurboBincodeWriter` into a new `TurboBincodeBuffer` and
//! `TurboBincodeReader`, with bincode's standard config): `Bitset` with its own encoding, and
//! `RoaringBitmap` through its serde implementation (the portable Roaring format).
//!
//! The `hash` group hashes the sets with `FxHasher` through `std::hash::Hash` (`RoaringBitmap`
//! doesn't implement `Hash`), and `hash_encode` hashes a `Bitset` like a task input is hashed for
//! the persistent cache: encoded with `turbo_bincode`'s hash encoder into an `Xxh3Hash64Hasher`.

#[path = "common/inputs.rs"]
mod inputs;

use std::{
    hash::{BuildHasher, Hash},
    hint::black_box,
};

use bincode::Encode;
use criterion::{BatchSize, BenchmarkId, Criterion, criterion_group, criterion_main};
use fixedbitset::FixedBitSet;
use roaring::RoaringBitmap;
use rustc_hash::FxBuildHasher;
use turbo_bincode::{
    TURBO_BINCODE_CONFIG, TurboBincodeBuffer, TurboBincodeReader, TurboBincodeWriter,
    new_hash_encoder, turbo_bincode_decode, turbo_bincode_encode,
};
use turbo_bitset::Bitset;
use turbo_tasks_hash::Xxh3Hash64Hasher;

use self::inputs::{Input, Lcg, inputs};

fn bitset(bits: &[u32]) -> Bitset {
    bits.iter().copied().collect()
}

fn fixed(bits: &[u32]) -> FixedBitSet {
    let len = bits.iter().max().map_or(0, |&max| max as usize + 1);
    let mut set = FixedBitSet::with_capacity(len);
    for &bit in bits {
        set.insert(bit as usize);
    }
    set
}

fn roaring(bits: &[u32]) -> RoaringBitmap {
    bits.iter().copied().collect()
}

/// Encodes like Turbopack persists a value: into a new `TurboBincodeBuffer`.
fn encode_bitset(set: &Bitset) -> TurboBincodeBuffer {
    turbo_bincode_encode(set).unwrap()
}

fn decode_bitset(bytes: &[u8]) -> Bitset {
    turbo_bincode_decode(bytes).unwrap()
}

/// Encodes through serde with the same writer and config as [`encode_bitset`].
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

/// Decodes through serde with the same reader and config as [`decode_bitset`].
fn decode_roaring(bytes: &[u8]) -> RoaringBitmap {
    bincode::serde::decode_from_reader(TurboBincodeReader::new(bytes), TURBO_BINCODE_CONFIG)
        .unwrap()
}

/// Hashes like a task input is hashed for the persistent cache.
fn hash_encode<T: Encode>(value: &T) -> u64 {
    let mut hasher = Xxh3Hash64Hasher::new();
    value.encode(&mut new_hash_encoder(&mut hasher)).unwrap();
    hasher.finish()
}

fn fx_hash<T: Hash>(value: &T) -> u64 {
    FxBuildHasher.hash_one(value)
}

/// The setup and the measured operation of one implementation in [`bench_all`].
struct Impl<Setup, Run> {
    /// Builds the per-input state from the input, outside of the measurement.
    setup: Setup,
    /// The measured operation.
    run: Run,
}

/// Creates an [`Impl`]. (A function instead of a struct literal so that the closure argument
/// types are inferred.)
fn imp<S>(
    setup: impl Fn(&Input) -> S,
    run: impl Fn(&S),
) -> Impl<impl Fn(&Input) -> S, impl Fn(&S)> {
    Impl { setup, run }
}

/// Benchmarks the three implementations on every input.
fn bench_all<O, F, R>(
    c: &mut Criterion,
    name: &str,
    inputs: &[Input],
    bitset: Impl<impl Fn(&Input) -> O, impl Fn(&O)>,
    fixed: Impl<impl Fn(&Input) -> F, impl Fn(&F)>,
    roaring: Impl<impl Fn(&Input) -> R, impl Fn(&R)>,
) {
    let mut group = c.benchmark_group(format!("bitset/{name}"));
    for input in inputs {
        let state = (bitset.setup)(input);
        group.bench_function(BenchmarkId::new("Bitset", &input.name), |b| {
            b.iter(|| (bitset.run)(black_box(&state)))
        });
        let state = (fixed.setup)(input);
        group.bench_function(BenchmarkId::new("FixedBitSet", &input.name), |b| {
            b.iter(|| (fixed.run)(black_box(&state)))
        });
        let state = (roaring.setup)(input);
        group.bench_function(BenchmarkId::new("RoaringBitmap", &input.name), |b| {
            b.iter(|| (roaring.run)(black_box(&state)))
        });
    }
    group.finish();
}

/// Checks outside of any measurement that the implementations agree on the inputs.
fn validate(inputs: &[Input]) {
    let as_usize = |bits: &[u32]| bits.iter().map(|&b| b as usize).collect::<Vec<_>>();
    for input in inputs {
        let a = fixed(&input.bits);
        assert_eq!(a.ones().collect::<Vec<_>>(), as_usize(&input.bits));
        assert_eq!(
            input
                .bits
                .iter()
                .map(|&b| b as usize)
                .collect::<FixedBitSet>(),
            a
        );
        let mut inserted = FixedBitSet::new();
        for &bit in &shuffled(&input.bits) {
            inserted.grow_and_insert(bit as usize);
        }
        assert_eq!(inserted.ones().collect::<Vec<_>>(), as_usize(&input.bits));
        assert_eq!(a.count_ones(..), bitset(&input.bits).count_ones());

        let mut union = a.clone();
        union.union_with(&fixed(&input.other_bits));
        let mut bitset_union = bitset(&input.bits);
        bitset_union |= &bitset(&input.other_bits);
        assert_eq!(
            union.ones().collect::<Vec<_>>(),
            bitset_union.iter().map(|b| b as usize).collect::<Vec<_>>()
        );

        for (other, superset) in [
            (&input.subset_bits, true),
            (&input.not_subset_bits, false),
            (&input.bits, true),
        ] {
            let proper = superset && input.bits.len() != other.len();
            let b = fixed(other);
            assert_eq!(a.is_superset(&b), superset);
            assert_eq!(
                a.is_superset(&b) && a.count_ones(..) != b.count_ones(..),
                proper
            );
            assert_eq!(bitset(&input.bits).is_superset(&bitset(other)), superset);
            assert_eq!(
                bitset(&input.bits).is_proper_superset(&bitset(other)),
                proper
            );
            let (ra, rb) = (roaring(&input.bits), roaring(other));
            assert_eq!(ra.is_superset(&rb), superset);
            assert_eq!(ra.is_superset(&rb) && ra.len() != rb.len(), proper);
        }

        // The binary operations agree.
        let (oa, ob) = (bitset(&input.bits), bitset(&input.other_bits));
        let (fa, fb) = (fixed(&input.bits), fixed(&input.other_bits));
        let (ra, rb) = (roaring(&input.bits), roaring(&input.other_bits));
        let intersection = (&ra & &rb).iter().collect::<Vec<_>>();
        assert_eq!((&oa & &ob).iter().collect::<Vec<_>>(), intersection);
        assert_eq!(
            (&fa & &fb).ones().collect::<Vec<_>>(),
            as_usize(&intersection)
        );
        let difference = (&ra - &rb).iter().collect::<Vec<_>>();
        assert_eq!((&oa - &ob).iter().collect::<Vec<_>>(), difference);
        let mut fixed_difference = fa.clone();
        fixed_difference.difference_with(&fb);
        assert_eq!(
            fixed_difference.ones().collect::<Vec<_>>(),
            as_usize(&difference)
        );
        assert_eq!(oa.intersection_len(&ob) as u64, ra.intersection_len(&rb));
        assert_eq!(fa.intersection_count(&fb) as u64, ra.intersection_len(&rb));
        assert_eq!(oa.is_disjoint(&ob), ra.is_disjoint(&rb));
        assert_eq!(fa.is_disjoint(&fb), ra.is_disjoint(&rb));

        // Both encodings round-trip, and equal sets hash equally, even with a different storage
        // range.
        assert_eq!(decode_bitset(&encode_bitset(&oa)), oa);
        assert_eq!(decode_roaring(&encode_roaring(&ra)), ra);
        let mut padded = bitset(&input.bits);
        padded.insert(input.universe + 1_000);
        padded.remove(input.universe + 1_000);
        assert_eq!(padded, oa);
        assert_eq!(fx_hash(&padded), fx_hash(&oa));
        assert_eq!(hash_encode(&padded), hash_encode(&oa));
        assert_eq!(fx_hash(&fa), fx_hash(&fixed(&input.bits)));
    }
}

pub fn bench(c: &mut Criterion) {
    let inputs = inputs();
    validate(&inputs);

    // Building a set by inserting its bits one by one (in a fixed random order).
    bench_all(
        c,
        "insert",
        &inputs,
        imp(
            |i| shuffled(&i.bits),
            |bits| {
                let mut set = Bitset::new();
                for &bit in bits {
                    black_box(set.insert(bit));
                }
                black_box(set);
            },
        ),
        imp(
            |i| shuffled(&i.bits),
            |bits| {
                let mut set = FixedBitSet::new();
                for &bit in bits {
                    let bit = bit as usize;
                    let added = !set.contains(bit);
                    set.grow_and_insert(bit);
                    black_box(added);
                }
                black_box(set);
            },
        ),
        imp(
            |i| shuffled(&i.bits),
            |bits| {
                let mut set = RoaringBitmap::new();
                for &bit in bits {
                    black_box(set.insert(bit));
                }
                black_box(set);
            },
        ),
    );

    // Building a set from an ascending iterator.
    bench_all(
        c,
        "from_iter",
        &inputs,
        imp(
            |i| i.bits.clone(),
            |bits| {
                black_box(bits.iter().copied().collect::<Bitset>());
            },
        ),
        imp(
            |i| i.bits.clone(),
            |bits| {
                black_box(bits.iter().map(|&b| b as usize).collect::<FixedBitSet>());
            },
        ),
        imp(
            |i| i.bits.clone(),
            |bits| {
                black_box(bits.iter().copied().collect::<RoaringBitmap>());
            },
        ),
    );

    bench_all(
        c,
        "contains",
        &inputs,
        imp(
            |i| (bitset(&i.bits), i.probes.clone()),
            |(set, probes)| {
                for &bit in probes {
                    black_box(set.contains(bit));
                }
            },
        ),
        imp(
            |i| (fixed(&i.bits), i.probes.clone()),
            |(set, probes)| {
                for &bit in probes {
                    black_box(set.contains(bit as usize));
                }
            },
        ),
        imp(
            |i| (roaring(&i.bits), i.probes.clone()),
            |(set, probes)| {
                for &bit in probes {
                    black_box(set.contains(bit));
                }
            },
        ),
    );

    bench_all(
        c,
        "iter",
        &inputs,
        imp(
            |i| bitset(&i.bits),
            |set| {
                black_box(set.iter().fold(0u32, u32::wrapping_add));
            },
        ),
        imp(
            |i| fixed(&i.bits),
            |set| {
                black_box(
                    set.ones()
                        .fold(0u32, |sum, bit| sum.wrapping_add(bit as u32)),
                );
            },
        ),
        imp(
            |i| roaring(&i.bits),
            |set| {
                black_box(set.iter().fold(0u32, u32::wrapping_add));
            },
        ),
    );

    bench_all(
        c,
        "count_ones",
        &inputs,
        imp(
            |i| bitset(&i.bits),
            |set| {
                black_box(set.count_ones());
            },
        ),
        imp(
            |i| fixed(&i.bits),
            |set| {
                black_box(set.count_ones(..));
            },
        ),
        imp(
            |i| roaring(&i.bits),
            |set| {
                black_box(set.len());
            },
        ),
    );

    bench_all(
        c,
        "clone",
        &inputs,
        imp(
            |i| bitset(&i.bits),
            |set| {
                black_box(set.clone());
            },
        ),
        imp(
            |i| fixed(&i.bits),
            |set| {
                black_box(set.clone());
            },
        ),
        imp(
            |i| roaring(&i.bits),
            |set| {
                black_box(set.clone());
            },
        ),
    );

    // `a ⊇ b` where it holds, and where it fails because of the highest bit of `b`. The outcomes
    // are checked in `validate`.
    for (name, subset) in [
        (
            "superset_true",
            (|i: &Input| &i.subset_bits) as fn(&Input) -> &Vec<u32>,
        ),
        ("superset_false", |i: &Input| &i.not_subset_bits),
    ] {
        bench_all(
            c,
            name,
            &inputs,
            imp(
                |i| (bitset(&i.bits), bitset(subset(i))),
                |(a, b)| {
                    black_box(a.is_superset(b));
                },
            ),
            imp(
                |i| (fixed(&i.bits), fixed(subset(i))),
                |(a, b)| {
                    black_box(a.is_superset(b));
                },
            ),
            imp(
                |i| (roaring(&i.bits), roaring(subset(i))),
                |(a, b)| {
                    black_box(a.is_superset(b));
                },
            ),
        );
    }

    // `a ⊋ b`, for a proper superset (except for the empty input, where `b` is empty too), and for
    // equal sets (where it fails). The outcomes are checked in `validate`.
    for (name, other) in [
        (
            "proper_superset_true",
            (|i: &Input| &i.subset_bits) as fn(&Input) -> &Vec<u32>,
        ),
        ("proper_superset_false", |i: &Input| &i.bits),
    ] {
        bench_all(
            c,
            name,
            &inputs,
            imp(
                |i| (bitset(&i.bits), bitset(other(i))),
                |(a, b)| {
                    black_box(a.is_proper_superset(b));
                },
            ),
            imp(
                |i| (fixed(&i.bits), fixed(other(i))),
                |(a, b)| {
                    black_box(a.is_superset(b) && a.count_ones(..) != b.count_ones(..));
                },
            ),
            imp(
                |i| (roaring(&i.bits), roaring(other(i))),
                |(a, b)| {
                    black_box(a.is_superset(b) && a.len() != b.len());
                },
            ),
        );
    }

    // `a |= b` with a different set of the same size. The copy of `a` is made outside of the
    // measurement.
    let mut group = c.benchmark_group("bitset/union");
    for input in &inputs {
        let (a, b) = (bitset(&input.bits), bitset(&input.other_bits));
        group.bench_function(BenchmarkId::new("Bitset", &input.name), |bencher| {
            bencher.iter_batched_ref(
                || a.clone(),
                |a| {
                    *a |= black_box(&b);
                    black_box(&*a);
                },
                BatchSize::SmallInput,
            )
        });
        let (a, b) = (fixed(&input.bits), fixed(&input.other_bits));
        group.bench_function(BenchmarkId::new("FixedBitSet", &input.name), |bencher| {
            bencher.iter_batched_ref(
                || a.clone(),
                |a| {
                    a.union_with(black_box(&b));
                    black_box(&*a);
                },
                BatchSize::SmallInput,
            )
        });
        let (a, b) = (roaring(&input.bits), roaring(&input.other_bits));
        group.bench_function(BenchmarkId::new("RoaringBitmap", &input.name), |bencher| {
            bencher.iter_batched_ref(
                || a.clone(),
                |a| {
                    *a |= black_box(&b);
                    black_box(&*a);
                },
                BatchSize::SmallInput,
            )
        });
    }
    group.finish();

    // The operations of production chunking on two sets of the same size.
    let pair = |i: &Input| (bitset(&i.bits), bitset(&i.other_bits));
    let fixed_pair = |i: &Input| (fixed(&i.bits), fixed(&i.other_bits));
    let roaring_pair = |i: &Input| (roaring(&i.bits), roaring(&i.other_bits));
    bench_all(
        c,
        "intersection",
        &inputs,
        imp(pair, |(a, b)| {
            black_box(a & b);
        }),
        imp(fixed_pair, |(a, b)| {
            black_box(a & b);
        }),
        imp(roaring_pair, |(a, b)| {
            black_box(a & b);
        }),
    );
    bench_all(
        c,
        "difference",
        &inputs,
        imp(pair, |(a, b)| {
            black_box(a - b);
        }),
        imp(fixed_pair, |(a, b)| {
            let mut result = a.clone();
            result.difference_with(b);
            black_box(result);
        }),
        imp(roaring_pair, |(a, b)| {
            black_box(a - b);
        }),
    );
    bench_all(
        c,
        "intersection_len",
        &inputs,
        imp(pair, |(a, b)| {
            black_box(a.intersection_len(b));
        }),
        imp(fixed_pair, |(a, b)| {
            black_box(a.intersection_count(b));
        }),
        imp(roaring_pair, |(a, b)| {
            black_box(a.intersection_len(b));
        }),
    );
    bench_all(
        c,
        "is_disjoint",
        &inputs,
        imp(pair, |(a, b)| {
            black_box(a.is_disjoint(b));
        }),
        imp(fixed_pair, |(a, b)| {
            black_box(a.is_disjoint(b));
        }),
        imp(roaring_pair, |(a, b)| {
            black_box(a.is_disjoint(b));
        }),
    );

    // Converting into a `RoaringBitmap`, the cost at the output boundary of the algorithms.
    let mut group = c.benchmark_group("bitset/to_roaring");
    for input in &inputs {
        let set = bitset(&input.bits);
        group.bench_function(BenchmarkId::new("Bitset", &input.name), |b| {
            b.iter(|| black_box(black_box(&set).to_roaring()))
        });
    }
    group.finish();

    // Encoding a set into a new buffer.
    let mut group = c.benchmark_group("bitset/serialize");
    for input in &inputs {
        let set = bitset(&input.bits);
        group.bench_function(BenchmarkId::new("Bitset", &input.name), |b| {
            b.iter(|| black_box(encode_bitset(black_box(&set))))
        });
        let set = roaring(&input.bits);
        group.bench_function(BenchmarkId::new("RoaringBitmap", &input.name), |b| {
            b.iter(|| black_box(encode_roaring(black_box(&set))))
        });
    }
    group.finish();

    // Decoding a set from its encoding (prepared outside of the measurement).
    let mut group = c.benchmark_group("bitset/deserialize");
    for input in &inputs {
        let bytes = encode_bitset(&bitset(&input.bits));
        group.bench_function(BenchmarkId::new("Bitset", &input.name), |b| {
            b.iter(|| black_box(decode_bitset(black_box(&bytes))))
        });
        let bytes = encode_roaring(&roaring(&input.bits));
        group.bench_function(BenchmarkId::new("RoaringBitmap", &input.name), |b| {
            b.iter(|| black_box(decode_roaring(black_box(&bytes))))
        });
    }
    group.finish();

    // Hashing with `FxHasher`. (`RoaringBitmap` doesn't implement `Hash`.)
    let mut group = c.benchmark_group("bitset/hash");
    for input in &inputs {
        let set = bitset(&input.bits);
        group.bench_function(BenchmarkId::new("Bitset", &input.name), |b| {
            b.iter(|| black_box(fx_hash(black_box(&set))))
        });
        let set = fixed(&input.bits);
        group.bench_function(BenchmarkId::new("FixedBitSet", &input.name), |b| {
            b.iter(|| black_box(fx_hash(black_box(&set))))
        });
    }
    group.finish();

    // Hashing like a task input for the persistent cache.
    let mut group = c.benchmark_group("bitset/hash_encode");
    for input in &inputs {
        let set = bitset(&input.bits);
        group.bench_function(BenchmarkId::new("Bitset", &input.name), |b| {
            b.iter(|| black_box(hash_encode(black_box(&set))))
        });
    }
    group.finish();
}

/// The bits in a fixed pseudo-random order.
fn shuffled(bits: &[u32]) -> Vec<u32> {
    let mut rng = Lcg(7);
    let mut bits = bits.to_vec();
    for i in (1..bits.len()).rev() {
        bits.swap(i, rng.next() as usize % (i + 1));
    }
    bits
}

fn config() -> Criterion {
    Criterion::default()
        .warm_up_time(std::time::Duration::from_millis(200))
        .measurement_time(std::time::Duration::from_millis(500))
}

criterion_group! {
    name = bitset_benches;
    config = config();
    targets = bench
}
criterion_main!(bitset_benches);
