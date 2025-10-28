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

/// Signals the implementor can safely be hashed in a replicatable way across platforms and process
/// runs.
///
/// Note that the default [`std::hash::Hash`] trait used by Rust allows for hashing that differs
/// across process runs, so it is not suitable for filesystem cache with turbo-tasks.
///
/// It's very important that `Vc`s never implement this, since they cannot be deterministic. The
/// value that they wrap, however, can implement the trait.
pub trait DeterministicHash {
    /// Adds `self`'s bytes to the [`DeterministicHasher`]'s state, in a way that is replicatable on
    /// any platform or process run.
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H);
}

/// Signals the implementor can safely hash in a replicatable way across platforms and process runs.
///
/// Note that the default [`std::hash::Hash`] trait used by Rust allows for hashing that differs
/// across process runs, so it is not suitable for filesystem cache with turbo-tasks.
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

impl<T: ?Sized + DeterministicHash> DeterministicHash for &T {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        (**self).deterministic_hash(state);
    }
}

impl DeterministicHash for [u8] {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        state.write_usize(self.len());
        state.write_bytes(self);
    }
}

impl DeterministicHash for String {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        state.write_usize(self.len());
        state.write_bytes(self.as_bytes());
    }
}

impl DeterministicHash for &str {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        state.write_usize(self.len());
        state.write_bytes(self.as_bytes());
    }
}

impl DeterministicHash for bool {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        state.write_u8(*self as u8);
    }
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

impl<T: DeterministicHash> DeterministicHash for Vec<T> {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        state.write_usize(self.len());
        for v in self {
            v.deterministic_hash(state);
        }
    }
}

macro_rules! tuple_impls {
    ( $( $name:ident )+ ) => {
        impl<$($name: DeterministicHash),+> DeterministicHash for ($($name,)+)
        {
            #[allow(non_snake_case)]
            fn deterministic_hash<Hasher: DeterministicHasher>(&self, state: &mut Hasher) {
                let ($(ref $name,)+) = *self;
                $($name.deterministic_hash(state);)+
            }
        }
    };
}

// Implement `DeterministicHash` for all tuples of 1 to 12 elements.
tuple_impls! { A }
tuple_impls! { A B }
tuple_impls! { A B C }
tuple_impls! { A B C D }
tuple_impls! { A B C D E }
tuple_impls! { A B C D E F }
tuple_impls! { A B C D E F G }
tuple_impls! { A B C D E F G H }
tuple_impls! { A B C D E F G H I }
tuple_impls! { A B C D E F G H I J }
tuple_impls! { A B C D E F G H I J K }
tuple_impls! { A B C D E F G H I J K L }

/// HasherWrapper allows the DeterministicHasher to be used as a Hasher, for
/// standard types that do not allow us to directly access their internals.
struct HasherWrapper<'a, D: DeterministicHasher>(&'a mut D);
impl<D: DeterministicHasher> std::hash::Hasher for HasherWrapper<'_, D> {
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
