//! Compares `AutoSet` with `hashbrown::HashSet` and `AutoIndexSet` with
//! `indexmap::IndexSet` across a wide range of item counts.
//!
//! The auto sets store up to `MAX_USEFUL_LINEAR_SCAN` (32) items in a linear list and switch to
//! the real set beyond that, so the sizes cover the empty case, the list range, the transition
//! around 32 and large sets (up to 1M items).
//!
//! All sets use the same `FxHasher` based build hasher, so the comparison measures the storage
//! strategy, not the hash function.
//!
//! Setup and validation run outside the timed regions. Mutation benchmarks (`remove_reverse`,
//! `remove_forward`, `remove_random`, `swap_remove_forward`, `retain`) clone their input in
//! criterion's untimed batch setup, and their outputs are dropped outside the timing. The
//! construction benchmarks (`insert`, `from_iter`, `clone`) use `Bencher::iter`, which times
//! dropping the returned set too, so they measure the full create + drop cost.

use std::{hash::BuildHasherDefault, hint::black_box, time::Duration};

use auto_hash_map::{AutoIndexSet, AutoSet};
use criterion::{
    BatchSize, BenchmarkGroup, BenchmarkId, Criterion, Throughput, criterion_group, criterion_main,
    measurement::WallTime,
};
use rustc_hash::FxHasher;

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

type FxBuildHasher = BuildHasherDefault<FxHasher>;
type Group<'a> = BenchmarkGroup<'a, WallTime>;

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

/// The largest size for which the ordered sets run `remove_forward` and `remove_random`. Their
/// order-preserving removal shifts all following items, so removing all items in these orders is
/// O(n²) and would take minutes to hours per case for larger sizes.
const MAX_ORDERED_SHIFTING_REMOVE: usize = 16 * 1024;

/// The `i`-th key of a set. Multiplying by an odd constant is a bijection on `u64`, so keys are
/// unique, and `key(n..)` are guaranteed to be absent from a set built from `key(0..n)`.
fn key(i: usize) -> u64 {
    (i as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)
}

/// The operations that are benchmarked, implemented for every compared set type.
trait BenchSet: Clone + PartialEq + FromIterator<u64> {
    const NAME: &'static str;
    /// Whether removal preserves the insertion order (and therefore shifts the following items).
    const ORDERED: bool;

    fn new() -> Self;
    fn insert(&mut self, key: u64) -> bool;
    fn contains(&self, key: &u64) -> bool;
    fn remove(&mut self, key: &u64) -> bool;
    /// Removes by swapping the last item into the removed slot (the same as `remove` for the
    /// unordered sets).
    fn swap_remove(&mut self, key: &u64) -> bool;
    fn retain(&mut self, f: impl FnMut(&u64) -> bool);
    fn len(&self) -> usize;
    fn sum(&self) -> u64;
}

macro_rules! impl_bench_set {
    ($ty:ty, $name:literal, $remove:ident, $swap_remove:ident, ordered = $ordered:literal) => {
        impl BenchSet for $ty {
            const NAME: &'static str = $name;
            const ORDERED: bool = $ordered;

            fn new() -> Self {
                Self::default()
            }
            fn insert(&mut self, key: u64) -> bool {
                <$ty>::insert(self, key)
            }
            fn contains(&self, key: &u64) -> bool {
                <$ty>::contains(self, key)
            }
            fn remove(&mut self, key: &u64) -> bool {
                <$ty>::$remove(self, key)
            }
            fn swap_remove(&mut self, key: &u64) -> bool {
                <$ty>::$swap_remove(self, key)
            }
            fn retain(&mut self, f: impl FnMut(&u64) -> bool) {
                <$ty>::retain(self, f)
            }
            fn len(&self) -> usize {
                <$ty>::len(self)
            }
            fn sum(&self) -> u64 {
                self.iter().fold(0u64, |acc, k| acc.wrapping_add(*k))
            }
        }
    };
}

impl_bench_set!(
    AutoSet<u64>,
    "AutoSet",
    remove,
    swap_remove,
    ordered = false
);
impl_bench_set!(
    hashbrown::HashSet<u64, FxBuildHasher>,
    "HashSet",
    remove,
    remove,
    ordered = false
);
impl_bench_set!(
    AutoIndexSet<u64>,
    "AutoIndexSet",
    remove,
    swap_remove,
    ordered = true
);
// `AutoIndexSet` preserves the order on removal, so compare with the order-preserving removal.
impl_bench_set!(
    indexmap::IndexSet<u64, FxBuildHasher>,
    "IndexSet",
    shift_remove,
    swap_remove,
    ordered = true
);

fn build<S: BenchSet>(n: usize) -> S {
    let mut set = S::new();
    for i in 0..n {
        set.insert(key(i));
    }
    assert_eq!(set.len(), n);
    set
}

/// Batch size for the mutation benchmarks, which clone the input in the untimed setup.
fn batch_size(n: usize) -> BatchSize {
    if n >= 128 * 1024 {
        // Don't keep several large clones alive per batch.
        BatchSize::PerIteration
    } else if n >= 1024 {
        BatchSize::LargeInput
    } else {
        BatchSize::SmallInput
    }
}

