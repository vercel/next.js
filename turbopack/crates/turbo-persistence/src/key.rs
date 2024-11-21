use std::{
    cmp::min,
    hash::{Hash, Hasher},
};

pub trait KeyBase {
    fn len(&self) -> usize;
    fn hash<H: Hasher>(&self, state: &mut H);
}

impl KeyBase for &'_ [u8] {
    fn len(&self) -> usize {
        <[u8]>::len(self)
    }

    fn hash<H: Hasher>(&self, state: &mut H) {
        for item in *self {
            state.write_u8(*item);
        }
    }
}

impl<const N: usize> KeyBase for [u8; N] {
    fn len(&self) -> usize {
        self[..].len()
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

    fn hash<H: Hasher>(&self, state: &mut H) {
        state.write_u8(*self);
    }
}

impl<A: KeyBase, B: KeyBase> KeyBase for (A, B) {
    fn len(&self) -> usize {
        let (a, b) = self;
        a.len() + b.len()
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

    fn hash<H: Hasher>(&self, state: &mut H) {
        (*self).hash(state)
    }
}

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

pub trait StoreKey: KeyBase + Ord {
    fn write_to(&self, buf: &mut Vec<u8>);
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

pub struct HashKey<'l, K: KeyBase>(pub &'l K);

impl<K: KeyBase> Hash for HashKey<'_, K> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.hash(state);
    }
}

#[cfg(test)]
mod tests {
    use std::{
        cmp::Ordering,
        hash::{BuildHasher, BuildHasherDefault},
    };

    use rustc_hash::FxHasher;

    use crate::{key::HashKey, QueryKey};

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
        type H = BuildHasherDefault<FxHasher>;
        let h = H::default();
        let h1 = h.hash_one(HashKey(&[1, 2, 3, 4]));
        let h2 = h.hash_one(HashKey(&(&[1, 2], &[3, 4])));
        let h3 = h.hash_one(HashKey(&(vec![1, 2, 3], 4u8)));
        assert_eq!(h2, h1);
        assert_eq!(h3, h1);
    }
}
