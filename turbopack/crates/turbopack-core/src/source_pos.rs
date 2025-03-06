use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, TaskInput};
use turbo_tasks_hash::DeterministicHash;

/// LINE FEED (LF), one of the basic JS line terminators.
const U8_LF: u8 = 0x0A;
/// CARRIAGE RETURN (CR), one of the basic JS line terminators.
const U8_CR: u8 = 0x0D;

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
    TaskInput,
    TraceRawVcs,
    Serialize,
    Deserialize,
    DeterministicHash,
    NonLocalValue,
)]
pub struct SourcePos {
    /// The line, 0-indexed.
    pub line: u32,
    /// The byte index of the column, 0-indexed.
    pub column: u32,
}

impl SourcePos {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn max() -> Self {
        Self {
            line: u32::MAX,
            column: u32::MAX,
        }
    }

    /// Increments the line/column position to account for new source code.
    /// Line terminators are the classic "\n", "\r", "\r\n" (which counts as
    /// a single terminator), and JSON LINE/PARAGRAPH SEPARATORs.
    ///
    /// See https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-line-terminators
    pub fn update(&mut self, code: &[u8]) {
        // JS source text is interpreted as UCS-2, which is basically UTF-16 with less
        // restrictions. We cannot iterate UTF-8 bytes here, 2-byte UTF-8 octets
        // should count as a 1 char and not 2.
        let SourcePos {
            mut line,
            mut column,
        } = self;

        let mut i = 0;
        while i < code.len() {
            // This is not a UTF-8 validator, but it's likely close enough. It's assumed
            // that the input is valid (and if it isn't than what are you doing trying to
            // embed it into source code anyways?). The important part is that we process in
            // order, and use the first octet's bit pattern to decode the octet length of
            // the char.
            match code[i] {
                U8_LF => {
                    i += 1;
                    line += 1;
                    column = 0;
                }
                U8_CR => {
                    // Count "\r\n" as a single terminator.
                    if code.get(i + 1) == Some(&U8_LF) {
                        i += 2;
                    } else {
                        i += 1;
                    }
                    line += 1;
                    column = 0;
                }

                // 1 octet chars do not have the high bit set. If it's not a LF or CR, then it's
                // just a regular ASCII.
                b if b & 0b10000000 == 0 => {
                    i += 1;
                    column += 1;
                }

                // 2 octet chars have a leading `110` bit pattern. None are considered line
                // terminators.
                b if b & 0b11100000 == 0b11000000 => {
                    // eat this byte and the next.
                    i += 2;
                    column += 1;
                }

                // 3 octet chars have a leading `1110` bit pattern. Both the LINE/PARAGRAPH
                // SEPARATOR exist in 3 octets.
                b if b & 0b11110000 == 0b11100000 => {
                    // The LINE and PARAGRAPH have the bits `11100010 10000000 1010100X`, with the X
                    // denoting either line or paragraph.
                    let mut separator = false;
                    if b == 0b11100010 && code.get(i + 1) == Some(&0b10000000) {
                        let last = code.get(i + 2).cloned().unwrap_or_default();
                        separator = (last & 0b11111110) == 0b10101000
                    }

                    // eat this byte and the next 2.
                    i += 3;
                    if separator {
                        line += 1;
                        column = 0;
                    } else {
                        column += 1;
                    }
                }

                // 4 octet chars have a leading `11110` pattern, but we don't need to check because
                // none of the other patterns matched.
                _ => {
                    // eat this byte and the next 3.
                    i += 4;
                    column += 1;
                }
            }
        }
        self.line = line;
        self.column = column;
    }
}

impl std::cmp::PartialEq<(u32, u32)> for SourcePos {
    fn eq(&self, other: &(u32, u32)) -> bool {
        &(self.line, self.column) == other
    }
}
