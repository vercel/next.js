//! Benchmarks [`Bitset`] on the operations that the module graph algorithms use, over a range of
//! bit densities.
//!
//! Every benchmark id is `Bitset/<input>`, see [`inputs`] for the input names.
//!
//! The `serialize` and `deserialize` groups use the writer and reader that Turbopack persists
//! with (`turbo_bincode`'s `TurboBincodeWriter` into a new `TurboBincodeBuffer` and
//! `TurboBincodeReader`, with bincode's standard config).
//!
//! The `hash` group hashes the sets with `FxHasher` through `std::hash::Hash`, and `hash_encode`
//! hashes a `Bitset` like a task input is hashed for the persistent cache: encoded with
//! `turbo_bincode`'s hash encoder into an `Xxh3Hash64Hasher`.

#[path = "common/inputs.rs"]
mod inputs;

use std::{
    collections::BTreeSet,
    hash::{BuildHasher, Hash},
    hint::black_box,
};

use bincode::Encode;
use criterion::{BatchSize, BenchmarkId, Criterion, criterion_group, criterion_main};
use rand::seq::SliceRandom;
use rustc_hash::FxBuildHasher;
use turbo_bincode::{
    TurboBincodeBuffer, new_hash_encoder, turbo_bincode_decode, turbo_bincode_encode,
};
use turbo_bitset::Bitset;
use turbo_tasks_hash::Xxh3Hash64Hasher;

use self::inputs::{Input, inputs, rng};

fn bitset(bits: &[u32]) -> Bitset {
    bits.iter().copied().collect()
}

/// Encodes like Turbopack persists a value: into a new `TurboBincodeBuffer`.
fn encode_bitset(set: &Bitset) -> TurboBincodeBuffer {
    turbo_bincode_encode(set).unwrap()
}

