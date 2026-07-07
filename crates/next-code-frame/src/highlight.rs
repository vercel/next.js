use std::{num::NonZeroUsize, ops::Range, sync::LazyLock};

use phf::phf_set;
use regex::Regex;
use regex_automata::{Input, PatternID, meta::Regex as MetaRegex};
use serde::Deserialize;

/// A styled byte range within a line (non-overlapping, sorted by start)
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct StyleSpan {
    /// Start byte offset relative to line start (0-indexed, inclusive)
    pub start: usize,
    /// End byte offset relative to line start (0-indexed, exclusive)
    pub end: usize,
    /// The token type being styled
    pub token_type: TokenType,
}

/// Token types for syntax highlighting
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum TokenType {
    Keyword,
    Identifier,
    String,
    Number,
    Regex,
    Comment,
}

/// Language hint for keyword highlighting.
///
/// Determines which set of keywords are recognized as `TokenType::Keyword`.
/// Non-keyword tokens (strings, comments, numbers, etc.) are language-agnostic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Language {
    /// JavaScript/TypeScript keywords
    #[default]
    JavaScript,
    /// CSS keywords (currently empty — CSS has no keyword highlighting)
    Css,
}

impl Language {
    /// Returns true if the given identifier is a keyword in this language.
    pub fn is_keyword(self, ident: &str) -> bool {
        match self {
            Language::JavaScript => JS_KEYWORDS.contains(ident),
            Language::Css => false,
        }
    }
}

/// JavaScript/TypeScript keywords (compile-time perfect hash set)
static JS_KEYWORDS: phf::Set<&'static str> = phf_set! {
    "as",
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "interface",
    "let",
    "new",
    "null",
    "of",
    "package",
    "private",
    "protected",
    "public",
    "return",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "type",
    "typeof",
    "undefined",
    "var",
    "void",
    "while",
    "with",
    "yield",
};

pub(crate) const ANSI_CODE_RESET: &str = "\x1b[0m";
pub(crate) const ANSI_CODE_CYAN: &str = "\x1b[36m";
pub(crate) const ANSI_CODE_YELLOW: &str = "\x1b[33m";
pub(crate) const ANSI_CODE_GREEN: &str = "\x1b[32m";
pub(crate) const ANSI_CODE_MAGENTA: &str = "\x1b[35m";
pub(crate) const ANSI_CODE_GRAY: &str = "\x1b[90m";
pub(crate) const ANSI_CODE_RED_BOLD: &str = "\x1b[31m\x1b[1m";
pub(crate) const ANSI_CODE_YELLOW_BOLD: &str = "\x1b[33m\x1b[1m";
pub(crate) const ANSI_CODE_CYAN_BOLD: &str = "\x1b[36m\x1b[1m";

/// ANSI color codes for token types
#[derive(Debug, Clone, Copy)]
pub struct ColorScheme {
    pub reset: &'static str,
    pub keyword: &'static str,
    pub identifier: &'static str,
    pub string: &'static str,
    pub number: &'static str,
    pub regex: &'static str,
    pub comment: &'static str,
    pub gutter: &'static str,
    pub marker: &'static str,
    pub message: &'static str,
}

impl ColorScheme {
    /// Get a color scheme with ANSI colors (matching babel-code-frame)
    pub const fn colored(marker_color: &'static str) -> Self {
        Self {
            reset: ANSI_CODE_RESET,
            keyword: ANSI_CODE_CYAN,
            identifier: ANSI_CODE_YELLOW,
            string: ANSI_CODE_GREEN,
            number: ANSI_CODE_MAGENTA,
            regex: ANSI_CODE_MAGENTA,
            comment: ANSI_CODE_GRAY,
            gutter: ANSI_CODE_GRAY,
            marker: marker_color,
            message: marker_color,
        }
    }

    /// Get a plain color scheme with no ANSI codes (all empty strings)
    pub const fn plain() -> Self {
        Self {
            reset: "",
            keyword: "",
            identifier: "",
            string: "",
            number: "",
            regex: "",
            comment: "",
            gutter: "",
            marker: "",
            message: "",
        }
    }

    /// Get the color for a token type
    pub fn color_for_token(&self, token_type: TokenType) -> &'static str {
        match token_type {
            TokenType::Keyword => self.keyword,
            TokenType::Identifier => self.identifier,
            TokenType::String => self.string,
            TokenType::Number => self.number,
            TokenType::Regex => self.regex,
            TokenType::Comment => self.comment,
        }
    }
}

// ---------------------------------------------------------------------------
// Shared line-boundary helpers
// ---------------------------------------------------------------------------

/// Precomputed line index over a source string.
///
/// Scans for line terminators once on construction, then provides O(1)
/// access to line content and byte ranges without allocating a `Vec<&str>`.
///
/// Recognized line terminators (per ECMA-262 §12.3):
/// - LF (`\n`), CRLF (`\r\n`), standalone CR (`\r`)
/// - U+2028 LINE SEPARATOR, U+2029 PARAGRAPH SEPARATOR
pub(crate) struct Lines<'a> {
    source: &'a str,
    /// Byte offset of the start of each line. `line_starts[0]` corresponds
    /// to the line at absolute index `first_line`.
    line_starts: Vec<usize>,
    /// The 0-indexed absolute line number of `line_starts[0]`.
    first_line: usize,
    /// Total number of lines in the source (always ≥ 1).
    total_lines: usize,
}

impl<'a> Lines<'a> {
    /// Build the full line index by scanning for all line terminators.
    #[cfg(test)]
    pub fn new(source: &'a str) -> Self {
        Self::windowed(source, 0, usize::MAX)
    }

