/// URL-safe, filesystem-safe alphabet for hash encoding: `0-9 a-z _ - ~ .`
///
/// All 40 characters are RFC 3986 unreserved characters and are safe on
/// case-insensitive filesystems (macOS HFS+/APFS, Windows NTFS).
const BASE40_CHARS: &[u8; 40] = b"0123456789abcdefghijklmnopqrstuvwxyz_-~.";

const BASE: u128 = BASE40_CHARS.len() as u128;

/// Computes the number of base-N digits needed to represent all values of
/// `bits` width: the smallest `n` such that `base^n > 2^bits - 1`.
const fn digits_for_bits(base: u128, bits: u32) -> usize {
    let mut power: u128 = 1;
    let mut n: usize = 0;
    // We need base^n > u{bits}::MAX, i.e. base^n > 2^bits - 1.
    // Since 2^128 doesn't fit in u128, we compare by checking if
    // power has "overflowed past" the bit width. For bits == 128,
    // we need base^n >= 2^128 which means power must overflow to 0
    // (or we track via a flag). For bits < 128, we compare directly.
    loop {
        // Check if power > 2^bits - 1 (i.e. power can represent all values)
        if bits < 128 && power > ((1u128 << bits) - 1) {
            break;
        }
        let (new_power, overflowed) = power.overflowing_mul(base);
        n += 1;
        if overflowed {
            // power * base >= 2^128 > 2^bits - 1 for any bits <= 128
            break;
        }
        power = new_power;
    }
    n
}

/// Number of base40 characters needed to represent a 64-bit value without
/// information loss.
pub const BASE40_LEN_64: usize = digits_for_bits(BASE, 64);

/// Number of base40 characters needed to represent a 128-bit value without
/// information loss.
pub const BASE40_LEN_128: usize = digits_for_bits(BASE, 128);

// Verify our const computation matches the expected values.
const _: () = assert!(BASE40_LEN_64 == 13);
const _: () = assert!(BASE40_LEN_128 == 25);

/// Encodes a value into a fixed-width base40 string by repeatedly dividing by
/// 40.
fn encode_base40_fixed<const N: usize>(mut n: u128) -> String {
    let mut buf = [b'0'; N];
    for i in (0..N).rev() {
        buf[i] = BASE40_CHARS[(n % 40) as usize];
        n /= 40;
    }
    // SAFETY: BASE40_CHARS only contains ASCII bytes.
    unsafe { String::from_utf8_unchecked(buf.to_vec()) }
}

/// Encodes a 64-bit unsigned integer into a fixed-width 13-character base40
/// string.
pub fn encode_base40(n: u64) -> String {
    encode_base40_fixed::<BASE40_LEN_64>(n as u128)
}

/// Encodes a 128-bit unsigned integer into a fixed-width 25-character base40
/// string.
pub fn encode_base40_128(n: u128) -> String {
    encode_base40_fixed::<BASE40_LEN_128>(n)
}