fn decode_bitset(bytes: &[u8]) -> Bitset {
    turbo_bincode_decode(bytes).unwrap()
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

/// Benchmarks `run` on every input, with the state that `setup` builds from the input outside of
/// the measurement.
fn bench_inputs<S>(
    c: &mut Criterion,
    name: &str,
    inputs: &[Input],
    setup: impl Fn(&Input) -> S,
    run: impl Fn(&S),
) {
    let mut group = c.benchmark_group(format!("bitset/{name}"));
    for input in inputs {
        let state = setup(input);
        group.bench_function(BenchmarkId::new("Bitset", &input.name), |b| {
            b.iter(|| run(black_box(&state)))
        });
    }
    group.finish();
}

/// Checks outside of any measurement that the operations give the expected results on the inputs.
fn validate(inputs: &[Input]) {
    for input in inputs {
        let a = bitset(&input.bits);
        assert!(a.iter().eq(input.bits.iter().copied()));
        assert_eq!(a.count_ones(), input.bits.len());
        let mut inserted = Bitset::new();
        for &bit in &shuffled(&input.bits) {
            inserted.insert(bit);
        }
        assert_eq!(inserted, a);

        let expected = input.bits.iter().copied().collect::<BTreeSet<_>>();
        let other_expected = input.other_bits.iter().copied().collect::<BTreeSet<_>>();
        let b = bitset(&input.other_bits);
        let mut union = a.clone();
        union |= &b;
        assert!(union.iter().eq(expected.union(&other_expected).copied()));

        for (other, superset) in [
            (&input.subset_bits, true),
            (&input.not_subset_bits, false),
            (&input.bits, true),
        ] {
            let proper = superset && input.bits.len() != other.len();
            assert_eq!(a.is_superset(&bitset(other)), superset);
            assert_eq!(a.is_proper_superset(&bitset(other)), proper);
        }

        // The binary operations agree with the reference sets.
        assert!(
            (&a & &b)
                .iter()
                .eq(expected.intersection(&other_expected).copied())
        );
        assert!(
            (&a - &b)
                .iter()
                .eq(expected.difference(&other_expected).copied())
        );
        assert_eq!(
            a.intersection_len(&b),
            expected.intersection(&other_expected).count()
        );
        assert_eq!(a.is_disjoint(&b), expected.is_disjoint(&other_expected));

        // The encoding round-trips, and equal sets hash equally, even with a different storage
        // range.
        assert_eq!(decode_bitset(&encode_bitset(&a)), a);
        let mut padded = bitset(&input.bits);
        padded.insert(input.universe + 1_000);
        padded.remove(input.universe + 1_000);
        assert_eq!(padded, a);
        assert_eq!(fx_hash(&padded), fx_hash(&a));
        assert_eq!(hash_encode(&padded), hash_encode(&a));
    }
}

/// Benchmarks building a set by inserting its bits one by one, in the order of `order`.
fn bench_insert(c: &mut Criterion, name: &str, inputs: &[Input], order: fn(&[u32]) -> Vec<u32>) {
    bench_inputs(
        c,
        name,
        inputs,
        |i| order(&i.bits),
        |bits| {
            let mut set = Bitset::new();
            for &bit in bits {
                black_box(set.insert(bit));
            }
            black_box(set);
        },
    );
}

pub fn bench(c: &mut Criterion) {
    let inputs = inputs();
    validate(&inputs);

    // Building a set by inserting its bits one by one: in a fixed random order, ascending (the set
    // only grows at the back) and descending (the set only grows at the front).
    bench_insert(c, "insert", &inputs, shuffled);
    bench_insert(c, "insert_asc", &inputs, <[u32]>::to_vec);
    bench_insert(c, "insert_desc", &inputs, |bits| {
        bits.iter().rev().copied().collect()
    });

    // Building a set from an ascending iterator.
    bench_inputs(
        c,
        "from_iter",
        &inputs,
        |i| i.bits.clone(),
        |bits| {
            black_box(bits.iter().copied().collect::<Bitset>());
        },
    );

    bench_inputs(
        c,
        "contains",
        &inputs,
        |i| (bitset(&i.bits), i.probes.clone()),
        |(set, probes)| {
            for &bit in probes {
                black_box(set.contains(bit));
            }
        },
    );

    bench_inputs(
        c,
        "iter",
        &inputs,
        |i| bitset(&i.bits),
        |set| {
            black_box(set.iter().fold(0u32, u32::wrapping_add));
        },
    );

    bench_inputs(
        c,
        "count_ones",
        &inputs,
        |i| bitset(&i.bits),
        |set| {
            black_box(set.count_ones());
        },
    );

    bench_inputs(
        c,
        "clone",
        &inputs,
        |i| bitset(&i.bits),
        |set| {
            black_box(set.clone());
        },
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
        bench_inputs(
            c,
            name,
            &inputs,
            |i| (bitset(&i.bits), bitset(subset(i))),
            |(a, b)| {
                black_box(a.is_superset(b));
            },
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
        bench_inputs(
            c,
            name,
            &inputs,
            |i| (bitset(&i.bits), bitset(other(i))),
            |(a, b)| {
                black_box(a.is_proper_superset(b));
            },
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
    }
    group.finish();

    // The first visit of a graph traversal: a union into a new set, compared with the clone it
    // replaces.
    let mut group = c.benchmark_group("bitset/union_into_empty");
    for input in &inputs {
        let b = bitset(&input.bits);
        group.bench_function(BenchmarkId::new("union_with", &input.name), |bencher| {
            bencher.iter_batched_ref(
                Bitset::new,
                |a| {
                    black_box(a.union_with(black_box(&b)));
                    black_box(&*a);
                },
                BatchSize::SmallInput,
            )
        });
        group.bench_function(BenchmarkId::new("clone", &input.name), |bencher| {
            bencher.iter_batched_ref(
                Bitset::new,
                |a| {
                    *a = black_box(&b).clone();
                    black_box(&*a);
                },
                BatchSize::SmallInput,
            )
        });
    }
    group.finish();

    // The operations of production chunking on two sets of the same size.
    let pair = |i: &Input| (bitset(&i.bits), bitset(&i.other_bits));
    bench_inputs(c, "intersection", &inputs, pair, |(a, b)| {
        black_box(a & b);
    });
    bench_inputs(c, "difference", &inputs, pair, |(a, b)| {
        black_box(a - b);
    });
    bench_inputs(c, "intersection_len", &inputs, pair, |(a, b)| {
        black_box(a.intersection_len(b));
    });
    bench_inputs(c, "is_disjoint", &inputs, pair, |(a, b)| {
        black_box(a.is_disjoint(b));
    });

    // Encoding a set into a new buffer.
    bench_inputs(
        c,
        "serialize",
        &inputs,
        |i| bitset(&i.bits),
        |set| {
            black_box(encode_bitset(black_box(set)));
        },
    );

    // Decoding a set from its encoding (prepared outside of the measurement).
    bench_inputs(
        c,
        "deserialize",
        &inputs,
        |i| encode_bitset(&bitset(&i.bits)),
        |bytes| {
            black_box(decode_bitset(black_box(bytes)));
        },
    );

    // Hashing with `FxHasher`.
    bench_inputs(
        c,
        "hash",
        &inputs,
        |i| bitset(&i.bits),
        |set| {
            black_box(fx_hash(black_box(set)));
        },
    );

    // Hashing like a task input for the persistent cache.
    bench_inputs(
        c,
        "hash_encode",
        &inputs,
        |i| bitset(&i.bits),
        |set| {
            black_box(hash_encode(black_box(set)));
        },
    );
}

/// The bits in a fixed pseudo-random order.
fn shuffled(bits: &[u32]) -> Vec<u32> {
    let mut bits = bits.to_vec();
    bits.shuffle(&mut rng(7));
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
