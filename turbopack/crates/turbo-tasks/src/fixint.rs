//! Transparent value types that persist an integer at its natural width.
//!
//! The persistent cache encodes integers as varints. A varint is smaller than the natural width
//! only while the value fits in the lower half of its type; above that it costs one extra byte
//! (9 bytes for a `u64`, 17 for a `u128`) and is slower to encode and decode. Hashes, and other
//! values that tend to use all of their bits, almost always pay that extra byte, so they should be
//! stored with `#[bincode(fixint)]` instead. The same goes for millisecond timestamps, which are
//! always above 2^32 (unlike second timestamps, which stay below it until 2106).
//!
//! For a struct field, put `#[bincode(fixint)]` on the field directly. These newtypes exist for
//! the case where there is no field to annotate: a function that returns a bare integer cell.
//! Return `Vc<FixintU64>` instead of `Vc<u64>`, and readers still get a `u64` out of `.await?`.

use crate as turbo_tasks;

/// A `u64` cell that is persisted at its full 8 bytes. Use this for hashes, or other values that
/// usually use more than 32 bits.
///
/// Reads as a plain `u64`.
#[turbo_tasks::value(transparent)]
pub struct FixintU64(#[bincode(fixint)] u64);

/// A `u128` cell that is persisted at its full 16 bytes. Use this for hashes, or other values
/// that usually use more than 64 bits.
///
/// Reads as a plain `u128`.
#[turbo_tasks::value(transparent)]
pub struct FixintU128(#[bincode(fixint)] u128);

#[cfg(test)]
mod tests {
    use bincode::{Decode, Encode};
    use turbo_bincode::{TurboBincodeBuffer, new_turbo_bincode_decoder, new_turbo_bincode_encoder};

    use super::*;

    fn roundtrip<T: Encode + Decode<()>>(value: &T) -> (usize, T) {
        let mut buf = TurboBincodeBuffer::new();
        value
            .encode(&mut new_turbo_bincode_encoder(&mut buf))
            .unwrap();
        let decoded = T::decode(&mut new_turbo_bincode_decoder(&buf)).unwrap();
        (buf.len(), decoded)
    }

    #[test]
    fn encodes_at_natural_width() {
        // Small and large values take the same space: a varint would use 1 and 9/17 bytes.
        for value in [1, u64::MAX] {
            let (len, decoded) = roundtrip(&FixintU64(value));
            assert_eq!(len, 8);
            assert_eq!(decoded.0, value);
        }
        for value in [1, u128::MAX] {
            let (len, decoded) = roundtrip(&FixintU128(value));
            assert_eq!(len, 16);
            assert_eq!(decoded.0, value);
        }
    }
}