    /// Build a windowed line index. Only stores line-start offsets for
    /// approximately `window_start..window_end` (0-indexed), plus a margin
    /// for the skip-scan heuristic. Stops scanning once the window is
    /// covered — never reads past the end of the window.
    ///
    /// This is much faster than `new()` for large files because it avoids
    /// allocating a Vec entry for every line in the file.
    pub fn windowed(source: &'a str, window_start: usize, window_end: usize) -> Self {
        let bytes = source.as_bytes();

        // Add margin before the window for the skip-scan backscan
        // heuristic (which walks up to MAX_BACKSCAN_LINES backwards).
        let store_start = window_start.saturating_sub(MAX_BACKSCAN_LINES);
        // +1 so byte_bounds works for the last visible line.
        let store_end = window_end.saturating_add(1);

        let mut line_starts = Vec::new();
        let mut line_num: usize = 0;
        // Line 0 always starts at byte 0.
        if store_start == 0 {
            line_starts.push(0);
        }
        line_num += 1;

        for found in memchr::Memchr3::new(b'\n', b'\r', b'\xE2', bytes) {
            let b = bytes[found];
            let line_start = if b == b'\n' {
                found + 1
            } else if b == b'\r' {
                // CRLF: skip the \r and let the \n branch handle it.
                if found + 1 < bytes.len() && bytes[found + 1] == b'\n' {
                    continue;
                }
                // Standalone \r (classic Mac line ending).
                found + 1
            } else {
                // 0xE2 is the leading byte of the 3-byte UTF-8 encoding of
                // U+2028 LINE SEPARATOR (E2 80 A8) and U+2029 PARAGRAPH
                // SEPARATOR (E2 80 A9). UTF-8 forbids overlong encodings,
                // so this exact sequence is the only way these codepoints
                // appear.
                if found + 2 < bytes.len()
                    && bytes[found + 1] == 0x80
                    && (bytes[found + 2] == 0xA8 || bytes[found + 2] == 0xA9)
                {
                    found + 3
                } else {
                    // Not a line separator — just a 0xE2 byte in some
                    // other multi-byte character. Skip it.
                    continue;
                }
            };

            if line_num >= store_end {
                // Past the window — we have enough data.
                return Self {
                    source,
                    line_starts,
                    first_line: store_start,
                    total_lines: line_num + 1,
                };
            }
            if line_num >= store_start {
                line_starts.push(line_start);
            }
            line_num += 1;
        }

        // File ended before or within the window — total is exact.
        Self {
            source,
            line_starts,
            first_line: store_start.min(line_num.saturating_sub(1)),
            total_lines: line_num,
        }
    }

    /// Number of lines (always at least 1).
    pub fn len(&self) -> NonZeroUsize {
        // SAFETY: total_lines is always at least 1.
        NonZeroUsize::new(self.total_lines).unwrap()
    }

    /// The full source string.
    pub fn source(&self) -> &'a str {
        self.source
    }

    /// The raw line-start offsets (for passing to highlight internals).
    /// Index 0 corresponds to absolute line `first_line()`.
    pub fn starts(&self) -> &[usize] {
        &self.line_starts
    }

    /// The absolute 0-indexed line number of `starts()[0]`.
    pub fn first_line(&self) -> usize {
        self.first_line
    }

    /// Get the content of line `idx` (0-indexed absolute), stripping the
    /// trailing line terminator (LF, CRLF, CR, U+2028, or U+2029).
    ///
    /// # Panics
    ///
    /// Panics if `idx` is outside the stored window.
    pub fn content(&self, idx: usize) -> &'a str {
        let (start, end) = self.byte_bounds(idx);
        let line = &self.source[start..end];
        line.strip_suffix("\r\n")
            .or_else(|| line.strip_suffix('\n'))
            .or_else(|| line.strip_suffix('\r'))
            .or_else(|| line.strip_suffix('\u{2028}'))
            .or_else(|| line.strip_suffix('\u{2029}'))
            .unwrap_or(line)
    }

    /// Byte range `[start, end)` for line `idx` (0-indexed absolute,
    /// including the newline terminator).
    pub fn byte_bounds(&self, idx: usize) -> (usize, usize) {
        let local = idx - self.first_line;
        let start = self
            .line_starts
            .get(local)
            .copied()
            .unwrap_or(self.source.len());
        let end = self
            .line_starts
            .get(local + 1)
            .copied()
            .unwrap_or(self.source.len());
        (start, end)
    }
}

/// Look up which line (0-indexed) a byte offset falls on via binary search.
fn lookup_line(line_starts: &[usize], byte_offset: usize) -> usize {
    match line_starts.binary_search(&byte_offset) {
        Ok(idx) => idx,
        Err(idx) => idx.saturating_sub(1),
    }
}

/// Get the byte range [start, end) for a given line index (0-indexed).
fn line_bounds(line_starts: &[usize], source_len: usize, line_idx: usize) -> (usize, usize) {
    let start = line_starts.get(line_idx).copied().unwrap_or(source_len);
    let end = line_starts.get(line_idx + 1).copied().unwrap_or(source_len);
    (start, end)
}

/// Tokenizer state that scans source code and collects syntax-highlight spans.
///
/// The scanner always tokenizes from a given `start_pos` to `scan_end` within
/// the full `source`, but only *emits* spans that overlap with `output_ranges`.
/// This lets callers scan from byte 0 (to maintain correct tokenizer state
/// across multiline comments/strings) while only producing output for the
/// visible window of lines.
struct Scanner<'a> {
    markers: Vec<StyleSpan>,
    line_starts: &'a [usize],
    source: &'a str,
    /// Sorted, non-overlapping byte ranges we're producing highlights for.
    /// Spans outside these ranges are skipped.
    output_ranges: Vec<(usize, usize)>,
    language: Language,
}

impl<'a> Scanner<'a> {
    fn new(
        line_starts: &'a [usize],
        source: &'a str,
        output_ranges: Vec<(usize, usize)>,
        language: Language,
    ) -> Self {
        Self {
            markers: Vec::new(),
            line_starts,
            source,
            output_ranges,
            language,
        }
    }

    /// Returns the end of the last output range, or 0 if empty.
    fn output_end(&self) -> usize {
        self.output_ranges.last().map_or(0, |r| r.1)
    }

    /// Check whether a byte range `[start, end)` overlaps any output range.
    #[inline]
    fn overlaps_output(&self, start: usize, end: usize) -> bool {
        // Ranges are sorted and there are typically ≤6, so linear scan
        // is faster than binary search for the common case.
        for &(rs, re) in &self.output_ranges {
            if rs >= end {
                return false;
            }
            if re > start {
                return true;
            }
        }
        false
    }

