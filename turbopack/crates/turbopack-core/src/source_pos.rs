use std::cmp::min;

use bincode::{Decode, Encode};
use serde::Serialize;
use turbo_tasks_hash::DeterministicHash;

/// LINE FEED (LF), one of the basic JS line terminators.
const U8_LF: u8 = 0x0A;
/// CARRIAGE RETURN (CR), one of the basic JS line terminators.
const U8_CR: u8 = 0x0D;
/// The leading byte of the UTF-8 encodings of LINE SEPARATOR (`E2 80 A8`) and PARAGRAPH
/// SEPARATOR (`E2 80 A9`), and of every other char in U+2000..=U+2FFF.
const U8_LS_PS_LEAD: u8 = 0xE2;

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
    /// `code` is treated as complete: a trailing "\r" is not joined with a "\n" passed to a
    /// later call, and a truncated trailing UTF-8 sequence is counted as a whole char. Code
    /// that arrives in multiple chunks needs a scanner that keeps this state between chunks.
    ///
    /// See <https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-line-terminators>
    pub fn update(&mut self, code: &[u8]) {
        let mut scanner = SourcePosScanner::new(*self);
        scanner.update(code);
        *self = scanner.finish();
    }

    /// Advances past `code`. If `after_cr` is set, `code` directly follows a "\r", so a leading
    /// "\n" completes that "\r\n" terminator instead of starting a new line.
    ///
    /// Line terminators split across calls are only recognized with `after_cr`; a LINE or
    /// PARAGRAPH SEPARATOR must be contained in `code`.
    fn advance(&mut self, code: &[u8], after_cr: bool) {
        // Only the line terminators need to be found, which `memchr` does with SIMD. The
        // columns of all but the last line don't matter, so only the final line segment is
        // counted.
        let mut skip_lf_at = after_cr.then_some(0);
        let mut line_start = None;
        for i in memchr::memchr3_iter(U8_LF, U8_CR, U8_LS_PS_LEAD, code) {
            match code[i] {
                U8_LF => {
                    // Count "\r\n" as a single terminator.
                    if skip_lf_at != Some(i) {
                        self.line += 1;
                    }
                    line_start = Some(i + 1);
                }
                U8_CR => {
                    self.line += 1;
                    line_start = Some(i + 1);
                    skip_lf_at = Some(i + 1);
                }
                _ => {
                    // LINE SEPARATOR and PARAGRAPH SEPARATOR are `E2 80 A8` and `E2 80 A9`. Any
                    // other char with this lead byte is not a line terminator.
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

/// Computes a [`SourcePos`] from source code that is provided in multiple chunks (e.g. the
/// buffers of a rope).
///
/// Unlike repeated [`SourcePos::update`] calls, the result does not depend on where the chunk
/// boundaries are: a "\r\n" or a multi-byte UTF-8 sequence split across two chunks is handled
/// the same as if the chunks had been concatenated.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SourcePosScanner {
    pos: SourcePos,
    /// The last scanned byte was a CR, so a directly following LF belongs to the same line
    /// terminator.
    after_cr: bool,
    /// The leading bytes of a multi-byte UTF-8 sequence that was cut off at the end of the
    /// previous chunk.
    partial: [u8; 4],
    /// The number of valid bytes in `partial`. `0` if there is no pending sequence.
    partial_len: u8,
}

impl SourcePosScanner {
    pub(crate) fn new(pos: SourcePos) -> Self {
        Self {
            pos,
            after_cr: false,
            partial: [0; 4],
            partial_len: 0,
        }
    }

    /// The position after all completely scanned chars. A multi-byte UTF-8 sequence that is
    /// still incomplete at the end of the last chunk is not included.
    pub(crate) fn pos(&self) -> SourcePos {
        self.pos
    }

    /// Returns the final position, counting an incomplete trailing UTF-8 sequence (which only
    /// occurs for invalid input) as a whole char.
    pub(crate) fn finish(mut self) -> SourcePos {
        let len = self.partial_len as usize;
        if len > 0 {
            let partial = self.partial;
            self.partial_len = 0;
            self.advance(&partial[..len]);
        }
        self.pos
    }

    /// Advances the position past the next chunk of source code.
    pub(crate) fn update(&mut self, mut code: &[u8]) {
        // First complete a UTF-8 sequence that was split at the end of the previous chunk.
        if self.partial_len > 0 {
            let len = self.partial_len as usize;
            let char_len = utf8_char_len(self.partial[0]);
            let take = min(char_len - len, code.len());
            self.partial[len..len + take].copy_from_slice(&code[..take]);
            code = &code[take..];
            if len + take < char_len {
                self.partial_len = (len + take) as u8;
                return;
            }
            self.partial_len = 0;
            let partial = self.partial;
            self.advance(&partial[..char_len]);
        }

        // Keep a sequence that continues in the next chunk for later, so that the scanned code
        // always ends on a char boundary.
        let (code, rest) = code.split_at(complete_prefix_len(code));
        self.advance(code);
        self.partial[..rest.len()].copy_from_slice(rest);
        self.partial_len = rest.len() as u8;
    }

    fn advance(&mut self, code: &[u8]) {
        if let Some(&last) = code.last() {
            self.pos.advance(code, self.after_cr);
            self.after_cr = last == U8_CR;
        }
    }
}

/// The length of the UTF-8 sequence starting with the octet `b`, decoded from its leading bit
/// pattern. This is not a UTF-8 validator: continuation bytes and invalid octets are treated
/// like the leading octet of a 4-byte sequence.
fn utf8_char_len(b: u8) -> usize {
    if b & 0b10000000 == 0 {
        1
    } else if b & 0b11100000 == 0b11000000 {
        2
    } else if b & 0b11110000 == 0b11100000 {
        3
    } else {
        4
    }
}

/// The length of the longest prefix of `code` that doesn't end inside a multi-byte UTF-8
/// sequence.
fn complete_prefix_len(code: &[u8]) -> usize {
    let len = code.len();
    // A sequence is at most 4 bytes long, so only its leading byte in the last 3 bytes can
    // start a sequence that continues past the end.
    for back in 1..=min(3, len) {
        let b = code[len - back];
        if b & 0b11000000 != 0b10000000 {
            return if utf8_char_len(b) > back {
                len - back
            } else {
                len
            };
        }
    }
    len
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
    use super::{SourcePos, SourcePosScanner, utf16_len};

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

    const CHUNKED_INPUTS: &[&str] = &[
        "abc",
        "aé€b",
        "x🦀é€😀y",
        "a\nb\rc\r\nd",
        "\r\r\n\n\r",
        "ab\u{2028}c\u{2029}d\u{2027}\u{202A}",
        "“a” — …\u{2028}“b”",
        "🦀\r\n€\u{2028}\r",
    ];

    fn scan_chunks<'a>(chunks: impl IntoIterator<Item = &'a [u8]>) -> SourcePos {
        let mut scanner = SourcePosScanner::new(SourcePos::new(0));
        for chunk in chunks {
            scanner.update(chunk);
        }
        let pos = scanner.pos();
        assert_eq!(scanner.finish(), pos, "valid input leaves no pending bytes");
        pos
    }

    #[test]
    fn scanner_matches_whole_input_for_every_split() {
        for input in CHUNKED_INPUTS {
            let expected = pos_after(input);
            let bytes = input.as_bytes();
            assert_eq!(scan_chunks([bytes]), expected, "{input:?}");
            for split in 0..=bytes.len() {
                let (a, b) = bytes.split_at(split);
                assert_eq!(scan_chunks([a, b]), expected, "{input:?} split at {split}");
            }
        }
    }

    #[test]
    fn scanner_matches_whole_input_byte_by_byte() {
        for input in CHUNKED_INPUTS {
            let expected = pos_after(input);
            assert_eq!(
                scan_chunks(input.as_bytes().chunks(1)),
                expected,
                "{input:?}"
            );
        }
    }

    #[test]
    fn scanner_joins_crlf_across_chunks() {
        assert_eq!(scan_chunks([&b"a\r"[..], b"\nb"]), (1, 1));
        // Empty chunks in between don't break the terminator.
        assert_eq!(scan_chunks([&b"a\r"[..], b"", b"\nb"]), (1, 1));
    }

    #[test]
    fn scanner_keeps_partial_char_across_empty_chunks() {
        let crab = "🦀".as_bytes();
        assert_eq!(
            scan_chunks([&crab[..1], b"", &crab[1..3], b"", &crab[3..], b"a"]),
            (0, 3)
        );
    }

    #[test]
    fn scanner_continues_from_start_position() {
        let mut scanner = SourcePosScanner::new(SourcePos { line: 4, column: 7 });
        let bytes = "a🦀\r\nb".as_bytes();
        scanner.update(&bytes[..3]);
        scanner.update(&bytes[3..6]);
        scanner.update(&bytes[6..]);
        assert_eq!(scanner.finish(), (5, 1));
    }

    #[test]
    fn scanner_excludes_incomplete_char_until_finished() {
        let mut scanner = SourcePosScanner::new(SourcePos::new(0));
        scanner.update(&"a🦀".as_bytes()[..3]);
        assert_eq!(scanner.pos(), (0, 1));
        // A truncated sequence at the end of the input still counts as a char.
        assert_eq!(scanner.finish(), (0, 3));
    }
}
