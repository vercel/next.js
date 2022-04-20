// Ported from https://github.com/aappleby/smhasher/blob/61a0530f28277f2e850bfc39600ce61d02b518de/src/MurmurHash2.cpp#L37-L86

use byteorder::{ByteOrder, LittleEndian};

const M: u32 = 0x5bd1_e995;

pub(crate) fn murmurhash2(key: &[u8], initial_state: u32) -> u32 {
    let mut h: u32 = initial_state;

    let mut four_bytes_chunks = key.chunks_exact(4);
    for chunk in four_bytes_chunks.by_ref() {
        let mut k: u32 = LittleEndian::read_u32(chunk);
        k = k.wrapping_mul(M);
        k ^= k >> 24;
        h = k.wrapping_mul(M) ^ h.wrapping_mul(M);
    }
    let remainder = four_bytes_chunks.remainder();

    // Handle the last few bytes of the input array
    match remainder.len() {
        3 => {
            h ^= u32::from(remainder[2]) << 16;
        }
        2 => {
            h ^= u32::from(remainder[1]) << 8;
        }
        1 => {
            h ^= u32::from(remainder[0]);
            h = h.wrapping_mul(M);
        }
        _ => {}
    }
    h ^= h >> 13;
    h = h.wrapping_mul(M);
    h ^ (h >> 15)
}

#[cfg(test)]
mod test {

    use super::murmurhash2;

    #[test]
    fn test_murmur2() {
        let s1 = "abcdef";
        let s2 = "abcdeg";
        for i in 0..5 {
            assert_eq!(
                murmurhash2(s1[i..5].as_bytes(), 0),
                murmurhash2(s2[i..5].as_bytes(), 0)
            );
        }
    }

    #[test]
    fn verify_hash() {
        assert_eq!(
            murmurhash2("something".as_bytes(), 0),
            u32::from_str_radix("crsxd7", 36).unwrap()
        );
    }
}
