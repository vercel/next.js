/// Encodes an array of bytes as a base16 string.
pub fn encode_base16(input: &[u8]) -> String {
    base16::encode_lower(input)
}
