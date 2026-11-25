use bincode::{Encode, enc::Encoder, error::EncodeError};

use crate::TurboBincodeEncoder;

/// Encodes a length-prefixed sequence whose length is only known after its elements are written,
/// so a filtered collection can be encoded in a single pass without collecting the surviving
/// elements first.
///
/// `max_len` is written as the length prefix up front but if fewer elements are actually written we
/// overwrite in place with a smaller value.  Because the length is written as a varint and the size
/// can only go down we never have to move anything but this can lead to writing 'overlong' varints.
/// Bincode tolerates this but it isn't well specified.
///
/// A consequence of this is that the encoding is 'non-canonical'.  e.g. roundtripping can produce a
/// different byte sequence.  So if deterministic encoding is required this utility cannot be used.
#[inline]
pub fn encode_len_prefixed<'a>(
    encoder: &mut TurboBincodeEncoder<'a>,
    max_len: usize,
    encode_elements: impl FnOnce(&mut TurboBincodeEncoder<'a>) -> Result<usize, EncodeError>,
) -> Result<usize, EncodeError> {
    let start = encoder.writer().buffer.len();
    max_len.encode(encoder)?;
    let end = encoder.writer().buffer.len();
    let len = encode_elements(encoder)?;
    assert!(
        len <= max_len,
        "encoded {len} elements but only reserved a length of {max_len}"
    );
    if len != max_len {
        patch_len_prefix(&mut encoder.writer().buffer[start..end], len);
    }
    Ok(len)
}

fn patch_len_prefix(prefix: &mut [u8], len: usize) {
    // This mirrors bincode's little-endian varint encoding (`TURBO_BINCODE_CONFIG`): values up to
    // 250 are a single byte, larger ones are a discriminant byte followed by a u16, u32 or u64.
    // Keep the discriminant and write `len` at that width.
    match prefix.len() {
        // `len < max_len <= 250`, so it is a single byte too
        1 => prefix[0] = len as u8,
        3 => prefix[1..].copy_from_slice(&(len as u16).to_le_bytes()),
        5 => prefix[1..].copy_from_slice(&(len as u32).to_le_bytes()),
        9 => prefix[1..].copy_from_slice(&(len as u64).to_le_bytes()),
        width => unreachable!("unexpected varint width {width}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        TurboBincodeBuffer, new_turbo_bincode_encoder, turbo_bincode_decode, turbo_bincode_encode,
    };

    type Framed = (u8, Vec<u32>, u8);

    /// Encodes the first `len` of `max_len` elements as a length-prefixed sequence, framed by a
    /// leading and trailing byte to catch writes outside the prefix and elements.
    fn encode_reserved(max_len: usize, len: usize) -> TurboBincodeBuffer {
        let mut buffer = TurboBincodeBuffer::new();
        let mut encoder = new_turbo_bincode_encoder(&mut buffer);
        0xAAu8.encode(&mut encoder).unwrap();
        let written = encode_len_prefixed(&mut encoder, max_len, |encoder| {
            for i in 0..len {
                (i as u32).encode(encoder)?;
            }
            Ok(len)
        })
        .unwrap();
        assert_eq!(written, len);
        0xBBu8.encode(&mut encoder).unwrap();
        buffer
    }

    fn expected(len: usize) -> Framed {
        (0xAA, (0..len as u32).collect(), 0xBB)
    }

    /// This also guards that bincode accepts overlong varints: the cases that cross a width
    /// boundary would fail to decode (or decode wrongly) if bincode started rejecting them.
    #[test]
    fn decodes_to_actual_length() {
        // Varint widths change above 250 (1 -> 3 bytes) and above u16::MAX (3 -> 5 bytes).
        let cases = [
            (0, 0),
            (5, 5),
            (5, 3),
            (5, 0),
            (250, 0),
            (251, 251),
            (251, 250),
            (251, 0),
            (300, 251),
            (65535, 251),
            (65535, 250),
            (65536, 65536),
            (65536, 65535),
            (65536, 250),
            (70000, 66000),
        ];
        for (max_len, len) in cases {
            let encoded = encode_reserved(max_len, len);
            let decoded: Framed = turbo_bincode_decode(&encoded)
                .unwrap_or_else(|e| panic!("max_len={max_len} len={len}: {e}"));
            assert_eq!(decoded, expected(len), "max_len={max_len} len={len}");
        }
    }

    #[test]
    fn keeps_reserved_width() {
        // 250 fits in one byte, but the 3-byte reservation for 251 is kept: [251, 250, 0]
        let encoded = encode_reserved(251, 250);
        assert_eq!(&encoded[1..4], &[251, 250, 0]);
        // Without a width change the encoding is canonical
        assert_eq!(
            encode_reserved(5, 3),
            turbo_bincode_encode(&expected(3)).unwrap()
        );
    }
}
