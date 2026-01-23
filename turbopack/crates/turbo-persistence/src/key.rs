use std::{cmp::min, hash::Hasher};

/// A trait for keys that can be used for hashing.
pub trait KeyBase {
    /// Returns the length of the key in bytes.
    fn len(&self) -> usize;
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
    /// Hashes the key. It should not include the structure of the key, only the data. E.g. `([1,
    /// 2], [3, 4])` should hash the same as `[1, 2, 3, 4]`.
    fn hash<H: Hasher>(&self, state: &mut H);
}

impl KeyBase for &'_ [u8] {
    fn len(&self) -> usize {
        <[u8]>::len(self)
    }

    fn is_empty(&self) -> bool {
        <[u8]>::is_empty(self)
    }

    fn hash<H: Hasher>(&self, state: &mut H) {
        for item in *self {
            state.write_u8(*item);
        }
    }
}

impl<const N: usize> KeyBase for [u8; N] {
    fn len(&self) -> usize {
        N
    }

    fn is_empty(&self) -> bool {
        N > 0
    }

    fn hash<H: Hasher>(&self, state: &mut H) {
        for item in self {
            state.write_u8(*item);
        }
    }
}

impl KeyBase for Vec<u8> {
    fn len(&self) -> usize {
        self.len()
    }

    fn is_empty(&self) -> bool {
        self.is_empty()
    }

    fn hash<H: Hasher>(&self, state: &mut H) {
        for item in self {
            state.write_u8(*item);
        }
    }
}

impl KeyBase for u8 {
    fn len(&self) -> usize {
        1
    }

    fn is_empty(&self) -> bool {
        false
    }

    fn hash<H: Hasher>(&self, state: &mut H) {
        state.write_u8(*self);
    }
}

impl<A: KeyBase, B: KeyBase> KeyBase for (A, B) {
    fn len(&self) -> usize {
        let (a, b) = self;
        a.len() + b.len()
    }

    fn is_empty(&self) -> bool {
        let (a, b) = self;
        a.is_empty() && b.is_empty()
    }

    fn hash<H: Hasher>(&self, state: &mut H) {
        let (a, b) = self;
        KeyBase::hash(a, state);
        KeyBase::hash(b, state);
    }
}

impl<T: KeyBase> KeyBase for &'_ T {
    fn len(&self) -> usize {
        (*self).len()
    }

    fn is_empty(&self) -> bool {
        (*self).is_empty()
    }

    fn hash<H: Hasher>(&self, state: &mut H) {
        (*self).hash(state)
    }
}

/// A trait for keys that can be used to query the database. They need to allow hashing and
/// comparison with a byte slice (total order).
pub trait QueryKey: KeyBase {
    fn cmp(&self, key: &[u8]) -> std::cmp::Ordering;
}

impl QueryKey for &'_ [u8] {
    fn cmp(&self, key: &[u8]) -> std::cmp::Ordering {
        Ord::cmp(self, &key)
    }
}

impl<const N: usize> QueryKey for [u8; N] {
    fn cmp(&self, key: &[u8]) -> std::cmp::Ordering {
        Ord::cmp(&self[..], key)
    }
}

impl QueryKey for Vec<u8> {
    fn cmp(&self, key: &[u8]) -> std::cmp::Ordering {
        Ord::cmp(&**self, key)
    }
}

impl QueryKey for u8 {
    fn cmp(&self, key: &[u8]) -> std::cmp::Ordering {
        Ord::cmp(&[*self][..], key)
    }
}

impl<A: QueryKey, B: QueryKey> QueryKey for (A, B) {
    fn cmp(&self, mut key: &[u8]) -> std::cmp::Ordering {
        let (a, b) = self;
        let len = a.len();
        let key_len = key.len();
        let key_part = &key[..min(key_len, len)];
        match a.cmp(key_part) {
            std::cmp::Ordering::Equal => {
                key = &key[len..];
                b.cmp(key)
            }
            ord => ord,
        }
    }
}

