//! Compares [`Bitset`] with [`FixedBitSet`] and [`RoaringBitmap`] on the operations that the
//! module graph algorithms use, over a range of bit densities.
//!
//! Every benchmark id is `<impl>/<pattern>-<universe>-<size>`:
//! - `universe` is the size of the bit range the set is drawn from (e.g. the number of chunk
//!   groups),
//! - `size` is `empty`, `1bit`, `4bits` or `16bits` for sets with that many random bits, or else
//!   the density (the fraction of the range that is set) in per mille. Densities that set fewer
//!   than 32 bits are skipped, as the fixed bit counts already cover small sets,
//! - `pattern` is `low` for a range starting at 0, or `high` for the same sets shifted to start at
//!   bit 1,000,000, where `Bitset` skips the empty blocks below the range.
//!
//! `FixedBitSet` is used as is: it stores every bit from 0 up to the highest bit, so for the `high`
//! pattern it also stores the empty range below bit 1,000,000.
//!
//! The `serialize` and `deserialize` groups compare the bincode encoding of `Bitset` with
//! `RoaringBitmap` through its serde implementation (the portable Roaring format), both with
//! bincode's standard config.

use std::{collections::BTreeSet, hint::black_box};

use bincode::config::{Configuration, standard};
use criterion::{BatchSize, BenchmarkId, Criterion, criterion_group, criterion_main};
use fixedbitset::FixedBitSet;
use roaring::RoaringBitmap;
use turbo_bitset::Bitset;

const UNIVERSES: [u32; 2] = [1_024, 16_384];
/// Sets with a fixed number of random bits.
const BIT_COUNTS: [(&str, usize); 4] = [("empty", 0), ("1bit", 1), ("4bits", 4), ("16bits", 16)];
/// Densities in per mille. A density is skipped for a universe where it would set fewer than
/// [`MIN_DENSITY_BITS`] bits.
const DENSITIES: [u32; 5] = [1, 10, 100, 500, 1_000];
const MIN_DENSITY_BITS: u32 = 32;
const PATTERNS: [(&str, u32); 2] = [("low", 0), ("high", 1_000_000)];

/// A small deterministic linear congruential generator, so the inputs are the same on every run.
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

/// One benchmark input: two sets of the same size, each with its bits in ascending order.
struct Input {
    name: String,
    /// The bits of `a`, ascending.
    bits: Vec<u32>,
    /// A different set of the same size.
    other_bits: Vec<u32>,
    /// Every other bit of `a` (or nothing if `a` has at most one bit), so `a` is a superset of it
    /// (a proper one unless `a` is empty).
    subset_bits: Vec<u32>,
    /// `subset_bits` plus the bit after the last bit of `a` (or the first bit of the range if `a`
    /// is empty), so `a` is not a superset of it. The extra bit is the highest one, so a check
    /// that walks the bits in order finds it last.
    not_subset_bits: Vec<u32>,
    /// Indices to look up: half of them are bits of the set, the other half are random indices
    /// in the universe (which may or may not be in the set). For an empty set all of them are
    /// random.
    probes: Vec<u32>,
}

fn random_bits(rng: &mut Lcg, base: u32, universe: u32, density: u32) -> Vec<u32> {
    (0..universe)
        .filter(|_| rng.next() % 1_000 < density)
        .map(|i| base + i)
        .collect()
}

/// `count` distinct random bits of the universe, ascending.
fn random_count_bits(rng: &mut Lcg, base: u32, universe: u32, count: usize) -> Vec<u32> {
    let mut bits = BTreeSet::new();
    while bits.len() < count {
        bits.insert(base + rng.next() % universe);
    }
    bits.into_iter().collect()
}

/// How the bits of an input are chosen.
#[derive(Clone, Copy)]
enum Size {
    /// This many distinct random bits.
    Count(usize),
    /// Every bit with this probability, in per mille.
    Density(u32),
}

fn inputs() -> Vec<Input> {
    let mut inputs = Vec::new();
    for (pattern, base) in PATTERNS {
        // The same seed for every pattern, so the `high` sets are exactly the `low` sets shifted.
        let mut rng = Lcg(42);
        for universe in UNIVERSES {
            let mut sizes = Vec::new();
            for (label, count) in BIT_COUNTS {
                sizes.push((label.to_string(), Size::Count(count)));
            }
            for density in DENSITIES {
                if universe * density / 1_000 >= MIN_DENSITY_BITS {
                    sizes.push((density.to_string(), Size::Density(density)));
                }
            }
            for (size, kind) in sizes {
                let generate = |rng: &mut Lcg| match kind {
                    Size::Count(count) => random_count_bits(rng, base, universe, count),
                    Size::Density(density) => random_bits(rng, base, universe, density),
                };
                let bits = generate(&mut rng);
                let other_bits = generate(&mut rng);
                let subset_bits = bits.iter().copied().skip(1).step_by(2).collect::<Vec<_>>();
                let mut not_subset_bits = subset_bits.clone();
                not_subset_bits.push(bits.last().map_or(base, |last| last + 1));
                let probes = (0..1_024)
                    .map(|i| {
                        if i % 2 == 0 && !bits.is_empty() {
                            bits[rng.next() as usize % bits.len()]
                        } else {
                            base + rng.next() % universe
                        }
                    })
                    .collect();
                inputs.push(Input {
                    name: format!("{pattern}-{universe}-{size}"),
                    bits,
                    other_bits,
                    subset_bits,
                    not_subset_bits,
                    probes,
                });
            }
        }
    }
    inputs
}

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

const CONFIG: Configuration = standard();

fn encode_bitset(set: &Bitset) -> Vec<u8> {
    bincode::encode_to_vec(set, CONFIG).unwrap()
}

fn decode_bitset(bytes: &[u8]) -> Bitset {
    bincode::decode_from_slice(bytes, CONFIG).unwrap().0
}

fn encode_roaring(set: &RoaringBitmap) -> Vec<u8> {
    bincode::serde::encode_to_vec(set, CONFIG).unwrap()
}

fn decode_roaring(bytes: &[u8]) -> RoaringBitmap {
    bincode::serde::decode_from_slice(bytes, CONFIG).unwrap().0
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

        // Both encodings round-trip.
        assert_eq!(decode_bitset(&encode_bitset(&oa)), oa);
        assert_eq!(decode_roaring(&encode_roaring(&ra)), ra);
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