    /// Push a style span for a byte range.
    ///
    /// When a token spans multiple lines, it is split into one span per line
    /// so that each line's spans are self-contained. Spans outside
    /// `output_ranges` are skipped.
    fn add_span(&mut self, start: usize, end: usize, token_type: TokenType) {
        if start >= end {
            return;
        }

        if !self.overlaps_output(start, end) {
            return;
        }

        let source_len = self.source.len();
        let start_line = lookup_line(self.line_starts, start);
        let end_line = lookup_line(self.line_starts, end.saturating_sub(1));

        if start_line != end_line {
            // If the token spans lines, split it so each line's spans are self-contained.
            for line_idx in start_line..=end_line {
                let (line_start, line_end) = line_bounds(self.line_starts, source_len, line_idx);
                let span_start = start.max(line_start);
                let span_end = end.min(line_end);
                if span_start < span_end && self.overlaps_output(span_start, span_end) {
                    self.markers.push(StyleSpan {
                        start: span_start,
                        end: span_end,
                        token_type,
                    });
                }
            }
            return;
        }

        self.markers.push(StyleSpan {
            start,
            end,
            token_type,
        });
    }
}

// ---------------------------------------------------------------------------
// Scan-start heuristic
// ---------------------------------------------------------------------------

/// Maximum number of lines to walk back looking for a safe restart point.
/// If we don't find one within this limit, fall back to byte 0.
const MAX_BACKSCAN_LINES: usize = 200;

/// Find a safe byte offset to start the tokenizer scan from, close to
/// `target_line` (0-indexed) and ideally near `visible_start` (the
/// absolute byte offset where the visible window begins). This avoids
/// scanning the entire file from byte 0 when the visible window is in
/// the middle of a large file.
///
/// Two-phase heuristic:
/// 1. **Line-level**: Walk backwards from `target_line` looking for a blank line — a reliable
///    restart point outside strings/comments.
/// 2. **Byte-level**: If `visible_start` is far (>200 bytes) from the line-level result (common for
///    minified files with one huge line), scan backwards from `visible_start` for a `;` statement
///    boundary. This can technically land inside a string containing `;`, but in practice minified
///    code has frequent semicolons between statements and the consequence is at most slightly wrong
///    highlighting.
///
/// Phase 1 is always safe. Phase 2 trades perfect accuracy for
/// dramatically better performance on minified files (~100x).
fn find_scan_start(lines: &Lines<'_>, target_line: usize, visible_start: usize) -> usize {
    let mut result = 0;

    // Phase 1: line-level backscan for a blank line
    if target_line > 0 {
        let first = lines.first_line();
        let search_start = target_line.saturating_sub(MAX_BACKSCAN_LINES).max(first);

        result = 'line: {
            for line_idx in (search_start..target_line).rev() {
                if lines.content(line_idx).trim().is_empty() {
                    let (start, _) = lines.byte_bounds(line_idx);
                    break 'line start;
                }
            }
            if search_start > first {
                0
            } else {
                let (start, _) = lines.byte_bounds(search_start);
                start
            }
        };
    }

    // Phase 2: if the visible window starts far into the line, scan
    // backwards for a `;` which typically marks a statement boundary
    // in minified code.
    const MIN_SKIP_DISTANCE: usize = 200;
    if visible_start > result + MIN_SKIP_DISTANCE {
        let search_from = result;
        let window = &lines.source().as_bytes()[search_from..visible_start];
        if let Some(pos) = window.iter().rposition(|&b| b == b';') {
            result = search_from + pos + 1;
        }
    }

    result
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Extract syntax highlighting markers for source code.
///
/// Uses a language-agnostic byte-scanning tokenizer inspired by the `js-tokens`
/// regex approach. It never fails and produces best-effort highlighting for any
/// input — recognizing quoted strings, comments, numbers, regex literals, and
/// capitalized identifiers.
///
/// # Parameters
/// - `source`: The source code to highlight
/// - `line_range`: Range of line indices (0-indexed, start inclusive, end exclusive). Style markers
///   are only produced for lines within this range. Pass `0..usize::MAX` to produce markers for all
///   lines.
/// - `visible_window`: Optional `(truncation_offset, available_width)` hint. When provided, the
///   scanner's output range is narrowed to only the visible byte window within each line, avoiding
///   tokenization of content that will be truncated away. This dramatically improves performance on
///   minified files with very long lines.
pub fn extract_highlights(
    lines: &Lines<'_>,
    line_range: Range<usize>,
    language: Language,
    visible_window: Option<(usize, usize)>,
) -> Vec<Vec<StyleSpan>> {
    let line_starts = lines.starts();
    let first_line = lines.first_line();
    let source = lines.source();
    let local_count = line_starts.len();

    let local_start = line_range.start - first_line;
    let local_end = line_range.end - first_line;

    // Build per-line visible byte ranges. When a visible_window is
    // provided, each range covers only the truncated portion of the
    // line; otherwise it covers the full line.
    let output_ranges: Vec<(usize, usize)> = (local_start..local_end.min(local_count))
        .filter_map(|local_idx| {
            let ls = line_starts[local_idx];
            let line_end = line_starts
                .get(local_idx + 1)
                .copied()
                .unwrap_or(source.len());
            let (rs, re) = if let Some((trunc_offset, avail_width)) = visible_window {
                (
                    (ls + trunc_offset).min(line_end),
                    (ls + trunc_offset + avail_width).min(line_end),
                )
            } else {
                (ls, line_end)
            };
            if rs < re { Some((rs, re)) } else { None }
        })
        .collect();

    // Find a safe byte offset to start the tokenizer scan from, close to
    // the visible window. Uses line-level and byte-level heuristics.
    let visible_start = output_ranges.first().map_or(0, |r| r.0);
    let scan_start = find_scan_start(lines, line_range.start, visible_start);

    let scan_end = output_ranges.last().map_or(source.len(), |r| r.1);
    let mut scanner = Scanner::new(line_starts, source, output_ranges, language);
    scanner.scan(scan_start, scan_end, None);
    let all_spans = scanner.markers;

    debug_assert!(
        all_spans.windows(2).all(|w| w[0].start <= w[1].start),
        "spans should already be sorted by the left-to-right scan"
    );
    debug_assert!(
        all_spans.windows(2).all(|w| w[0].end <= w[1].start),
        "spans should be non-overlapping"
    );
    group_spans_by_line(&all_spans, line_starts, first_line, source, line_range)
}

// ---------------------------------------------------------------------------
// Tokenizer (language-agnostic, js-tokens style)
// ---------------------------------------------------------------------------

/// Token kinds recognized by the scanner, used for match dispatch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TokenKind {
    String,
    Template,
    LineComment,
    BlockComment,
    Number,
    Ident,
    Close,
    Brace,
    Postfix,
    Slash,
    Op,
}