fn checksum(n: usize) -> u64 {
    (0..n).fold(0u64, |acc, i| acc.wrapping_add(key(i)))
}

/// Same predicate for all set types, so all retain exactly the same keys regardless of their
/// iteration order. Multiplying by an odd constant preserves the parity, so this keeps the items
/// with even index, i.e. `n.div_ceil(2)` items.
fn keep(key: &u64) -> bool {
    key.is_multiple_of(2)
}

/// A deterministic pseudo-random permutation of `0..n` (Fisher-Yates with a fixed-seed
/// splitmix64), so every set type removes the items in exactly the same order.
fn random_order(n: usize) -> Vec<usize> {
    let mut state = 0x2545_F491_4F6C_DD1Du64;
    let mut next = move || {
        state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    };
    let mut order: Vec<usize> = (0..n).collect();
    for i in (1..n).rev() {
        let j = (next() % (i as u64 + 1)) as usize;
        order.swap(i, j);
    }
    order
}

/// Configures the group for the next size. Large sizes get fewer samples and more time, so the
/// suite finishes in a reasonable time.
fn configure(group: &mut Group<'_>, n: usize, elements: usize) {
    if n >= 128 * 1024 {
        group.sample_size(10);
        group.measurement_time(Duration::from_secs(10));
    } else if n >= 1024 {
        group.sample_size(20);
        group.measurement_time(Duration::from_secs(5));
    } else {
        group.sample_size(100);
        group.measurement_time(Duration::from_secs(3));
    }
    // Throughput can't be unset again, so for groups without per-item work at `n = 0` it is
    // only set from the first non-empty size on (sizes are ascending and start at 0).
    if elements > 0 {
        group.throughput(Throughput::Elements(elements as u64));
    }
}

fn bench_insert<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    assert_eq!(build::<S>(n).len(), n);
    group.bench_with_input(BenchmarkId::new(S::NAME, n), &n, |b, &n| {
        b.iter(|| {
            let mut set = S::new();
            for i in 0..black_box(n) {
                set.insert(key(i));
            }
            set
        });
    });
}

fn bench_contains_hit<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    let set = build::<S>(n);
    assert_eq!((0..n).filter(|&i| set.contains(&key(i))).count(), n);
    group.bench_with_input(BenchmarkId::new(S::NAME, n), &n, |b, &n| {
        b.iter(|| {
            let set = black_box(&set);
            (0..n).filter(|&i| set.contains(&key(i))).count()
        });
    });
}

fn bench_contains_miss<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    let set = build::<S>(n);
    let lookups = n.max(1);
    assert_eq!(
        (n..n + lookups).filter(|&i| set.contains(&key(i))).count(),
        0
    );
    group.bench_with_input(BenchmarkId::new(S::NAME, n), &n, |b, &n| {
        b.iter(|| {
            let set = black_box(&set);
            (n..n + lookups).filter(|&i| set.contains(&key(i))).count()
        });
    });
}

fn bench_iterate<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    let set = build::<S>(n);
    assert_eq!(set.sum(), checksum(n));
    group.bench_with_input(BenchmarkId::new(S::NAME, n), &n, |b, _| {
        b.iter(|| black_box(&set).sum());
    });
}

/// Removes all `n` items from a set, in the given order of insertion indices, using `remove`
/// (e.g. `BenchSet::remove` or `BenchSet::swap_remove`).
fn bench_remove<S: BenchSet>(
    group: &mut Group<'_>,
    n: usize,
    order: &[usize],
    remove: fn(&mut S, &u64) -> bool,
) {
    let set = build::<S>(n);
    {
        // Every removal hits and the set ends up empty, so `order` is a permutation of `0..n`.
        let mut removed = set.clone();
        assert_eq!(order.len(), n);
        assert!(order.iter().all(|&i| remove(&mut removed, &key(i))));
        assert_eq!(removed.len(), 0);
    }
    group.bench_with_input(BenchmarkId::new(S::NAME, n), &n, |b, &n| {
        b.iter_batched(
            || set.clone(),
            |mut set| {
                for &i in black_box(order) {
                    remove(&mut set, &key(i));
                }
                set
            },
            batch_size(n),
        );
    });
}

/// Removes in reverse insertion order, which is O(n) for all sets (the ordered sets have nothing
/// to shift when removing the last item).
fn bench_remove_reverse<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    let order: Vec<usize> = (0..n).rev().collect();
    bench_remove::<S>(group, n, &order, S::remove);
}

/// Removes in insertion order. The ordered sets shift all remaining items on each removal.
fn bench_remove_forward<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    if S::ORDERED && n > MAX_ORDERED_SHIFTING_REMOVE {
        return;
    }
    let order: Vec<usize> = (0..n).collect();
    bench_remove::<S>(group, n, &order, S::remove);
}

