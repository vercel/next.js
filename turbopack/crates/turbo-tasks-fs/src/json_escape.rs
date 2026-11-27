//! Fast JSON string escaping, byte-identical to `serde_json::to_vec(&str)`.
//!
//! The result is wrapped in `"`; `"` and `\` get a backslash; 0x08, 0x09, 0x0A, 0x0C and 0x0D
//! become `\b \t \n \f \r`; every other byte below 0x20 becomes `\u00XX` with lowercase hex;
//! everything else (0x7F, `/`, all non-ASCII including U+2028/U+2029) is copied as-is. Every byte
//! that needs escaping is ASCII, and ASCII bytes never occur inside a multi-byte UTF-8 sequence,
//! so scanning bytes is enough.
//!
//! Source text needs an escape every 20-35 bytes (mostly `\n`), so the cost per escape matters
//! more than the scan. The kernel reads 64 bytes at a time and builds a bitmask of the bytes that
//! need escaping (NEON on aarch64, SSE2 on x86_64, which is in its baseline, SWAR on a `u64`
//! elsewhere, e.g. wasm). It stores each block to the output unconditionally, and for each set bit
//! writes the escape and then stores the 64 source bytes that follow it, which carries the rest of
//! the block over without reloading it. Output stores can run past the final length, so it writes
//! into reserved spare capacity through a raw pointer, checking for room once per block. Loads
//! never go past the input: the block loop stops 128 bytes before the end, and a scalar loop
//! handles the rest.

use std::ptr;

/// Escape sequence for each byte, padded to 8 bytes so one unaligned copy writes it.
static ESCAPE: [[u8; 8]; 256] = {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut t = [[0u8; 8]; 256];
    let mut b = 0;
    while b < 0x20 {
        t[b] = [b'\\', b'u', b'0', b'0', HEX[b >> 4], HEX[b & 0xf], 0, 0];
        b += 1;
    }
    t[0x08] = *b"\\b\0\0\0\0\0\0";
    t[0x09] = *b"\\t\0\0\0\0\0\0";
    t[0x0a] = *b"\\n\0\0\0\0\0\0";
    t[0x0c] = *b"\\f\0\0\0\0\0\0";
    t[0x0d] = *b"\\r\0\0\0\0\0\0";
    t[b'"' as usize] = *b"\\\"\0\0\0\0\0\0";
    t[b'\\' as usize] = *b"\\\\\0\0\0\0\0\0";
    t
};

/// Length of [`ESCAPE`] for each byte, 0 for bytes that are copied as-is.
static ESCAPE_LEN: [u8; 256] = {
    let mut t = [0u8; 256];
    let mut b = 0;
    while b < 0x20 {
        t[b] = 6;
        b += 1;
    }
    t[0x08] = 2;
    t[0x09] = 2;
    t[0x0a] = 2;
    t[0x0c] = 2;
    t[0x0d] = 2;
    t[b'"' as usize] = 2;
    t[b'\\' as usize] = 2;
    t
};

const BLOCK: usize = 64;

/// Whether this target has a SIMD mask; otherwise [`swar_mask`] is used.
const HAS_SIMD_MASK: bool = cfg!(any(
    all(target_arch = "aarch64", target_feature = "neon"),
    target_arch = "x86_64"
));

/// Bit `k` set iff `src[k]` needs escaping, for `src[0..64]`.
///
/// # Safety
/// `src..src + 64` must be readable.
#[cfg(all(target_arch = "aarch64", target_feature = "neon"))]
#[inline(always)]
unsafe fn simd_mask(src: *const u8) -> u64 {
    use std::arch::aarch64::*;
    unsafe {
        #[inline(always)]
        unsafe fn cmp(v: uint8x16_t) -> uint8x16_t {
            unsafe {
                vorrq_u8(
                    vcleq_u8(v, vdupq_n_u8(0x1f)),
                    vorrq_u8(
                        vceqq_u8(v, vdupq_n_u8(b'"')),
                        vceqq_u8(v, vdupq_n_u8(b'\\')),
                    ),
                )
            }
        }
        let c0 = cmp(vld1q_u8(src));
        let c1 = cmp(vld1q_u8(src.add(16)));
        let c2 = cmp(vld1q_u8(src.add(32)));
        let c3 = cmp(vld1q_u8(src.add(48)));
        if vmaxvq_u8(vorrq_u8(vorrq_u8(c0, c1), vorrq_u8(c2, c3))) == 0 {
            return 0;
        }
        // Movemask: weight each lane by its bit, then three rounds of pairwise adds. Lane 0 of
        // the result then holds the bits of bytes 0..8, lane 1 those of bytes 8..16, and so on.
        const W: [u8; 16] = [1, 2, 4, 8, 16, 32, 64, 128, 1, 2, 4, 8, 16, 32, 64, 128];
        let w = vld1q_u8(W.as_ptr());
        let s0 = vpaddq_u8(vandq_u8(c0, w), vandq_u8(c1, w));
        let s1 = vpaddq_u8(vandq_u8(c2, w), vandq_u8(c3, w));
        let s = vpaddq_u8(s0, s1);
        let s = vpaddq_u8(s, s);
        vgetq_lane_u64(vreinterpretq_u64_u8(s), 0)
    }
}