/// Each entry pairs a `TokenKind` with its regex pattern. Order matters:
/// earlier patterns take priority when multiple can match at the same
/// position (e.g. `//` before `/`). The `PatternID` returned by the
/// multi-pattern regex indexes directly into this array.
const TOKEN_RULES: &[(TokenKind, &str)] = &[
    (
        TokenKind::String,
        r#""(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?"#,
    ),
    // Match only the opening backtick of a template literal. The rest
    // of the template (quasis, expressions, closing backtick) is handled
    // by `scan_template` which manually walks the content, recursing into
    // `scan()` for `${...}` expressions. This avoids the regex trying to
    // match across expression boundaries where backticks in nested
    // templates, comments, or strings would confuse it.
    (TokenKind::Template, r"`"),
    (TokenKind::LineComment, r"//[^\n]*"),
    (TokenKind::BlockComment, r"(?s)/\*.*?\*/"),
    (
        TokenKind::Number,
        r"0[xX][\da-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?",
    ),
    (TokenKind::Ident, r"[A-Za-z_$\x80-\xff][\w$\x80-\xff]*"),
    (TokenKind::Close, r"[)\]]"),
    (TokenKind::Brace, r"[(\[{}]"),
    (TokenKind::Postfix, r"\+\+|--"),
    (TokenKind::Slash, r"/"),
    // Operators / punctuation catch-all for `last_token` tracking
    (TokenKind::Op, r"[=+\-*%<>&|^!~?:;,.]"),
];

impl TokenKind {
    fn from_pattern_id(id: PatternID) -> Self {
        TOKEN_RULES[id.as_usize()].0
    }
}

/// A multi-pattern regex where each pattern corresponds to a `TokenKind`.
/// `regex_automata::meta::Regex::new_many()` returns the `PatternID` directly
/// from a match, avoiding capture-group overhead and linear scanning.
/// Pattern ordering determines match priority (leftmost-first semantics).
static TOKEN_RE: LazyLock<MetaRegex> = LazyLock::new(|| {
    let patterns: Vec<&str> = TOKEN_RULES.iter().map(|(_, p)| *p).collect();
    MetaRegex::new_many(&patterns).expect("token patterns must compile")
});

/// Regex that matches a regex literal starting at the opening `/`.
/// Handles character classes `[...]` (where `/` is literal), escape sequences,
/// and flags. Does not match across newlines (regex literals are single-line).
///
/// Structure: `/` then body then `/` then optional flags:
/// - `[^\\/\[\n\r]` — normal chars (not `\`, `/`, `[`, newline)
/// - `\\.`          — escape sequences
/// - `\[(?:[^\]\\\n\r]|\\.)*\]` — character classes with their own escapes
static REGEX_LITERAL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"/(?:[^\\/\[\n\r]|\\.|\[(?:[^\]\\\n\r]|\\.)*\])+/[A-Za-z]*"#)
        .expect("regex literal regex must compile")
});

