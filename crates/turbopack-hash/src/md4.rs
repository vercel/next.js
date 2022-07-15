use md4::Digest;

/// Hash some content with the MD4 cryptographic hash function.
///
/// Returns a 16-byte hash digest.
pub fn hash_md4(content: &[u8]) -> [u8; 16] {
    let mut hasher = md4::Md4::new();
    hasher.update(content);
    hasher.finalize().into()
}