/// Bit `k` set iff `src[k]` needs escaping, for `src[0..64]`.
///
/// # Safety
/// `src..src + 64` must be readable.
#[cfg(target_arch = "x86_64")]
#[inline(always)]
unsafe fn simd_mask(src: *const u8) -> u64 {
    use std::arch::x86_64::*;
    unsafe {
        #[inline(always)]
        unsafe fn cmp(p: *const u8) -> u64 {
            unsafe {
                let v = _mm_loadu_si128(p as *const __m128i);
                // v <= 0x1f (unsigned) iff min(v, 0x1f) == v
                let ctrl = _mm_cmpeq_epi8(_mm_min_epu8(v, _mm_set1_epi8(0x1f)), v);
                let q = _mm_cmpeq_epi8(v, _mm_set1_epi8(b'"' as i8));
                let s = _mm_cmpeq_epi8(v, _mm_set1_epi8(b'\\' as i8));
                _mm_movemask_epi8(_mm_or_si128(ctrl, _mm_or_si128(q, s))) as u16 as u64
            }
        }
        cmp(src) | (cmp(src.add(16)) << 16) | (cmp(src.add(32)) << 32) | (cmp(src.add(48)) << 48)
    }
}

#[cfg(not(any(
    all(target_arch = "aarch64", target_feature = "neon"),
    target_arch = "x86_64"
)))]
#[inline(always)]
unsafe fn simd_mask(src: *const u8) -> u64 {
    unsafe { swar_mask(src) }
}

/// Bit `k` set iff `src[k]` needs escaping, for `src[0..64]`, without SIMD instructions: each
/// `u64` is compared bytewise with arithmetic that never carries between bytes.
///
/// # Safety
/// `src..src + 64` must be readable.
#[cfg_attr(not(test), allow(dead_code))]
#[inline(always)]
unsafe fn swar_mask(src: *const u8) -> u64 {
    const LO: u64 = 0x0101_0101_0101_0101;
    const HI: u64 = 0x8080_8080_8080_8080;
    let mut mask = 0u64;
    let mut k = 0;
    while k < 8 {
        let w = u64::from_le(unsafe { ptr::read_unaligned(src.add(k * 8) as *const u64) });
        // b < 0x20 iff (b & 0x7f) + 0x60 has its high bit clear and b's high bit is clear.
        let ctrl = !((w & !HI).wrapping_add(LO * 0x60) | w);
        // b == c iff t = b ^ c is 0, iff (t & 0x7f) + 0x7f | t has its high bit clear.
        let q = w ^ (LO * b'"' as u64);
        let q = !((q & !HI).wrapping_add(!HI) | q);
        let s = w ^ (LO * b'\\' as u64);
        let s = !((s & !HI).wrapping_add(!HI) | s);
        let m = (ctrl | q | s) & HI;
        // Gather the 8 high bits into 8 consecutive bits.
        mask |= ((m >> 7).wrapping_mul(0x0102_0408_1020_4080) >> 56) << (k * 8);
        k += 1;
    }
    mask
}

/// Copies 64 bytes from `src` to `dst`.
///
/// # Safety
/// Both ranges must be valid, and must not overlap.
#[inline(always)]
unsafe fn copy_block(src: *const u8, dst: *mut u8) {
    unsafe { ptr::copy_nonoverlapping(src, dst, BLOCK) }
}

/// `text` as a JSON string literal, byte-identical to `serde_json::to_vec(text)`.
pub fn escape_json(text: &str) -> Vec<u8> {
    escape_json_with::<HAS_SIMD_MASK>(text)
}

