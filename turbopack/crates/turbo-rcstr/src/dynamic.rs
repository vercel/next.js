use std::{num::NonZeroU8, ptr::NonNull};

use triomphe::Arc;

use crate::{
    INLINE_TAG, INLINE_TAG_INIT, LEN_OFFSET, RcStr, TAG_MASK,
    tagged_value::{MAX_INLINE_LEN, TaggedValue},
};

pub(crate) struct PrehashedString {
    pub value: String,
    /// This is not the actual `fxhash`, but rather it's a value that passed to
    /// `write_u64` of [rustc_hash::FxHasher].
    pub hash: u64,
}

pub unsafe fn cast(ptr: TaggedValue) -> *const PrehashedString {
    ptr.get_ptr().cast()
}

pub(crate) unsafe fn deref_from<'i>(ptr: TaggedValue) -> &'i PrehashedString {
    unsafe { &*cast(ptr) }
}

/// Caller should call `forget` (or `clone`) on the returned `Arc`
pub unsafe fn restore_arc(v: TaggedValue) -> Arc<PrehashedString> {
    let ptr = v.get_ptr() as *const PrehashedString;
    unsafe { Arc::from_raw(ptr) }
}

/// This can create any kind of [Atom], although this lives in the `dynamic`
/// module.
pub(crate) fn new_atom<T: AsRef<str> + Into<String>>(text: T) -> RcStr {
    let len = text.as_ref().len();

    if len < MAX_INLINE_LEN {
        // INLINE_TAG ensures this is never zero
        let tag = INLINE_TAG_INIT | ((len as u8) << LEN_OFFSET);
        let mut unsafe_data = TaggedValue::new_tag(tag);
        unsafe {
            unsafe_data.data_mut()[..len].copy_from_slice(text.as_ref().as_bytes());
        }
        return RcStr { unsafe_data };
    }

    let hash = hash_bytes(text.as_ref().as_bytes());

    let entry: Arc<PrehashedString> = Arc::new(PrehashedString {
        value: text.into(),
        hash,
    });
    let entry = Arc::into_raw(entry);

    let ptr: NonNull<PrehashedString> = unsafe {
        // Safety: Arc::into_raw returns a non-null pointer
        NonNull::new_unchecked(entry as *mut _)
    };
    debug_assert!(0 == ptr.as_ptr() as u8 & TAG_MASK);
    RcStr {
        unsafe_data: TaggedValue::new_ptr(ptr),
    }
}

/// Attempts to construct an RcStr but only if it can be constructed inline.
/// This is primarily useful in constant contexts.
#[doc(hidden)]
pub(crate) const fn inline_atom(text: &str) -> Option<RcStr> {
    let len = text.len();
    if len < MAX_INLINE_LEN {
        let tag = INLINE_TAG | ((len as u8) << LEN_OFFSET);
        let mut unsafe_data = TaggedValue::new_tag(NonZeroU8::new(tag).unwrap());

        // This odd pattern is needed because we cannot create slices from ranges in constant
        // context.
        unsafe {
            unsafe_data
                .data_mut()
                .split_at_mut(len)
                .0
                .copy_from_slice(text.as_bytes());
        }
        return Some(RcStr { unsafe_data });
    }
    None
}

// Nothing special, digits of pi.
const SEED1: u64 = 0x243f6a8885a308d3;
const SEED2: u64 = 0x13198a2e03707344;
const PREVENT_TRIVIAL_ZERO_COLLAPSE: u64 = 0xa4093822299f31d0;

#[inline]
fn multiply_mix(x: u64, y: u64) -> u64 {
    #[cfg(target_pointer_width = "64")]
    {
        // We compute the full u64 x u64 -> u128 product, this is a single mul
        // instruction on x86-64, one mul plus one mulhi on ARM64.
        let full = (x as u128) * (y as u128);
        let lo = full as u64;
        let hi = (full >> 64) as u64;

        // The middle bits of the full product fluctuate the most with small
        // changes in the input. This is the top bits of lo and the bottom bits
        // of hi. We can thus make the entire output fluctuate with small
        // changes to the input by XOR'ing these two halves.
        lo ^ hi

        // Unfortunately both 2^64 + 1 and 2^64 - 1 have small prime factors,
        // otherwise combining with + or - could result in a really strong hash, as:
        //     x * y = 2^64 * hi + lo = (-1) * hi + lo = lo - hi,   (mod 2^64 + 1)
        //     x * y = 2^64 * hi + lo =    1 * hi + lo = lo + hi,   (mod 2^64 - 1)
        // Multiplicative hashing is universal in a field (like mod p).
    }

    #[cfg(target_pointer_width = "32")]
    {
        // u64 x u64 -> u128 product is prohibitively expensive on 32-bit.
        // Decompose into 32-bit parts.
        let lx = x as u32;
        let ly = y as u32;
        let hx = (x >> 32) as u32;
        let hy = (y >> 32) as u32;

        // u32 x u32 -> u64 the low bits of one with the high bits of the other.
        let afull = (lx as u64) * (hy as u64);
        let bfull = (hx as u64) * (ly as u64);

        // Combine, swapping low/high of one of them so the upper bits of the
        // product of one combine with the lower bits of the other.
        afull ^ bfull.rotate_right(32)
    }
}