impl Scanner<'_> {
    /// Scan a template literal starting at the opening backtick.
    ///
    /// Walks the source byte-by-byte from `tpl_start` (the `` ` ``), emitting
    /// `String` spans for quasi segments and recursively calling `scan()` for
    /// `${...}` expression holes. This correctly handles backticks that appear
    /// inside expressions (in nested templates, strings, or comments) because
    /// the recursive `scan()` call tokenizes the expression content — including
    /// any inner template literals — before we resume scanning the outer
    /// template.
    ///
    /// Returns the byte position just past the closing backtick (or `scan_end`
    /// if the template is unterminated).
    fn scan_template(&mut self, tpl_start: usize, scan_end: usize) -> usize {
        let bytes = self.source.as_bytes();
        let search_start = tpl_start + 1;

        // Track start of current string segment (includes the backtick or
        // closing `}` of the previous expression)
        let mut seg_start = tpl_start;

        // Current position — may jump forward past `${...}` expressions.
        let mut i = search_start;

        // Use a persistent Memchr2 iterator for `` ` `` and `$` over the full
        // template range. This avoids reinitializing the SIMD searcher on each
        // call. When `i` jumps forward (after a `${...}` expression), we skip
        // any stale positions the iterator yields before `i`.
        //
        // Escapes (`\`) are handled by advancing `i` past the escaped byte
        // when a match at `pos` is preceded by an odd number of backslashes.
        let iter = memchr::Memchr2::new(b'`', b'$', &bytes[search_start..scan_end]);
        for found in iter {
            let pos = search_start + found;
            // Skip positions we've already moved past (after expression scan)
            if pos < i {
                continue;
            }

            // Count consecutive preceding backslashes to detect escapes.
            // An odd count means this byte is escaped.
            let mut backslashes = 0;
            while pos > search_start + backslashes && bytes[pos - 1 - backslashes] == b'\\' {
                backslashes += 1;
            }
            if backslashes % 2 != 0 {
                i = pos + 1;
                continue;
            }

            let b = bytes[pos];
            if b == b'`' {
                // Closing backtick — emit the final quasi (including the backtick)
                self.add_span(seg_start, pos + 1, TokenType::String);
                return pos + 1;
            }
            // b == b'$'
            debug_assert_eq!(b, b'$');
            if pos + 1 < scan_end && bytes[pos + 1] == b'{' {
                // End the current quasi segment just before the `${`
                if pos > seg_start {
                    self.add_span(seg_start, pos, TokenType::String);
                }

                // Tokenize the expression with brace_depth=1. The recursive
                // scan handles all tokens inside the expression — including
                // nested template literals, strings with backticks, comments
                // with backticks, etc. It returns the byte position just past
                // the matching `}`.
                let expr_start = pos + 2;
                let expr_end = self.scan(expr_start, scan_end, Some(1));

                // The next quasi segment starts at the closing `}`
                if expr_end > expr_start && bytes.get(expr_end - 1) == Some(&b'}') {
                    seg_start = expr_end - 1;
                } else {
                    // Unclosed expression — no more quasi segments
                    seg_start = expr_end;
                }
                i = expr_end;
                continue;
            }
            // Lone `$` not followed by `{` — skip it
            i = pos + 1;
        }

        // Unterminated template — emit whatever quasi content we have
        if scan_end > seg_start {
            self.add_span(seg_start, scan_end, TokenType::String);
        }
        scan_end
    }

    /// Core tokenizer loop. Scans `source[start_pos..scan_end]` and appends
    /// style markers.
    ///
    /// When `brace_depth` is `Some(n)` we are inside a template expression
    /// `${...}`. The scanner tracks `{` / `}` tokens and returns as soon as
    /// the matching `}` brings the depth back to 0, returning the byte
    /// position just past the `}`. Pass `None` for top-level scanning.
    fn scan(&mut self, start_pos: usize, scan_end: usize, mut brace_depth: Option<u32>) -> usize {
        let mut pos = start_pos;

        // Track the last non-whitespace, non-comment token kind for regex
        // disambiguation. A `/` following a value or close bracket is division;
        // following an operator or at start of input it's a regex.
        let mut last_token = LastToken::None;

        while let Some(m) = TOKEN_RE.search(&Input::new(self.source).range(pos..scan_end)) {
            let start = m.start();
            let raw_end = m.end();

            // Once we're past the last output range, no future tokens can be visible.
            if start >= self.output_end() {
                break;
            }

            // Clamp the match end to scan_end
            let end = raw_end.min(scan_end);

            match TokenKind::from_pattern_id(m.pattern()) {
                TokenKind::String => {
                    self.add_span(start, end, TokenType::String);
                    last_token = LastToken::Value;
                }
                TokenKind::Template => {
                    // The regex only matched the opening backtick. Walk the
                    // full template literal (quasis + expression holes)
                    // manually, recursing into scan() for each ${...}.
                    let tpl_end = self.scan_template(start, scan_end);
                    last_token = LastToken::Value;
                    pos = tpl_end;
                    // we already updated pos so just continue
                    continue;
                }
                TokenKind::LineComment | TokenKind::BlockComment => {
                    self.add_span(start, end, TokenType::Comment);
                    // Comments don't update last_token
                }
                TokenKind::Postfix => {
                    last_token = LastToken::PostfixOp;
                }
                TokenKind::Slash => {
                    if last_token.slash_means_regex()
                        && let Some(re_match) = REGEX_LITERAL_RE.find_at(self.source, start)
                        && re_match.start() == start
                    {
                        let re_end = re_match.end().min(scan_end);
                        self.add_span(start, re_end, TokenType::Regex);
                        last_token = LastToken::Value;
                        pos = re_end;
                        continue;
                    }
                    last_token = LastToken::Operator;
                }
                TokenKind::Close => {
                    last_token = LastToken::CloseBracket;
                }
                TokenKind::Brace => {
                    let ch = self.source.as_bytes()[start];
                    if ch == b'{' {
                        if let Some(ref mut depth) = brace_depth {
                            *depth += 1;
                        }
                    } else if ch == b'}'
                        && let Some(ref mut depth) = brace_depth
                    {
                        // test first to avoid underflow
                        if *depth <= 1 {
                            return end;
                        }
                        *depth -= 1;
                    }
                    last_token = LastToken::Operator;
                }
                TokenKind::Op => {
                    last_token = LastToken::Operator;
                }
                TokenKind::Number => {
                    self.add_span(start, end, TokenType::Number);
                    last_token = LastToken::Value;
                }
                TokenKind::Ident => {
                    let ident = &self.source[start..end];
                    let token_type = if self.language.is_keyword(ident) {
                        Some(TokenType::Keyword)
                    } else if ident.as_bytes()[0].is_ascii_uppercase() {
                        // Highlight capitalized identifiers (matching Babel behavior)
                        Some(TokenType::Identifier)
                    } else {
                        None
                    };
                    if let Some(tt) = token_type {
                        self.add_span(start, end, tt);
                    }
                    last_token = LastToken::Value;
                }
            }

            assert!(
                raw_end > pos,
                "TOKEN_RE produced a zero-width match at byte {pos}"
            );
            pos = raw_end;
        }

        scan_end
    }
}

/// Tracks the kind of the last non-whitespace, non-comment token for regex
/// disambiguation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LastToken {
    /// Start of input
    None,
    /// Identifier, number, string, regex — values that end expressions
    Value,
    /// `)` or `]` — could end an expression
    CloseBracket,
    /// `++` or `--` — postfix operators end expressions
    PostfixOp,
    /// Operators, open brackets, commas, semicolons, `{`, `}` — regex follows
    Operator,
}

impl LastToken {
    /// Returns true if a `/` at this position should be treated as starting a regex literal.
    fn slash_means_regex(self) -> bool {
        match self {
            LastToken::None | LastToken::Operator => true,
            LastToken::Value | LastToken::CloseBracket | LastToken::PostfixOp => false,
        }
    }
}

// ---------------------------------------------------------------------------
// Span → per-line grouping
// ---------------------------------------------------------------------------

/// Group spans by line. O(spans) single pass.
fn group_spans_by_line(
    spans: &[StyleSpan],
    line_starts: &[usize],
    first_line: usize,
    source: &str,
    line_range: Range<usize>,
) -> Vec<Vec<StyleSpan>> {
    if source.is_empty() {
        return Vec::new();
    }

    let line_count = first_line + line_starts.len();

    let start_line_idx = line_range.start.min(line_count);
    let end_line_idx = line_range.end.min(line_count);

    let output_line_count = end_line_idx.saturating_sub(start_line_idx);
    let mut line_highlights = Vec::with_capacity(output_line_count);

    let mut span_idx = 0;

    for line_idx in start_line_idx..end_line_idx {
        let local_idx = line_idx - first_line;
        let (line_start, line_end) = line_bounds(line_starts, source.len(), local_idx);

        let mut line_spans = Vec::new();

        while span_idx < spans.len() {
            let span = &spans[span_idx];

            if span.start >= line_end {
                break;
            }
            debug_assert!(
                span.start >= line_start,
                "span at {} precedes line start {line_start}",
                span.start
            );

            line_spans.push(StyleSpan {
                start: span.start - line_start,
                end: span.end - line_start,
                token_type: span.token_type,
            });

            span_idx += 1;
        }

        line_highlights.push(line_spans);
    }

    line_highlights
}

// ---------------------------------------------------------------------------
// Line rendering with truncation-aware highlighting
// ---------------------------------------------------------------------------

