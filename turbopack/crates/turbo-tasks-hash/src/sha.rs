use sha2::{Digest, Sha256, Sha384, Sha512, digest::typenum::Unsigned};

use crate::{DeterministicHash, DeterministicHasher};

pub struct ShaHasher<D: Digest>(D);

impl<D: Digest> ShaHasher<D>
where
    sha2::digest::Output<D>: core::fmt::LowerHex,
{
    /// Uses the DeterministicHash trait to hash the input in a
    /// cross-platform way.
    pub fn write_value<T: DeterministicHash>(&mut self, input: T) {
        input.deterministic_hash(self);
    }

    /// Uses the DeterministicHash trait to hash the input in a
    /// cross-platform way.
    pub fn write_ref<T: DeterministicHash>(&mut self, input: &T) {
        input.deterministic_hash(self);
    }

    /// Finish the hash computation and return the digest as hex.
    pub fn finish(self) -> String {
        let result = self.0.finalize();
        format!("{:01$x}", result, D::OutputSize::to_usize() * 2)
    }

    /// Finish the hash computation and return the digest as base64.
    pub fn finish_base64(self) -> String {
        let result = self.0.finalize();
        data_encoding::BASE64.encode(result.as_slice())
    }
}

impl<D: Digest> DeterministicHasher for ShaHasher<D> {
    fn finish(&self) -> u64 {
        panic!("use the ShaHasher non-trait function instead");
    }

    fn write_bytes(&mut self, bytes: &[u8]) {
        self.0.update(bytes);
    }
}

impl ShaHasher<Sha256> {
    pub fn new_sha256() -> Self {
        ShaHasher(Sha256::new())
    }
}
impl ShaHasher<Sha384> {
    pub fn new_sha384() -> Self {
        ShaHasher(Sha384::new())
    }
}
impl ShaHasher<Sha512> {
    pub fn new_sha512() -> Self {
        ShaHasher(Sha512::new())
    }
}
