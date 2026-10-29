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

macro_rules! fixed_width {
    ($($ty:ty: $encode:ident, $decode:ident;)*) => {$(
        #[doc = concat!("Encodes a `", stringify!($ty), "` as its little-endian bytes.")]
        #[inline]
        pub fn $encode<E: Encoder>(encoder: &mut E, value: $ty) -> Result<(), EncodeError> {
            encoder.writer().write(&value.to_le_bytes())
        }

        #[doc = concat!("Decodes a `", stringify!($ty), "` written by [`", stringify!($encode), "`].")]
        #[inline]
        pub fn $decode<D: Decoder>(decoder: &mut D) -> Result<$ty, DecodeError> {
            let mut bytes = [0u8; size_of::<$ty>()];
            decoder.claim_bytes_read(bytes.len())?;
            decoder.reader().read(&mut bytes)?;
            Ok(<$ty>::from_le_bytes(bytes))
        }
    )*};
}

fixed_width! {
    u8: encode_u8, decode_u8;
    u16: encode_u16, decode_u16;
    u32: encode_u32, decode_u32;
    u64: encode_u64, decode_u64;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{TurboBincodeBuffer, new_turbo_bincode_decoder, new_turbo_bincode_encoder};

    #[test]
    fn roundtrip_at_natural_width() {
        let mut buf = TurboBincodeBuffer::new();
        let mut encoder = new_turbo_bincode_encoder(&mut buf);
        encode_u8(&mut encoder, 3).unwrap();
        encode_u16(&mut encoder, 7).unwrap();
        encode_u32(&mut encoder, u32::MAX).unwrap();
        encode_u64(&mut encoder, 1 << 40).unwrap();
        assert_eq!(buf.len(), 1 + 2 + 4 + 8);

        let mut decoder = new_turbo_bincode_decoder(&buf);
        assert_eq!(decode_u8(&mut decoder).unwrap(), 3);
        assert_eq!(decode_u16(&mut decoder).unwrap(), 7);
        assert_eq!(decode_u32(&mut decoder).unwrap(), u32::MAX);
        assert_eq!(decode_u64(&mut decoder).unwrap(), 1 << 40);
        assert!(decode_u16(&mut decoder).is_err());
    }
}