/// Apply syntax highlighting to a (possibly truncated) line of text.
///
/// Iterates the line's `StyleSpan`s, converting from line-relative offsets to
/// display offsets accounting for truncation, and inserts ANSI color codes.
///
/// - `truncation_offset`: byte offset in the original line where visible source content starts
/// - `prefix_len`: byte length of any prefix prepended before source content (e.g., `"..."` = 3)
pub fn apply_line_highlights(
    visible_content: &str,
    spans: &[StyleSpan],
    color_scheme: &ColorScheme,
    truncation_offset: usize,
    prefix_len: usize,
) -> String {
    if spans.is_empty() {
        return visible_content.to_string();
    }

    // The visible source region in original-line coordinates
    let visible_end = truncation_offset + visible_content.len().saturating_sub(prefix_len);

    let mut result = String::with_capacity(visible_content.len() + spans.len() * 10);
    let mut last_offset = 0;

    // Skip spans that end before the visible window
    let start_idx = spans.partition_point(|s| s.end <= truncation_offset);

    for span in &spans[start_idx..] {
        if span.start >= visible_end {
            break;
        }

        // Clamp span to the visible window and convert to display coordinates
        let display_start = (span.start.max(truncation_offset) - truncation_offset + prefix_len)
            .min(visible_content.len());
        let display_end =
            (span.end.min(visible_end) - truncation_offset + prefix_len).min(visible_content.len());

        if display_start < display_end {
            // Emit unstyled text before this span
            if display_start > last_offset {
                result.push_str(&visible_content[last_offset..display_start]);
            }
            // Emit styled span content
            result.push_str(color_scheme.color_for_token(span.token_type));
            result.push_str(&visible_content[display_start..display_end]);
            result.push_str(color_scheme.reset);
            last_offset = display_end;
        }
    }

    // Emit any remaining unstyled text
    if last_offset < visible_content.len() {
        result.push_str(&visible_content[last_offset..]);
    }

    result
}

#[cfg(test)]
pub mod tests {
    use super::*;

    /// Default language for tests
    const JS: Language = Language::JavaScript;

    /// Strip ANSI escape codes from a string
    pub fn strip_ansi_codes(s: &str) -> String {
        let mut result = String::with_capacity(s.len());
        let mut chars = s.chars();

        while let Some(ch) = chars.next() {
            if ch == '\x1b' {
                if chars.next() == Some('[') {
                    for ch in chars.by_ref() {
                        if ch.is_alphabetic() {
                            break;
                        }
                    }
                }
            } else {
                result.push(ch);
            }
        }

        result
    }

