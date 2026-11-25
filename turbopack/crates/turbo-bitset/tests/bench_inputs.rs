//! Checks the inputs that the benchmarks and the `sizes` example share, so that their names and
//! bit counts mean what they say.

#[path = "../benches/common/inputs.rs"]
mod inputs;

use self::inputs::{
    BIT_COUNTS, DENSITIES, MIN_DENSITY_BITS, UNIVERSES, density_count, density_label, inputs, rng,
    sample_bits,
};

fn check_sample(bits: &[u32], universe: u32, count: usize) {
    assert_eq!(bits.len(), count, "{count} bits of {universe}");
    assert!(bits.windows(2).all(|w| w[0] < w[1]), "ascending and unique");
    assert!(bits.iter().all(|&bit| bit < universe), "in range");
}

#[test]
fn sample_bits_picks_exactly_count_distinct_bits() {
    for universe in [1, 2, 7, 64, 65, 1_000, 16_384] {
        let counts = [
            0,
            1,
            2,
            universe as usize / 2,
            universe as usize - 1,
            universe as usize,
        ];
        for count in counts
            .into_iter()
            .filter(|&count| count <= universe as usize)
        {
            let bits = sample_bits(&mut rng(1), universe, count);
            check_sample(&bits, universe, count);
            // The same seed gives the same bits.
            assert_eq!(bits, sample_bits(&mut rng(1), universe, count));
        }
    }
    // The full universe is every bit.
    assert_eq!(sample_bits(&mut rng(2), 5, 5), [0, 1, 2, 3, 4]);
}

#[test]
fn densities_have_exact_bit_counts() {
    for universe in UNIVERSES {
        for density in DENSITIES {
            assert_eq!(
                density_count(universe, density),
                (universe * density / 1_000) as usize
            );
        }
    }
}

#[test]
fn density_labels_are_percentages() {
    let labels = DENSITIES.map(density_label);
    assert_eq!(labels, ["0.1%", "1%", "10%", "50%", "100%"]);
}

#[test]
fn inputs_have_the_bits_their_names_say() {
    let inputs = inputs();
    for universe in UNIVERSES {
        let mut expected = BIT_COUNTS
            .iter()
            .map(|&(label, count)| (label.to_string(), count))
            .collect::<Vec<_>>();
        for density in DENSITIES {
            let count = density_count(universe, density);
            if count >= MIN_DENSITY_BITS as usize {
                expected.push((density_label(density), count));
            }
        }
        for (size, count) in expected {
            let name = format!("low-{universe}-{size}");
            let input = inputs
                .iter()
                .find(|input| input.name == name)
                .unwrap_or_else(|| panic!("missing input {name}"));
            assert_eq!(input.universe, universe);
            check_sample(&input.bits, universe, count);
            // The other set of an input has the same size.
            check_sample(&input.other_bits, universe, count);
        }
    }
}
