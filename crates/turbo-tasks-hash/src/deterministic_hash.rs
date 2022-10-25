use std::mem::Discriminant;

pub use turbo_tasks_macros::DeterministicHash;

macro_rules! deterministic_hash_number {
    ($(($ty:ident, $meth:ident),)*) => {$(
        impl DeterministicHash for $ty {
            fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
                state.$meth(*self);
            }
        }
    )*}
}

macro_rules! impl_write_number {
    ($(($ty:ident, $meth:ident),)*) => {$(
        /// Writes a single `$ty` to this hasher
        #[inline]
        fn $meth(&mut self, i: $ty) {
            // Apple silicon and Intel chips both use little endian, so this should be fast.
            let little_endian = i.to_le_bytes();
            self.write_bytes(&little_endian);
        }
    )*}
}

/// DeterministicHasher is a custom trait that signals the implementor can
/// safely hash in a replicatable way across platforms and process runs. Note
/// that the default Hasher trait used by Rust allows for non-deterministic
/// hashing, so it is not suitable for our purposes.
pub trait DeterministicHasher {
    fn finish(&self) -> u64;
    fn write_bytes(&mut self, bytes: &[u8]);

    /// Writes a single `u8` to this hasher
    #[inline]
    fn write_u8(&mut self, i: u8) {
        self.write_bytes(&[i]);
    }

    /// Writes a single `usize` to this hasher
    #[inline]
    fn write_usize(&mut self, i: usize) {
        // usize can be 4 or 8 bytes, standardize on the larger.
        // As long as the original value is smaller than 4 bytes, the two will hash
        // equivalently.
        self.write_u64(i as u64);
    }

    /// Writes a single `isize` to this hasher
    #[inline]
    fn write_isize(&mut self, i: isize) {
        // isize can be 4 or 8 bytes, standardize on the larger.
        // As long as the original value is smaller than 4 bytes, the two will hash
        // equivalently.
        self.write_i64(i as i64);
    }

    impl_write_number! {
        (u16, write_u16),
        (u32, write_u32),
        (u64, write_u64),
        (i8, write_i8),
        (i16, write_i16),
        (i32, write_i32),
        (i64, write_i64),
        (u128, write_u128),
        (i128, write_i128),
    }
}

/// DeterministicHash is a custom trait that signals the implementor can safely
/// be hashed in a replicatable way across platforms and process runs. Note that
/// the default Hash trait used by Rust is not deterministic for our purposes.
///
/// It's very important that Vcs never implement this, since they cannot be
/// deterministic. The value that they wrap, however, can implement the trait.
pub trait DeterministicHash {
    /// Adds self's bytes to the [Hasher] state, in a way that is replicatable
    /// on any platform or process run.
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H);
}

impl DeterministicHash for String {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        state.write_usize(self.len());
        state.write_bytes(self.as_bytes());
    }
}

deterministic_hash_number! {
    (u8, write_u8),
    (u16, write_u16),
    (u32, write_u32),
    (u64, write_u64),
    (usize, write_usize),
    (i8, write_i8),
    (i16, write_i16),
    (i32, write_i32),
    (i64, write_i64),
    (isize, write_isize),
    (u128, write_u128),
    (i128, write_i128),
}

impl<T: DeterministicHash> DeterministicHash for Option<T> {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        match self {
            None => state.write_u8(0),
            Some(v) => {
                state.write_u8(1);
                v.deterministic_hash(state);
            }
        }
    }
}

/// HasherWrapper allows the DeterministicHasher to be used as a Hasher, for
/// standard types that do not allow us to directly access their internals.
struct HasherWrapper<'a>(&'a mut dyn DeterministicHasher);
impl<'a> std::hash::Hasher for HasherWrapper<'a> {
    fn write(&mut self, bytes: &[u8]) {
        self.0.write_bytes(bytes);
    }

    fn finish(&self) -> u64 {
        unimplemented!();
    }
}

impl<T> DeterministicHash for Discriminant<T> {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        // The Discriminant does not allow us to access its internal state, but does
        // allow us to Hash it.
        let mut wrapper = HasherWrapper(state);
        std::hash::Hash::hash(self, &mut wrapper);
    }
}
