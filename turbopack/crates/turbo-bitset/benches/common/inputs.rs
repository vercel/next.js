//! The inputs of the benchmarks, shared with the `sizes` example so that both measure the same
//! sets.
//!
//! Every input name is `low-<universe>-<size>`:
//! - `universe` is the size of the bit range the set is drawn from, starting at bit 0 (e.g. the
//!   number of chunk groups),
//! - `size` is `empty`, `1bit`, `4bits` or `16bits` for sets with that many random bits, or else
//!   the density (the fraction of the range that is set) in per mille. Densities that set fewer
//!   than 32 bits are skipped, as the fixed bit counts already cover small sets.

// Each target that includes this module uses a different part of it.
#![allow(dead_code)]

use std::collections::BTreeSet;

pub use rand::rngs::SmallRng;
use rand::{RngExt, SeedableRng};

pub const UNIVERSES: [u32; 3] = [1_024, 16_384, 65_536];
/// Sets with a fixed number of random bits.
pub const BIT_COUNTS: [(&str, usize); 4] =
    [("empty", 0), ("1bit", 1), ("4bits", 4), ("16bits", 16)];
/// Densities in per mille. A density is skipped for a universe where it would set fewer than
/// [`MIN_DENSITY_BITS`] bits.
pub const DENSITIES: [u32; 5] = [1, 10, 100, 500, 1_000];
pub const MIN_DENSITY_BITS: u32 = 32;

/// A deterministic random generator, so the inputs are the same on every run.
pub fn rng(seed: u64) -> SmallRng {
    SmallRng::seed_from_u64(seed)
}

/// One input: two sets of the same size, each with its bits in ascending order.
pub struct Input {
    pub name: String,
    /// The size of the bit range the sets are drawn from.
    pub universe: u32,
    /// The bits of `a`, ascending.
    pub bits: Vec<u32>,
    /// A different set of the same size.
    pub other_bits: Vec<u32>,
    /// Every other bit of `a` (or nothing if `a` has at most one bit), so `a` is a superset of it
    /// (a proper one unless `a` is empty).
    pub subset_bits: Vec<u32>,
    /// `subset_bits` plus the bit after the last bit of `a` (or the first bit of the range if `a`
    /// is empty), so `a` is not a superset of it. The extra bit is the highest one, so a check
    /// that walks the bits in order finds it last.
    pub not_subset_bits: Vec<u32>,
    /// Indices to look up: half of them are bits of the set, the other half are random indices
    /// in the universe (which may or may not be in the set). For an empty set all of them are
    /// random.
    pub probes: Vec<u32>,
}

fn random_bits(rng: &mut SmallRng, universe: u32, density: u32) -> Vec<u32> {
    (0..universe)
        .filter(|_| rng.random_range(0..1_000) < density)
        .collect()
}

/// `count` distinct random bits of the universe, ascending.
fn random_count_bits(rng: &mut SmallRng, universe: u32, count: usize) -> Vec<u32> {
    let mut bits = BTreeSet::new();
    while bits.len() < count {
        bits.insert(rng.random_range(0..universe));
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

pub fn inputs() -> Vec<Input> {
    let mut inputs = Vec::new();
    let mut rng = rng(42);
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
            let generate = |rng: &mut SmallRng| match kind {
                Size::Count(count) => random_count_bits(rng, universe, count),
                Size::Density(density) => random_bits(rng, universe, density),
            };
            let bits = generate(&mut rng);
            let other_bits = generate(&mut rng);
            let subset_bits = bits.iter().copied().skip(1).step_by(2).collect::<Vec<_>>();
            let mut not_subset_bits = subset_bits.clone();
            not_subset_bits.push(bits.last().map_or(0, |last| last + 1));
            let probes = (0..1_024)
                .map(|i| {
                    if i % 2 == 0 && !bits.is_empty() {
                        bits[rng.random_range(0..bits.len())]
                    } else {
                        rng.random_range(0..universe)
                    }
                })
                .collect();
            inputs.push(Input {
                name: format!("low-{universe}-{size}"),
                universe,
                bits,
                other_bits,
                subset_bits,
                not_subset_bits,
                probes,
            });
        }
    }
    inputs
}
