//! A radix sort for `u32` values of a known bit width.

/// Sorts `values`, which must all be below `1 << bits`, ascending.
///
/// This is a least significant digit radix sort, which is much faster than a comparison sort for
/// the up to a million fingerprints of an SST file's AMQF. It takes as few passes as digits of at
/// most 11 bits allow, so `ceil(bits / 11)`, with the bits split evenly between them: digits of
/// equal width spread the values evenly over their histogram, while a narrow last digit would make
/// consecutive values often increment the same counter. One pass upfront counts all digits, and
/// passes over digits that are equal in all values are skipped. Short inputs use a comparison sort,
/// since clearing the histograms would dominate.
pub(crate) fn radix_sort_u32(values: &mut Vec<u32>, bits: u32) {
    // Measured on Apple silicon, the radix sort wins from ~250 to ~550 values depending on `bits`,
    // and from ~400 for the ~17 bit fingerprints of a 512 entry AMQF.
    const MIN_LEN: usize = 512;
    debug_assert!(bits <= u32::BITS);
    debug_assert!(values.iter().all(|&v| bits == u32::BITS || v >> bits == 0));
    if values.len() < MIN_LEN {
        values.sort_unstable();
        return;
    }
    match bits.div_ceil(MAX_DIGIT_BITS) {
        0 | 1 => radix_sort_u32_passes::<1>(values, bits),
        2 => radix_sort_u32_passes::<2>(values, bits),
        _ => radix_sort_u32_passes::<3>(values, bits),
    }
}

/// The widest digit [`radix_sort_u32`] uses, so that a histogram (8 KiB) fits in L1.
const MAX_DIGIT_BITS: u32 = 11;

/// [`radix_sort_u32`] with `PASSES` digits.
fn radix_sort_u32_passes<const PASSES: usize>(values: &mut Vec<u32>, bits: u32) {
    const BUCKETS: usize = 1 << MAX_DIGIT_BITS;
    let digit_bits = bits.div_ceil(PASSES as u32).max(1);
    // Masking with the histogram size too keeps every digit provably within the histogram.
    let mask = ((1usize << digit_bits) - 1) & (BUCKETS - 1);
    let digit = |value: u32, pass: usize| (value as usize >> (pass as u32 * digit_bits)) & mask;
    // Sized for the widest digit, the digits of short `bits` only use the start. A file holds far
    // fewer than `u32::MAX` entries, and `u32` counts halve the cache footprint.
    let mut counts = [[0u32; BUCKETS]; PASSES];
    for &value in values.iter() {
        for (pass, counts) in counts.iter_mut().enumerate() {
            counts[digit(value, pass)] += 1;
        }
    }
    let mut scratch = vec![0u32; values.len()];
    for (pass, counts) in counts.iter_mut().enumerate() {
        let counts = &mut counts[..=mask];
        // All values have the same digit, so this pass wouldn't move anything.
        if counts[digit(values[0], pass)] as usize == values.len() {
            continue;
        }
        // Turn the counts into the start offset of each bucket.
        let mut offset = 0;
        for count in counts.iter_mut() {
            let start = offset;
            offset += *count;
            *count = start;
        }
        for &value in values.iter() {
            let bucket = &mut counts[digit(value, pass)];
            scratch[*bucket as usize] = value;
            *bucket += 1;
        }
        std::mem::swap(values, &mut scratch);
    }
}

#[cfg(test)]
mod tests {
    use rand::{RngExt, SeedableRng, rngs::SmallRng};

    use super::radix_sort_u32;

    fn check(mut values: Vec<u32>, bits: u32) {
        let mut expected = values.clone();
        expected.sort_unstable();
        radix_sort_u32(&mut values, bits);
        assert_eq!(values, expected, "{bits} bits, {} values", values.len());
    }

    #[test]
    fn test_matches_sorting() {
        let mut rng = SmallRng::seed_from_u64(1);
        // Lengths below and above the comparison sort cutoff, and bit counts with one, two and
        // three passes, including ones that don't split evenly between the digits.
        for len in [0, 1, 7, 511, 512, 513, 1024, 5000, 100_000] {
            for bits in [1, 8, 11, 12, 21, 22, 27, 31, 32] {
                let max = if bits == 32 {
                    u32::MAX
                } else {
                    (1 << bits) - 1
                };
                check((0..len).map(|_| rng.random_range(0..=max)).collect(), bits);
            }
        }
    }

    #[test]
    fn test_skips_constant_digits() {
        // 27 bits are three 9 bit digits. The low and high digits are the same in all values, only
        // the middle one varies.
        let values = (0..5000u32).map(|i| (i % 512) << 9 | 0x5).collect();
        check(values, 27);
        check(vec![42; 3000], 27);
    }
}