/// Copied from `hash_bytes` of `rustc-hash`.
///
/// See: https://github.com/rust-lang/rustc-hash/blob/dc5c33f1283de2da64d8d7a06401d91aded03ad4/src/lib.rs#L252-L297
///
/// ---
///
/// A wyhash-inspired non-collision-resistant hash for strings/slices designed
/// by Orson Peters, with a focus on small strings and small codesize.
///
/// The 64-bit version of this hash passes the SMHasher3 test suite on the full
/// 64-bit output, that is, f(hash_bytes(b) ^ f(seed)) for some good avalanching
/// permutation f() passed all tests with zero failures. When using the 32-bit
/// version of multiply_mix this hash has a few non-catastrophic failures where
/// there are a handful more collisions than an optimal hash would give.
///
/// We don't bother avalanching here as we'll feed this hash into a
/// multiplication after which we take the high bits, which avalanches for us.
#[inline]
fn hash_bytes(bytes: &[u8]) -> u64 {
    let len = bytes.len();
    let mut s0 = SEED1;
    let mut s1 = SEED2;

    if len <= 16 {
        // XOR the input into s0, s1.
        if len >= 8 {
            s0 ^= u64::from_le_bytes(bytes[0..8].try_into().unwrap());
            s1 ^= u64::from_le_bytes(bytes[len - 8..].try_into().unwrap());
        } else if len >= 4 {
            s0 ^= u32::from_le_bytes(bytes[0..4].try_into().unwrap()) as u64;
            s1 ^= u32::from_le_bytes(bytes[len - 4..].try_into().unwrap()) as u64;
        } else if len > 0 {
            let lo = bytes[0];
            let mid = bytes[len / 2];
            let hi = bytes[len - 1];
            s0 ^= lo as u64;
            s1 ^= ((hi as u64) << 8) | mid as u64;
        }
    } else {
        // Handle bulk (can partially overlap with suffix).
        let mut off = 0;
        while off < len - 16 {
            let x = u64::from_le_bytes(bytes[off..off + 8].try_into().unwrap());
            let y = u64::from_le_bytes(bytes[off + 8..off + 16].try_into().unwrap());

            // Replace s1 with a mix of s0, x, and y, and s0 with s1.
            // This ensures the compiler can unroll this loop into two
            // independent streams, one operating on s0, the other on s1.
            //
            // Since zeroes are a common input we prevent an immediate trivial
            // collapse of the hash function by XOR'ing a constant with y.
            let t = multiply_mix(s0 ^ x, PREVENT_TRIVIAL_ZERO_COLLAPSE ^ y);
            s0 = s1;
            s1 = t;
            off += 16;
        }

        let suffix = &bytes[len - 16..];
        s0 ^= u64::from_le_bytes(suffix[0..8].try_into().unwrap());
        s1 ^= u64::from_le_bytes(suffix[8..16].try_into().unwrap());
    }

    multiply_mix(s0, s1) ^ (len as u64)
}

#[cfg(test)]
mod tests {
    use std::hash::{Hash, Hasher};

    use rustc_hash::FxHasher;

    use crate::RcStr;

    // Ensure that the hash value is the same as the one generated by FxHasher.
    //
    // This is to important for `Borrow<str>` implementation to be correct.
    // Note that if we enable `nightly` feature of `rustc-hash`, we need to remove
    // `state.write_u8(0xff);` from the hash implementation of `RcStr`.
    #[test]
    fn test_hash() {
        let long_string = "A very long long long string that would not be inlined";

        {
            let u64_value = super::hash_bytes(long_string.as_bytes());
            dbg!(u64_value);
            let mut hasher = FxHasher::default();
            hasher.write_u64(u64_value);
            let expected = hasher.finish();

            println!("Expected: {expected:?}");
        }

        let str = RcStr::from(long_string);
        assert_eq!(fxhash(str), fxhash(long_string));
    }

    fn fxhash<T: Hash>(value: T) -> u64 {
        let mut hasher = FxHasher::default();
        value.hash(&mut hasher);
        hasher.finish()
    }
}
