/// URL-safe, filesystem-safe alphabet for hash encoding: `0-9 a-z _ - ~ .`
///
/// All 40 characters are RFC 3986 unreserved characters and are safe on
/// case-insensitive filesystems (macOS HFS+/APFS, Windows NTFS).
const BASE40_CHARS: &[u8; 40] = b"0123456789abcdefghijklmnopqrstuvwxyz_-~.";

/// Number of base40 characters needed to represent a 64-bit value without
/// information loss: `ceil(64 / log2(40))` = 13.
pub const BASE40_LEN_64: usize = 13;

/// Number of base40 characters needed to represent a 128-bit value without
/// information loss: `ceil(128 / log2(40))` = 25.
pub const BASE40_LEN_128: usize = 25;

/// Encodes a value into a fixed-width base40 string by repeatedly dividing by
/// 40.
fn encode_base40_fixed<const N: usize>(mut n: u128) -> String {
    let mut buf = [b'0'; N];
    for i in (0..N).rev() {
        buf[i] = BASE40_CHARS[(n % 40) as usize];
        n /= 40;
    }
    // SAFETY: BASE40_CHARS only contains ASCII bytes.
    unsafe { String::from_utf8_unchecked(buf.to_vec()) }
}

/// Encodes a 64-bit unsigned integer into a fixed-width 13-character base40
/// string.
pub fn encode_base40(n: u64) -> String {
    encode_base40_fixed::<BASE40_LEN_64>(n as u128)
}

/// Encodes a 128-bit unsigned integer into a fixed-width 25-character base40
/// string.
pub fn encode_base40_128(n: u128) -> String {
    encode_base40_fixed::<BASE40_LEN_128>(n)
}