/// [`escape_json`], with the SIMD mask if `SIMD` (and the target has one), [`swar_mask`]
/// otherwise.
#[inline(always)]
fn escape_json_with<const SIMD: bool>(text: &str) -> Vec<u8> {
    let src = text.as_bytes();
    let n = src.len();
    let s = src.as_ptr();
    // Sources need an escape every ~20-35 bytes, almost all 2 bytes long (`\n`), so 1/8 of
    // slack avoids regrowing for nearly every real file (and keeps the final `shrink_to_fit` of
    // `Rope::from` cheap).
    let mut out = Vec::<u8>::with_capacity(n + n / 8 + 2 * BLOCK);
    let mut i = 0;
    // `d` is an offset into `out`; everything below it has been written (`src[..i]`, escaped).
    let mut d = 0;

    /// Bytes one block can write past `d`: a 64-byte copy after each of up to 64 escapes of up
    /// to 8 bytes (6 used), rounded up.
    const BLOCK_ROOM: usize = BLOCK * 6 + BLOCK + 8;

    // SAFETY: every write is within `out`'s capacity: a block writes at most `BLOCK_ROOM` bytes
    // past `d`, checked before the block, and the tail at most 6 bytes per input byte plus the
    // closing quote, checked before the tail. Every read is within `src`: blocks run while
    // `i + 2 * BLOCK <= n`, and the copy after an escape reads at most `i + BLOCK + BLOCK` bytes.
    // `out`'s pointer is read again after every `reserve`.
    unsafe {
        *out.as_mut_ptr() = b'"';
        d += 1;

        while i + 2 * BLOCK <= n {
            if out.capacity() - d < BLOCK_ROOM {
                out.set_len(d);
                out.reserve(d / 2 + (n - i) + BLOCK_ROOM);
            }
            let o = out.as_mut_ptr();
            copy_block(s.add(i), o.add(d));
            let mut m = if SIMD {
                simd_mask(s.add(i))
            } else {
                swar_mask(s.add(i))
            };
            if m == 0 {
                d += BLOCK;
                i += BLOCK;
                continue;
            }
            // `q`: the source offset that output offset `d` corresponds to.
            let mut q = i;
            loop {
                let j = i + m.trailing_zeros() as usize;
                d += j - q;
                let c = *s.add(j) as usize;
                ptr::copy_nonoverlapping(ESCAPE[c].as_ptr(), o.add(d), 8);
                d += ESCAPE_LEN[c] as usize;
                q = j + 1;
                copy_block(s.add(q), o.add(d));
                m &= m - 1;
                if m == 0 {
                    break;
                }
            }
            d += i + BLOCK - q;
            i += BLOCK;
        }

        // The last < 128 bytes.
        let rest = n - i;
        if out.capacity() - d < rest * 6 + 1 {
            out.set_len(d);
            out.reserve(rest * 6 + 1);
        }
        let o = out.as_mut_ptr();
        while i < n {
            let c = *s.add(i) as usize;
            let len = ESCAPE_LEN[c] as usize;
            if len == 0 {
                *o.add(d) = c as u8;
                d += 1;
            } else {
                ptr::copy_nonoverlapping(ESCAPE[c].as_ptr(), o.add(d), len);
                d += len;
            }
            i += 1;
        }
        *o.add(d) = b'"';
        d += 1;
        out.set_len(d);
    }
    out
}

#[cfg(test)]
mod tests {
    use rand::{RngExt, SeedableRng, rngs::SmallRng};

    use super::{escape_json_with, swar_mask};

    fn check(text: &str) {
        let expected = serde_json::to_vec(text).unwrap();
        assert_eq!(escape_json_with::<true>(text), expected, "{text:?}");
        assert_eq!(escape_json_with::<false>(text), expected, "{text:?} (SWAR)");
    }

    /// Special bytes at every position of strings around the block boundaries.
    #[test]
    fn matches_serde_json_at_block_boundaries() {
        check("");
        check("\u{1}\u{1f}\u{7f}é😀\u{2028}\u{2029}/");
        let specials = [
            '"', '\\', '\n', '\r', '\t', '\u{8}', '\u{c}', '\0', '\u{1b}', '\u{1f}',
        ];
        for len in [1, 63, 64, 65, 127, 128, 129, 191, 192, 193, 255, 256, 300] {
            check(&"x".repeat(len));
            check(&"\u{1}".repeat(len));
            check(&"\"".repeat(len));
            for special in specials {
                for at in 0..len {
                    let text: String = (0..len)
                        .map(|i| if i == at { special } else { 'x' })
                        .collect();
                    check(&text);
                }
            }
        }
    }

    /// Random strings mixing special bytes with multi-byte characters.
    #[test]
    fn matches_serde_json_on_random_strings() {
        let alphabet: Vec<char> = (0u8..0x20)
            .map(char::from)
            .chain([
                '"', '\\', '\u{7f}', 'a', ' ', 'é', '€', '😀', '\u{2028}', '\u{ffff}',
            ])
            .chain(['\u{10ffff}'])
            .collect();
        let mut rng = SmallRng::seed_from_u64(42);
        for _ in 0..2_000 {
            let len = rng.random_range(0..600);
            let text: String = (0..len)
                .map(|_| {
                    if rng.random_bool(0.7) {
                        'x'
                    } else {
                        alphabet[rng.random_range(0..alphabet.len())]
                    }
                })
                .collect();
            check(&text);
        }
    }

    /// The SWAR mask agrees with the target's SIMD mask (where there is one) on every byte value
    /// at every position of a block.
    #[test]
    fn swar_mask_matches_simd_mask() {
        for byte in 0..=255u8 {
            for at in 0..64 {
                let mut block = [b'x'; 64];
                block[at] = byte;
                let expected = if byte < 0x20 || byte == b'"' || byte == b'\\' {
                    1u64 << at
                } else {
                    0
                };
                unsafe {
                    assert_eq!(swar_mask(block.as_ptr()), expected, "{byte:#x} at {at}");
                    assert_eq!(
                        super::simd_mask(block.as_ptr()),
                        expected,
                        "{byte:#x} at {at}"
                    );
                }
            }
        }
    }
}
