/// Characters used for base40 encoding: `0-9 a-z _ - ~ .`
///
/// This alphabet is URL-safe (RFC 3986 unreserved characters) and filesystem-safe on all OSes
/// including case-insensitive filesystems (macOS, Windows).
const BASE40_CHARS: &[u8; 40] = b"0123456789abcdefghijklmnopqrstuvwxyz_-~.";

/// Encodes a 64-bit unsigned integer into a fixed-width 13-character base40 string.
pub fn encode_base40(mut n: u64) -> String {
    let mut buf = [b'0'; 13];
    for i in (0..13).rev() {
        buf[i] = BASE40_CHARS[(n % 40) as usize];
        n /= 40;
    }
    // SAFETY: BASE40_CHARS only contains ASCII characters
    unsafe { String::from_utf8_unchecked(buf.to_vec()) }
}

/// Encodes a 128-bit unsigned integer into a fixed-width 25-character base40 string.
pub fn encode_base40_128(mut n: u128) -> String {
    let mut buf = [b'0'; 25];
    for i in (0..25).rev() {
        buf[i] = BASE40_CHARS[(n % 40) as usize];
        n /= 40;
    }
    // SAFETY: BASE40_CHARS only contains ASCII characters
    unsafe { String::from_utf8_unchecked(buf.to_vec()) }
}
