use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;
use turbo_tasks_hash::DeterministicHash;

/// LINE FEED (LF), one of the basic JS line terminators.
const U16_LF: u16 = 0x0A;
/// CARRIAGE RETURN (CR), one of the basic JS line terminators.
const U16_CR: u16 = 0x0D;
/// LINE SEPARATOR, one of the ES2019 line terminators to make JS a superset of
/// JSON.
const U16_LS: u16 = 0x2028;
/// PARAGRAPH SEPARATOR, one of the ES2019 line terminators to make JS a
/// superset of JSON.
const U16_PS: u16 = 0x2029;

#[derive(
    Default,
    Debug,
    PartialEq,
    Eq,
    Copy,
    Clone,
    TraceRawVcs,
    Serialize,
    Deserialize,
    DeterministicHash,
)]
pub struct SourcePos {
    pub line: usize,
    pub column: usize,
}

impl SourcePos {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn max() -> Self {
        Self {
            line: usize::MAX,
            column: usize::MAX,
        }
    }

    /// Increments the line/column position to account for new source code.
    /// Line terminators are the classic "\n", "\r", "\r\n" (which counts as
    /// a single terminator), and JSON LINE/PARAGRAPH SEPARATORs.
    ///
    /// See https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-line-terminators
    pub fn update(&mut self, code: &str) {
        // JS source text is interpreted as UCS-2, which is basically UTF-16 with less
        // restrictions. We cannot iterate UTF-8 bytes here, 2-byte UTF-8 octets
        // should count as a 1 char and not 2.
        let SourcePos {
            mut line,
            mut column,
        } = self;
        let mut u16_chars = code.encode_utf16().peekable();
        while let Some(c) = u16_chars.next() {
            match c {
                U16_LF | U16_LS | U16_PS => {
                    line += 1;
                    column = 0;
                }
                U16_CR => {
                    // Count "\r\n" as a single terminator.
                    u16_chars.next_if(|&c| c == U16_LF);
                    line += 1;
                    column = 0;
                }
                _ => column += 1,
            }
        }
        self.line = line;
        self.column = column;
    }
}