/// Removes in insertion order with swap removal, which is O(n) for the ordered sets too. Only the
/// ordered sets run this: for the unordered sets `swap_remove` is `remove`, so this would be
/// identical to `remove_forward`.
fn bench_swap_remove_forward<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    if !S::ORDERED {
        return;
    }
    let order: Vec<usize> = (0..n).collect();
    bench_remove::<S>(group, n, &order, S::swap_remove);
}

/// Removes in a pseudo-random order. The ordered sets shift half of the items on average.
fn bench_remove_random<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    if S::ORDERED && n > MAX_ORDERED_SHIFTING_REMOVE {
        return;
    }
    bench_remove::<S>(group, n, &random_order(n), S::remove);
}

fn bench_retain<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    let set = build::<S>(n);
    {
        let mut half = set.clone();
        half.retain(keep);
        assert_eq!(half.len(), n.div_ceil(2));
    }
    group.bench_with_input(BenchmarkId::new(S::NAME, n), &n, |b, &n| {
        b.iter_batched(
            || set.clone(),
            |mut set| {
                set.retain(keep);
                set
            },
            batch_size(n),
        );
    });
}

fn bench_clone<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    let set = build::<S>(n);
    assert_eq!(set.clone().len(), n);
    group.bench_with_input(BenchmarkId::new(S::NAME, n), &n, |b, _| {
        b.iter(|| black_box(&set).clone());
    });
}

fn bench_from_iter<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    assert_eq!((0..n).map(key).collect::<S>().len(), n);
    group.bench_with_input(BenchmarkId::new(S::NAME, n), &n, |b, &n| {
        b.iter(|| (0..black_box(n)).map(key).collect::<S>());
    });
}

/// Compares a set with an identical, separately built set (same items, same insertion order).
/// `AutoIndexSet` compares order-sensitively, while `IndexSet`'s `PartialEq` ignores the order;
/// for identical sets both have to visit every item.
fn bench_eq<S: BenchSet>(group: &mut Group<'_>, n: usize) {
    let a = build::<S>(n);
    let b = build::<S>(n);
    assert!(a == b);
    group.bench_with_input(BenchmarkId::new(S::NAME, n), &n, |bencher, _| {
        bencher.iter(|| black_box(&a) == black_box(&b));
    });
}

/// Runs `$bench` for all compared set types, pairing each auto set with its plain counterpart.
macro_rules! for_all_sets {
    ($bench:ident, $group:expr, $n:expr) => {
        $bench::<AutoSet<u64>>($group, $n);
        $bench::<hashbrown::HashSet<u64, FxBuildHasher>>($group, $n);
        $bench::<AutoIndexSet<u64>>($group, $n);
        $bench::<indexmap::IndexSet<u64, FxBuildHasher>>($group, $n);
    };
}

macro_rules! bench_group {
    ($c:expr, $name:literal, $bench:ident, elements = |$n:ident| $elements:expr, skip_empty = $skip_empty:expr) => {{
        let mut group = $c.benchmark_group(concat!("auto_set/", $name));
        for $n in SIZES {
            if $skip_empty && $n == 0 {
                continue;
            }
            configure(&mut group, $n, $elements);
            for_all_sets!($bench, &mut group, $n);
        }
        group.finish();
    }};
}

pub fn bench(c: &mut Criterion) {
    bench_group!(
        c,
        "insert",
        bench_insert,
        elements = |n| n,
        skip_empty = false
    );
    // There is nothing to hit in an empty set.
    bench_group!(
        c,
        "contains_hit",
        bench_contains_hit,
        elements = |n| n,
        skip_empty = true
    );
    // `n = 0` measures a single lookup in an empty set.
    bench_group!(
        c,
        "contains_miss",
        bench_contains_miss,
        elements = |n| n.max(1),
        skip_empty = false
    );
    bench_group!(
        c,
        "iterate",
        bench_iterate,
        elements = |n| n,
        skip_empty = false
    );
    bench_group!(
        c,
        "remove_reverse",
        bench_remove_reverse,
        elements = |n| n,
        skip_empty = false
    );
    // The ordered sets only run up to `MAX_ORDERED_SHIFTING_REMOVE` items in these two groups.
    bench_group!(
        c,
        "remove_forward",
        bench_remove_forward,
        elements = |n| n,
        skip_empty = false
    );
    bench_group!(
        c,
        "remove_random",
        bench_remove_random,
        elements = |n| n,
        skip_empty = false
    );
    // Only the ordered sets run this group.
    bench_group!(
        c,
        "swap_remove_forward",
        bench_swap_remove_forward,
        elements = |n| n,
        skip_empty = false
    );
    bench_group!(
        c,
        "retain",
        bench_retain,
        elements = |n| n,
        skip_empty = false
    );
    bench_group!(
        c,
        "clone",
        bench_clone,
        elements = |n| n,
        skip_empty = false
    );
    bench_group!(
        c,
        "from_iter",
        bench_from_iter,
        elements = |n| n,
        skip_empty = false
    );
    bench_group!(c, "eq", bench_eq, elements = |n| n, skip_empty = false);
}

criterion_group!(auto_set_benches, bench);
criterion_main!(auto_set_benches);
