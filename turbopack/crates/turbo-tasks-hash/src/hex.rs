/// Encodes a 64-bit unsigned integer into a hex string.
pub fn encode_hex(n: u64) -> String {
    format!("{:01$x}", n, std::mem::size_of::<u64>() * 2)
}