    // -----------------------------------------------------------------------
    // Basic highlighting tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_apply_line_highlights_basic() {
        let source = "const Foo = 123";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);
        let color_scheme = ColorScheme::colored(ANSI_CODE_RED_BOLD);

        let result = apply_line_highlights(source, &highlights[0], &color_scheme, 0, 0);

        assert!(result.contains("\x1b["), "Result should contain ANSI codes");
        assert!(result.contains("const"), "Result should contain 'const'");
        assert!(result.contains("Foo"), "Result should contain 'Foo'");
        assert!(result.contains("123"), "Result should contain '123'");
    }

    #[test]
    fn test_apply_line_highlights_plain() {
        let source = "const foo = 123";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);
        let color_scheme = ColorScheme::plain();

        let result = apply_line_highlights(source, &highlights[0], &color_scheme, 0, 0);
        assert_eq!(result, source);
    }

    #[test]
    fn test_only_capitalized_identifiers_highlighted() {
        let source = "const foo = Bar";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);

        let has_identifier = highlights[0]
            .iter()
            .any(|s| s.token_type == TokenType::Identifier);
        assert!(has_identifier, "Capitalized 'Bar' should be highlighted");

        let ident_starts: Vec<usize> = highlights[0]
            .iter()
            .filter(|s| s.token_type == TokenType::Identifier)
            .map(|s| s.start)
            .collect();
        assert_eq!(
            ident_starts,
            vec![12],
            "Only 'Bar' at offset 12 should be highlighted"
        );
    }

    #[test]
    fn test_strip_ansi_codes() {
        let input = "\x1b[36mconst\x1b[0m foo = \x1b[35m123\x1b[0m";
        let result = strip_ansi_codes(input);
        assert_eq!(result, "const foo = 123");
    }

    #[test]
    fn test_apply_line_highlights_with_truncation() {
        let source = "const Foo = 123";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);
        let color_scheme = ColorScheme::colored(ANSI_CODE_RED_BOLD);

        // Truncate to show "Foo = 123" (offset 6, length 9, no prefix)
        let visible = &source[6..];
        let result = apply_line_highlights(visible, &highlights[0], &color_scheme, 6, 0);

        let stripped = strip_ansi_codes(&result);
        assert_eq!(stripped, "Foo = 123");
        assert!(
            result.contains("\x1b["),
            "Should contain ANSI codes for Foo/123"
        );
    }

    #[test]
    fn test_apply_line_highlights_overlapping_truncation() {
        // "hello world" is a string starting at offset 10
        // Truncating at offset 15 lands inside the string ("o world";)
        let source = r#"const x = "hello world";"#;
        let truncation_offset = 15;
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);
        let color_scheme = ColorScheme::colored(ANSI_CODE_RED_BOLD);

        let visible = &source[truncation_offset..];
        let result =
            apply_line_highlights(visible, &highlights[0], &color_scheme, truncation_offset, 0);

        let stripped = strip_ansi_codes(&result);
        assert_eq!(stripped, visible);
        // The visible portion starts inside the string, so it should
        // begin with an ANSI code for the overlapping string style
        assert!(
            result.starts_with("\x1b["),
            "Should start with ANSI code for the overlapping string: {result:?}"
        );
    }

    #[test]
    fn test_comments_and_numbers() {
        let source = "const x = 42; // comment\nobj.foo = 10;";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);

        assert_eq!(highlights.len(), 2);

        let line1_has_comment = highlights[0]
            .iter()
            .any(|m| m.token_type == TokenType::Comment);
        assert!(line1_has_comment, "First line should have comment markers");

        let line1_has_number = highlights[0]
            .iter()
            .any(|m| m.token_type == TokenType::Number);
        let line2_has_number = highlights[1]
            .iter()
            .any(|m| m.token_type == TokenType::Number);
        assert!(line1_has_number);
        assert!(line2_has_number);
    }

    #[test]
    fn test_multiline_comment() {
        let source = "const x = 1;\n/* multi\n   line */\nconst y = 2;";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);

        assert_eq!(highlights.len(), 4);

        let line2_has_comment = highlights[1]
            .iter()
            .any(|m| m.token_type == TokenType::Comment);
        let line3_has_comment = highlights[2]
            .iter()
            .any(|m| m.token_type == TokenType::Comment);

        assert!(line2_has_comment, "Line 2 should have comment marker");
        assert!(line3_has_comment, "Line 3 should have comment marker");
    }

    #[test]
    fn test_multiline_template_literal() {
        let source = "const x = `line1\nline2\nline3`;";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);

        assert_eq!(highlights.len(), 3);

        for (i, highlight) in highlights.iter().enumerate() {
            let has_string = highlight.iter().any(|m| m.token_type == TokenType::String);
            assert!(
                has_string,
                "Line {} should have string markers for the template literal",
                i + 1
            );
        }
    }

    #[test]
    fn test_template_literal_with_expression() {
        // `hello ${name}!` should mark `hello ` and `!` as string,
        // but NOT mark `name` as string.
        let source = "const x = `hello ${name}!`;";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);

        let string_spans: Vec<(usize, usize)> = highlights[0]
            .iter()
            .filter(|s| s.token_type == TokenType::String)
            .map(|s| (s.start, s.end))
            .collect();

        // Should have two string segments: `hello ${ and }!`
        // The `name` between ${ and } should NOT be in any string range
        assert!(
            string_spans.len() >= 2,
            "Should have at least 2 string segments: got {:?}",
            string_spans
        );

        // Verify "name" is NOT inside any string span
        let name_offset = source.find("name").unwrap();
        let name_in_string = highlights[0].iter().any(|s| {
            s.token_type == TokenType::String && s.start <= name_offset && s.end > name_offset
        });
        assert!(
            !name_in_string,
            "'name' should not be marked as part of a string"
        );
    }

    #[test]
    fn test_template_literal_nested() {
        // Nested template literal: `a ${`b ${c}`} d`
        let source = r#"const x = `a ${`b ${c}`} d`;"#;
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);

        // Should not panic and should produce some markers
        assert!(!highlights.is_empty());
        let has_string = highlights[0]
            .iter()
            .any(|m| m.token_type == TokenType::String);
        assert!(has_string, "Should have string markers");
    }

    // -----------------------------------------------------------------------
    // Unbalanced template literal tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_template_unclosed_expression() {
        // `hello ${name` — the `${` is never closed with `}`
        // Should not panic; the string part before `${` should still be marked.
        let source = "const x = `hello ${name";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);
        assert!(!highlights.is_empty(), "Should produce highlights");

        // Should have at least one string marker for the "`hello " part
        let has_string = highlights[0]
            .iter()
            .any(|m| m.token_type == TokenType::String);
        assert!(has_string, "Should still mark the string part before ${{");

        // "name" should NOT be marked as string since it's inside an expression hole
        let name_offset = source.find("name").unwrap();
        let name_in_string = highlights[0].iter().any(|s| {
            s.token_type == TokenType::String && s.start <= name_offset && s.end > name_offset
        });
        assert!(
            !name_in_string,
            "'name' inside unclosed expression should not be a string"
        );
    }

    #[test]
    fn test_template_brace_in_string_inside_expression() {
        // `${ "}" }` — the `}` inside the string should not close the expression
        let source = r#"const x = `${  "}" } end`;"#;
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);
        assert!(!highlights.is_empty());

        // The " end" part after the real closing } should be marked as string
        let end_offset = source.find(" end").unwrap();
        let has_end_string = highlights[0].iter().any(|s| {
            s.token_type == TokenType::String && s.start <= end_offset && s.end > end_offset
        });
        assert!(
            has_end_string,
            "String part after expression should be marked"
        );
    }

    #[test]
    fn test_template_empty_expression() {
        // `hello ${}world` — empty expression hole
        let source = "const x = `hello ${}world`;";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);
        assert!(!highlights.is_empty());

        // Both "hello " and "world" parts should be string-marked
        let string_spans: Vec<usize> = highlights[0]
            .iter()
            .filter(|s| s.token_type == TokenType::String)
            .map(|s| s.start)
            .collect();
        assert!(
            string_spans.len() >= 2,
            "Empty expression should still split into two string segments, got {:?}",
            string_spans
        );
    }

    #[test]
    fn test_template_nested_backtick_in_expression() {
        // `some${`template`}literal` — nested template inside expression
        let source = r#"const x = `some${`template`}literal`;"#;
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);
        assert!(!highlights.is_empty());

        // "literal" should be part of a string span (the outer template quasi)
        let literal_offset = source.rfind("literal").unwrap();
        let literal_is_string = highlights[0].iter().any(|s| {
            s.token_type == TokenType::String && s.start <= literal_offset && s.end > literal_offset
        });
        assert!(
            literal_is_string,
            "'literal' should be marked as string (outer template quasi), spans: {:?}",
            highlights[0]
        );

        // "template" should also be string (inner template literal)
        let template_offset = source.find("template").unwrap();
        let template_is_string = highlights[0].iter().any(|s| {
            s.token_type == TokenType::String
                && s.start <= template_offset
                && s.end > template_offset
        });
        assert!(
            template_is_string,
            "'template' should be marked as string (inner template), spans: {:?}",
            highlights[0]
        );
    }

    #[test]
    fn test_template_block_comment_with_backtick_in_expression() {
        // `some${ /* ` */ ""}literal` — block comment containing backtick inside expression
        let source = r#"const x = `some${ /* ` */ ""}literal`;"#;
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);
        assert!(!highlights.is_empty());

        // The /* ` */ should be a comment, not end the template
        let comment_offset = source.find("/* ` */").unwrap();
        let comment_is_comment = highlights[0].iter().any(|s| {
            s.token_type == TokenType::Comment
                && s.start <= comment_offset
                && s.end > comment_offset
        });
        assert!(
            comment_is_comment,
            "'/* ` */' should be marked as comment, spans: {:?}",
            highlights[0]
        );

        // "literal" should be string (outer template quasi after expression closes)
        let literal_offset = source.rfind("literal").unwrap();
        let literal_is_string = highlights[0].iter().any(|s| {
            s.token_type == TokenType::String && s.start <= literal_offset && s.end > literal_offset
        });
        assert!(
            literal_is_string,
            "'literal' should be marked as string, spans: {:?}",
            highlights[0]
        );
    }

    #[test]
    fn test_template_line_comment_with_backtick_in_expression() {
        // `some${ // `
        // }literal`
        // Line comment containing backtick inside expression
        let source = "const x = `some${ // `\n}literal`;";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);
        assert!(highlights.len() >= 2, "Should have at least 2 lines");

        // The // ` should be a comment on line 1
        let line1 = "const x = `some${ // `";
        let comment_offset = line1.find("// `").unwrap();
        let comment_is_comment = highlights[0].iter().any(|s| {
            s.token_type == TokenType::Comment
                && s.start <= comment_offset
                && s.end > comment_offset
        });
        assert!(
            comment_is_comment,
            "'// `' should be marked as comment, spans: {:?}",
            highlights[0]
        );

        // "literal" on line 2 should be string (outer template quasi)
        // Line 2 is "}literal`;" — "literal" starts at byte 1 (line-relative)
        let line2 = "}literal`;";
        let literal_offset = line2.find("literal").unwrap();
        let literal_is_string = highlights[1].iter().any(|s| {
            s.token_type == TokenType::String && s.start <= literal_offset && s.end > literal_offset
        });
        assert!(
            literal_is_string,
            "'literal' should be marked as string, spans: {:?}",
            highlights[1]
        );
    }

    #[test]
    fn test_template_string_with_backtick_in_expression() {
        // `some${"`"}literal` — string containing backtick inside expression
        let source = r#"const x = `some${"`"}literal`;"#;
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);
        assert!(!highlights.is_empty());

        // The "`" should be a string span
        let inner_str_offset = source.find(r#""`""#).unwrap();
        let inner_is_string = highlights[0].iter().any(|s| {
            s.token_type == TokenType::String
                && s.start <= inner_str_offset
                && s.end > inner_str_offset
        });
        assert!(
            inner_is_string,
            r#"'"`"' should be marked as string, spans: {:?}"#,
            highlights[0]
        );

        // "literal" should be string (outer template quasi)
        let literal_offset = source.rfind("literal").unwrap();
        let literal_is_string = highlights[0].iter().any(|s| {
            s.token_type == TokenType::String && s.start <= literal_offset && s.end > literal_offset
        });
        assert!(
            literal_is_string,
            "'literal' should be marked as string, spans: {:?}",
            highlights[0]
        );
    }

    #[test]
    fn test_line_range_filtering() {
        let source = "const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconst e = 5;";

        let highlights = extract_highlights(&Lines::new(source), 1..4, JS, None);

        assert_eq!(highlights.len(), 3);
        assert!(highlights.iter().all(|h| !h.is_empty()));
    }

    // -----------------------------------------------------------------------
    // Regex literal tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_regex_after_equals() {
        let source = "const re = /foo/gi;";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);

        let has_regex = highlights[0]
            .iter()
            .any(|m| m.token_type == TokenType::Regex);
        assert!(has_regex, "/foo/gi should be highlighted as regex");
    }

    #[test]
    fn test_division_not_regex() {
        // After an identifier, `/` is division not regex
        let source = "const x = a / b / c;";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);

        let has_regex = highlights[0]
            .iter()
            .any(|m| m.token_type == TokenType::Regex);
        assert!(!has_regex, "a / b / c should not have regex markers");
    }

    // -----------------------------------------------------------------------
    // Keyword highlighting tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_js_keywords_highlighted() {
        let source = "const foo = function() { return true; }";
        let highlights = extract_highlights(&Lines::new(source), 0..usize::MAX, JS, None);

        let keyword_starts: Vec<usize> = highlights[0]
            .iter()
            .filter(|s| s.token_type == TokenType::Keyword)
            .map(|s| s.start)
            .collect();

        // "const" at 0..5, "function" at 12..20, "return" at 25..31, "true" at 32..36
        assert!(
            keyword_starts.contains(&0),
            "'const' should start at offset 0"
        );
        assert!(
            keyword_starts.contains(&12),
            "'function' should start at offset 12"
        );
        assert!(
            keyword_starts.contains(&25),
            "'return' should start at offset 25"
        );
        assert!(
            keyword_starts.contains(&32),
            "'true' should start at offset 32"
        );
    }

    #[test]
    fn test_css_no_keywords() {
        let source = "const foo = function() { return true; }";
        let highlights =
            extract_highlights(&Lines::new(source), 0..usize::MAX, Language::Css, None);

        let has_keyword = highlights[0]
            .iter()
            .any(|m| m.token_type == TokenType::Keyword);
        assert!(
            !has_keyword,
            "CSS language should not produce keyword markers"
        );
    }

    // -----------------------------------------------------------------------
    // Scan-start heuristic tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_block_comment_with_blank_line_known_limitation() {
        // Known limitation: when a block comment contains a blank line, the
        // skip-scan heuristic restarts scanning from that blank line, losing
        // track of the opening `/*`. The `*/` closer loses its comment
        // highlighting because the scanner never saw the opener.
        //
        // This is a deliberate tradeoff: blank lines inside block comments
        // that span the visible window boundary are vanishingly rare in
        // practice, and the only consequence is slightly wrong colors —
        // never a crash or missing output.
        let mut source = String::new();
        // Push enough lines so the blank line inside the comment is chosen
        // as the scan start rather than scanning from byte 0.
        for i in 0..20 {
            source.push_str(&format!("const x{i} = {i};\n"));
        }
        source.push_str("/** sneaky\n");
        source.push('\n'); // blank line inside block comment
        source.push_str("*/\n");
        source.push_str("const after = 1;\n");

        let lines = Lines::new(&source);
        // Target the `*/` line — should be Comment but won't be.
        let closer_line_idx = lines.len().get() - 3;

        let highlights = extract_highlights(&lines, closer_line_idx..closer_line_idx + 1, JS, None);
        assert_eq!(highlights.len(), 1);

        // With correct full-file scanning, `*/` would be highlighted as a
        // comment. But the skip-scan heuristic restarts at the blank line
        // inside the comment, so the scanner sees `*/` as stray punctuation.
        let has_comment = highlights[0]
            .iter()
            .any(|m| m.token_type == TokenType::Comment);
        assert!(
            !has_comment,
            "Known limitation: `*/` loses comment highlighting when the skip-scan heuristic \
             starts after the `/*` opener"
        );
    }
}
