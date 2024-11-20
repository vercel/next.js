use std::hash::Hash;

pub trait QueryKey: Hash {
    fn cmp(&self, key: &[u8]) -> std::cmp::Ordering;
    fn len(&self) -> usize;
}

impl QueryKey for &'_ [u8] {
    fn cmp(&self, key: &[u8]) -> std::cmp::Ordering {
        Ord::cmp(self, &key)
    }

    fn len(&self) -> usize {
        <[u8]>::len(self)
    }
}

impl<const N: usize> QueryKey for [u8; N] {
    fn cmp(&self, key: &[u8]) -> std::cmp::Ordering {
        Ord::cmp(&self[..], key)
    }

    fn len(&self) -> usize {
        self[..].len()
    }
}

impl QueryKey for Vec<u8> {
    fn cmp(&self, key: &[u8]) -> std::cmp::Ordering {
        Ord::cmp(&**self, key)
    }

    fn len(&self) -> usize {
        self.len()
    }
}

impl<T: QueryKey, const N: usize> QueryKey for [T; N] {
    fn cmp(&self, mut key: &[u8]) -> std::cmp::Ordering {
        for p in self.iter() {
            let len = p.len();
            let key_part = &key[..len];
            match p.cmp(key_part) {
                std::cmp::Ordering::Equal => {
                    key = &key[len..];
                }
                ord => return ord,
            }
        }
        std::cmp::Ordering::Equal
    }

    fn len(&self) -> usize {
        self.iter().map(|p| p.len()).sum()
    }
}

impl<T: QueryKey> QueryKey for &'_ T {
    fn cmp(&self, key: &[u8]) -> std::cmp::Ordering {
        (*self).cmp(key)
    }

    fn len(&self) -> usize {
        (*self).len()
    }
}

pub trait StoreKey: Hash + Ord {
    fn write_to(&self, buf: &mut Vec<u8>);
    fn len(&self) -> usize;
}

impl StoreKey for Vec<u8> {
    fn write_to(&self, buf: &mut Vec<u8>) {
        buf.extend_from_slice(self);
    }

    fn len(&self) -> usize {
        self.len()
    }
}

impl StoreKey for &'_ [u8] {
    fn write_to(&self, buf: &mut Vec<u8>) {
        buf.extend_from_slice(self);
    }

    fn len(&self) -> usize {
        <[u8]>::len(self)
    }
}

impl StoreKey for u8 {
    fn write_to(&self, buf: &mut Vec<u8>) {
        buf.push(*self);
    }

    fn len(&self) -> usize {
        1
    }
}

impl<A: StoreKey, B: StoreKey> StoreKey for (A, B) {
    fn write_to(&self, buf: &mut Vec<u8>) {
        self.0.write_to(buf);
        self.1.write_to(buf);
    }

    fn len(&self) -> usize {
        self.0.len() + self.1.len()
    }
}

impl<T: StoreKey> StoreKey for &'_ T {
    fn write_to(&self, buf: &mut Vec<u8>) {
        (*self).write_to(buf);
    }

    fn len(&self) -> usize {
        (*self).len()
    }
}
