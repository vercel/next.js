use bincode::{Decode, Encode};
use serde::Serialize;
use turbo_tasks_hash::DeterministicHash;

#[turbo_tasks::task_input]
#[derive(
    Default,
    Debug,
    PartialEq,
    Eq,
    Copy,
    Clone,
    Hash,
    PartialOrd,
    Ord,
    Serialize,
    DeterministicHash,
    Encode,
    Decode,
)]
pub struct SourcePos {
    /// The line, 0-indexed.
    pub line: u32,
    /// The column, 0-indexed. When computed by [`SourcePos::update`], this is
    /// counted in UTF-16 code units, as JavaScript source maps expect.
    pub column: u32,
}

impl SourcePos {
    pub fn new(start_line: u32) -> Self {
        Self {
            line: start_line,
            column: 0,
        }
    }

    pub fn max() -> Self {
        Self {
            line: u32::MAX,
            column: u32::MAX,
        }
    }

    /// Increments the line/column position to account for new source code.
    /// Line terminators are the classic "\n", "\r", "\r\n" (which counts as
    /// a single terminator), and JS LINE/PARAGRAPH SEPARATORs.
    ///
    /// See <https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-line-terminators>
    pub fn update(&mut self, code: &[u8]) {
        // Only the line terminators need to be found, which `memchr` does with SIMD. The
        // columns of all but the last line don't matter, so only the final line segment is
        // counted.
        let mut skip_lf_at = None;
        let mut line_start = None;
        for i in memchr::memchr3_iter(b'\n', b'\r', b'\xE2', code) {
            match code[i] {
                b'\n' => {
                    // Count "\r\n" as a single terminator.
                    if skip_lf_at != Some(i) {
                        self.line += 1;
                    }
                    line_start = Some(i + 1);
                }
                b'\r' => {
                    self.line += 1;
                    line_start = Some(i + 1);
                    skip_lf_at = Some(i + 1);
                }
                _ => {
                    // 0xE2 is the leading byte of the UTF-8 encodings of LINE SEPARATOR
                    // (`E2 80 A8`) and PARAGRAPH SEPARATOR (`E2 80 A9`), but also of every other
                    // char in U+2000..=U+2FFF, which are not line terminators.
                    if code.get(i + 1) == Some(&0x80)
                        && code
                            .get(i + 2)
                            .is_some_and(|&b| b & 0b11111110 == 0b10101000)
                    {
                        self.line += 1;
                        line_start = Some(i + 3);
                    }
                }
            }
        }
        match line_start {
            Some(start) => self.column = utf16_len(&code[start..]) as u32,
            None => self.column += utf16_len(code) as u32,
        }
    }
}

/// Counts the UTF-16 code units of UTF-8 encoded text, as JavaScript string lengths and source
/// map columns do.
///
/// Every byte is counted on its own: continuation bytes (`10xxxxxx`) count 0, the leading byte
/// of a 4-byte sequence (a non-BMP char, which UTF-16 encodes as a surrogate pair) counts 2, and
/// all other bytes count 1. This is exact for valid UTF-8 and, as it doesn't decode chars, it is
/// safe for arbitrary bytes and adds up across arbitrary splits of the input.
//
// TODO: Use the SIMD implementation of `simd-utf16-len` once it supports byte slices
// (https://github.com/SyMind/simd-utf16-len/pull/22).
pub(crate) fn utf16_len(bytes: &[u8]) -> usize {
    bytes
        .iter()
        .map(|&b| 1 + (b >= 0xF0) as usize - ((b & 0xC0) == 0x80) as usize)
        .sum()
}

impl std::cmp::PartialEq<(u32, u32)> for SourcePos {
    fn eq(&self, other: &(u32, u32)) -> bool {
        &(self.line, self.column) == other
    }
}

#[cfg(test)]
mod tests {
    use super::{SourcePos, utf16_len};

    fn pos_after(code: &str) -> SourcePos {
        let mut pos = SourcePos::new(0);
        pos.update(code.as_bytes());
        pos
    }

    #[test]
    fn utf16_len_matches_std() {
        for s in [
            "",
            "abc",
            "é€",
            "🦀",
            "x🦀é€😀y\n\r\u{2028}",
            "\u{0}\u{7f}\u{80}\u{7ff}\u{800}\u{ffff}\u{10000}\u{10ffff}",
        ] {
            assert_eq!(utf16_len(s.as_bytes()), s.encode_utf16().count(), "{s:?}");
        }
    }

    #[test]
    fn counts_ascii_as_one_column() {
        assert_eq!(pos_after("abc"), (0, 3));
    }

    #[test]
    fn counts_bmp_chars_as_one_column() {
        // 2-byte (U+00E9) and 3-byte (U+20AC) UTF-8 sequences are a single UTF-16 code unit.
        assert_eq!(pos_after("é"), (0, 1));
        assert_eq!(pos_after("€"), (0, 1));
        assert_eq!(pos_after("aé€b"), (0, 4));
    }

    #[test]
    fn counts_astral_chars_as_two_columns() {
        // 4-byte UTF-8 sequences are a surrogate pair in UTF-16.
        assert_eq!(pos_after("🦀"), (0, 2));
        assert_eq!(pos_after("a🦀b"), (0, 4));
        assert_eq!(pos_after("🦀🦀"), (0, 4));
        let mixed = "x🦀é€😀y";
        assert_eq!(pos_after(mixed), (0, mixed.encode_utf16().count() as u32));
    }

    #[test]
    fn handles_line_terminators() {
        assert_eq!(pos_after("ab\ncd"), (1, 2));
        assert_eq!(pos_after("ab\rcd"), (1, 2));
        // "\r\n" is a single line terminator.
        assert_eq!(pos_after("ab\r\ncd"), (1, 2));
        assert_eq!(pos_after("\r\r\n\n"), (3, 0));
    }

    #[test]
    fn handles_line_and_paragraph_separators() {
        assert_eq!(pos_after("ab\u{2028}c"), (1, 1));
        assert_eq!(pos_after("ab\u{2029}c"), (1, 1));
        // Neighbouring 3-byte chars with the same lead byte are not separators.
        assert_eq!(pos_after("\u{2027}\u{202A}"), (0, 2));
        assert_eq!(pos_after("“a” — …\u{2028}“b”"), (1, 3));
    }

    #[test]
    fn resets_column_after_astral_line() {
        assert_eq!(pos_after("🦀\n🦀a"), (1, 3));
    }

    #[test]
    fn accumulates_across_updates() {
        let mut pos = SourcePos::new(2);
        pos.update("a🦀".as_bytes());
        assert_eq!(pos, (2, 3));
        pos.update("é\nb".as_bytes());
        assert_eq!(pos, (3, 1));
    }
}