impl<T: QueryKey> QueryKey for &'_ T {
    fn cmp(&self, key: &[u8]) -> std::cmp::Ordering {
        (*self).cmp(key)
    }
}

/// A trait for keys that can be stored in the database. They need to allow hashing and comparison.
pub trait StoreKey: KeyBase + Ord {
    fn write_to(&self, buf: &mut Vec<u8>);
}

impl<const N: usize> StoreKey for [u8; N] {
    fn write_to(&self, buf: &mut Vec<u8>) {
        buf.extend_from_slice(&self[..]);
    }
}

impl StoreKey for Vec<u8> {
    fn write_to(&self, buf: &mut Vec<u8>) {
        buf.extend_from_slice(self);
    }
}

impl StoreKey for &'_ [u8] {
    fn write_to(&self, buf: &mut Vec<u8>) {
        buf.extend_from_slice(self);
    }
}

impl StoreKey for u8 {
    fn write_to(&self, buf: &mut Vec<u8>) {
        buf.push(*self);
    }
}

impl<A: StoreKey, B: StoreKey> StoreKey for (A, B) {
    fn write_to(&self, buf: &mut Vec<u8>) {
        self.0.write_to(buf);
        self.1.write_to(buf);
    }
}

impl<T: StoreKey> StoreKey for &'_ T {
    fn write_to(&self, buf: &mut Vec<u8>) {
        (*self).write_to(buf);
    }
}

/// A hasher for short keys (len <= 8) that collects bytes directly into a [u8; 8].
struct ShortKeyHasher {
    bytes: [u8; 8],
    pos: usize,
}

impl ShortKeyHasher {
    fn new() -> Self {
        Self {
            bytes: [0u8; 8],
            pos: 0,
        }
    }
}

impl Hasher for ShortKeyHasher {
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            if self.pos < 8 {
                self.bytes[self.pos] = b;
                self.pos += 1;
            }
        }
    }

    fn finish(&self) -> u64 {
        // Convert collected bytes to u64 (big-endian: first byte is most significant)
        let raw = u64::from_be_bytes(self.bytes);

        // Rotate right by (8 - pos) bytes to align the key bytes to the LSB side.
        // This makes trailing zeros significant: [1] and [1, 0] produce different hashes
        // because they have different pos values and thus different rotations.
        let shift = 8 * (8 - self.pos as u32);
        let rotated = raw.rotate_right(shift);

        // Create bit-reversed version for mixing.
        // reverse_bits() mirrors all 64 bits: bit 0 ↔ bit 63, bit 1 ↔ bit 62, etc.
        let reversed = rotated.reverse_bits();

        // Interleave bits from original and reversed using mask 0xCCCC...
        // Binary: 0xC = 1100, so this selects bits 2-3, 6-7, 10-11, ... from each nibble.
        // Each output nibble gets bits 2-3 from original OR'd with bits 2-3 from reversed,
        // combining nearby bits with their distant mirror positions for better distribution.
        (rotated & 0xCCCC_CCCC_CCCC_CCCC) | (reversed & 0xCCCC_CCCC_CCCC_CCCC)
    }
}

/// Hashes a key with a fast, deterministic hash function.
pub fn hash_key(key: &impl KeyBase) -> u64 {
    let key_len = key.len();
    if key_len <= 8 {
        let mut hasher = ShortKeyHasher::new();
        key.hash(&mut hasher);
        hasher.finish()
    } else {
        let mut hasher = twox_hash::XxHash64::with_seed(0);
        key.hash(&mut hasher);
        hasher.finish()
    }
}

#[cfg(test)]
mod tests {
    use std::cmp::Ordering;

    use crate::{QueryKey, key::hash_key};

