//! Fixed-width little-endian integer encoding, independent of the encoder's configured
//! [`IntEncoding`][bincode::config::IntEncoding].
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
    #[doc(hidden)]
    type Bytes: AsRef<[u8]> + AsMut<[u8]> + Default;
    #[doc(hidden)]
    fn to_le_bytes(self) -> Self::Bytes;
    #[doc(hidden)]
    fn from_le_bytes(bytes: Self::Bytes) -> Self;
}

mod private {
    pub trait Sealed {}
}

macro_rules! impl_fixed_width_int {
    ($($ty:ty),*) => {$(
        impl private::Sealed for $ty {}
        impl FixedWidthInt for $ty {
            type Bytes = [u8; size_of::<$ty>()];
            #[inline(always)]
            fn to_le_bytes(self) -> Self::Bytes {
                <$ty>::to_le_bytes(self)
            }
            #[inline(always)]
            fn from_le_bytes(bytes: Self::Bytes) -> Self {
                <$ty>::from_le_bytes(bytes)
            }
        }
    )*};
}

impl_fixed_width_int!(u8, u16, u32, u64);

/// Encodes `value` as its little-endian bytes.
#[inline]
pub fn encode<T: FixedWidthInt, E: Encoder>(encoder: &mut E, value: T) -> Result<(), EncodeError> {
    encoder.writer().write(value.to_le_bytes().as_ref())
}

/// Decodes a value written by [`encode`].
#[inline]
pub fn decode<T: FixedWidthInt, D: Decoder>(decoder: &mut D) -> Result<T, DecodeError> {
    let mut bytes = T::Bytes::default();
    decoder.claim_bytes_read(bytes.as_ref().len())?;
    decoder.reader().read(bytes.as_mut())?;
    Ok(T::from_le_bytes(bytes))
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
