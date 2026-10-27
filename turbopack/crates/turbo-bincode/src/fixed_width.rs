//! Fixed-width little-endian integer encoding, independent of the encoder's configured
//! [`IntEncoding`][bincode::config::IntEncoding].  This is useful when certain integers are
//! unlikely to benefit from varint encoding.
//!
//! The encoding here is consistent and uses LittleEndian encoding, ideally we would respect the
//! bincode settings but this isn't possible.
//!
//! [`TURBO_BINCODE_CONFIG`][crate::TURBO_BINCODE_CONFIG] uses varint encoding, which only saves
//! space for values below 2^16 (1 or 3 bytes) and costs an extra discriminant byte above that.
//! Identifiers such as task ids and packed cell ids are usually large, so they encode smaller (and
//! faster) at their natural width.

use bincode::{
    de::{Decoder, read::Reader},
    enc::{Encoder, write::Writer},
    error::{DecodeError, EncodeError},
};

/// An unsigned integer that can be written as exactly `size_of::<Self>()` little-endian bytes.
pub trait FixedWidthInt: Copy + private::Sealed {
    fn encode_fixed<E: Encoder>(self, encoder: &mut E) -> Result<(), EncodeError>;
    fn decode_fixed<D: Decoder>(decoder: &mut D) -> Result<Self, DecodeError>;
}

mod private {
    pub trait Sealed {}
}

macro_rules! impl_fixed_width_int {
    ($($ty:ty),*) => {$(
        impl private::Sealed for $ty {}
        impl FixedWidthInt for $ty {
            #[inline]
            fn encode_fixed<E: Encoder>(self, encoder: &mut E) -> Result<(), EncodeError> {
                encoder.writer().write(&self.to_le_bytes())
            }

            #[inline]
            fn decode_fixed<D: Decoder>(decoder: &mut D) -> Result<Self, DecodeError> {
                let mut bytes = [0u8; size_of::<$ty>()];
                decoder.claim_bytes_read(bytes.len())?;
                decoder.reader().read(&mut bytes)?;
                Ok(<$ty>::from_le_bytes(bytes))
            }
        }
    )*};
}

impl_fixed_width_int!(u8, u16, u32, u64);

/// Encodes `value` as its little-endian bytes.
#[inline]
pub fn encode<T: FixedWidthInt, E: Encoder>(encoder: &mut E, value: T) -> Result<(), EncodeError> {
    value.encode_fixed(encoder)
}

/// Decodes a value written by [`encode`].
#[inline]
pub fn decode<T: FixedWidthInt, D: Decoder>(decoder: &mut D) -> Result<T, DecodeError> {
    T::decode_fixed(decoder)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{TurboBincodeBuffer, new_turbo_bincode_decoder, new_turbo_bincode_encoder};

    #[test]
    fn roundtrip_at_natural_width() {
        let mut buf = TurboBincodeBuffer::new();
        let mut encoder = new_turbo_bincode_encoder(&mut buf);
        encode(&mut encoder, 3u8).unwrap();
        encode(&mut encoder, 7u16).unwrap();
        encode(&mut encoder, u32::MAX).unwrap();
        encode(&mut encoder, 1u64 << 40).unwrap();
        assert_eq!(buf.len(), 1 + 2 + 4 + 8);

        let mut decoder = new_turbo_bincode_decoder(&buf);
        assert_eq!(decode::<u8, _>(&mut decoder).unwrap(), 3);
        assert_eq!(decode::<u16, _>(&mut decoder).unwrap(), 7);
        assert_eq!(decode::<u32, _>(&mut decoder).unwrap(), u32::MAX);
        assert_eq!(decode::<u64, _>(&mut decoder).unwrap(), 1 << 40);
        assert!(decode::<u16, _>(&mut decoder).is_err());
    }
}
