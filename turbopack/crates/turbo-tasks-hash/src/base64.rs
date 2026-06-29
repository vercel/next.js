/// Encodes a 64-bit unsigned integer into a base64 string (11 chars, no
/// padding).
///
/// This encoding is used for version identifiers that don't appear in URLs or
/// filenames (e.g. HMR update hashes).
pub fn encode_base64(n: u64) -> String {
    data_encoding::BASE64_NOPAD.encode(&n.to_be_bytes())
}