    #[test]
    fn tuple() {
        let key = (&[1, 2], &[3, 4]);
        assert_eq!(QueryKey::cmp(&key, &[1, 2, 3, 4]), Ordering::Equal);
        assert_eq!(QueryKey::cmp(&key, &[1, 2, 3, 3]), Ordering::Greater);
        assert_eq!(QueryKey::cmp(&key, &[1, 2, 3, 5]), Ordering::Less);
        assert_eq!(QueryKey::cmp(&key, &[0, 2, 3, 4]), Ordering::Greater);
        assert_eq!(QueryKey::cmp(&key, &[2, 2, 3, 4]), Ordering::Less);
        assert_eq!(QueryKey::cmp(&key, &[1, 2, 3, 4, 5]), Ordering::Less);
        assert_eq!(QueryKey::cmp(&key, &[1, 2, 3]), Ordering::Greater);
        assert_eq!(QueryKey::cmp(&key, &[1, 2]), Ordering::Greater);
        assert_eq!(QueryKey::cmp(&key, &[1]), Ordering::Greater);
        assert_eq!(QueryKey::cmp(&key, &[]), Ordering::Greater);
    }

    #[test]
    fn hash() {
        // Small keys (len <= 8) - uses ShortKeyHasher
        let h1 = hash_key(&[1, 2, 3, 4]);
        let h2 = hash_key(&(&[1, 2], &[3, 4]));
        let h3 = hash_key(&(vec![1, 2, 3], 4u8));
        assert_eq!(h2, h1);
        assert_eq!(h3, h1);

        // Exactly 8 bytes - still uses ShortKeyHasher
        let h4 = hash_key(&[1, 2, 3, 4, 5, 6, 7, 8]);
        let h5 = hash_key(&(&[1, 2, 3, 4], &[5, 6, 7, 8]));
        assert_eq!(h5, h4);

        // Big keys (len > 8) - uses XxHash64
        let h6 = hash_key(&[1, 2, 3, 4, 5, 6, 7, 8, 9]);
        let h7 = hash_key(&(&[1, 2, 3, 4, 5], &[6, 7, 8, 9]));
        assert_eq!(h7, h6);

        // Longer key
        let h8 = hash_key(&[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
        let h9 = hash_key(&(&[1, 2, 3, 4, 5, 6, 7, 8], &[9, 10, 11, 12, 13, 14, 15, 16]));
        assert_eq!(h9, h8);
    }

    #[test]
    fn hash_short_keys_exact_values() {
        // Test exact hash values for short keys of various lengths (0-8 bytes)
        // Values computed using bit interleaving

        // Empty key (0 bytes)
        assert_eq!(hash_key(&[0u8; 0]), 0x0000_0000_0000_0000);

        // 1 byte
        assert_eq!(hash_key(&[0x01]), 0x8000_0000_0000_0000);
        assert_eq!(hash_key(&[0x02]), 0x4000_0000_0000_0000);
        assert_eq!(hash_key(&[0x04]), 0x0000_0000_0000_0004);
        assert_eq!(hash_key(&[0x08]), 0x0000_0000_0000_0008);

        // 2 bytes
        assert_eq!(hash_key(&[0x01, 0x02]), 0x4080_0000_0000_0000);

        // 3 bytes
        assert_eq!(hash_key(&[0x01, 0x02, 0x03]), 0xC040_8000_0000_0000);

        // 4 bytes
        assert_eq!(hash_key(&[0x01, 0x02, 0x03, 0x04]), 0x00C0_4080_0000_0004);

        // 5 bytes
        assert_eq!(
            hash_key(&[0x01, 0x02, 0x03, 0x04, 0x05]),
            0x8000_C040_8000_0404
        );

        // 6 bytes
        assert_eq!(
            hash_key(&[0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
            0x4080_00C0_4084_0404
        );

        // 7 bytes
        assert_eq!(
            hash_key(&[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]),
            0xC040_8000_C444_8404
        );

        // 8 bytes
        assert_eq!(
            hash_key(&[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
            0x00C0_4084_04C4_4488
        );
    }
}
