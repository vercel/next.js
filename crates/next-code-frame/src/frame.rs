use std::{fmt::Write, ops::Range};

use anyhow::{Result, bail};
use serde::Deserialize;
use unicode_width::UnicodeWidthChar;

use crate::highlight::{
    ANSI_CODE_CYAN_BOLD, ANSI_CODE_RED_BOLD, ANSI_CODE_YELLOW_BOLD, ColorScheme, Language, Lines,
    apply_line_highlights, extract_highlights,
};

/// Compute the display width of a string slice in terminal columns.
///
/// Uses Unicode UAX #11 East Asian Width to assign widths: most characters are
/// 1 column, CJK ideographs and many emoji are 2 columns. Control characters
/// and zero-width joiners are 0 columns.
fn str_display_width(s: &str) -> usize {
    s.chars().map(|c| c.width().unwrap_or(0)).sum()
}

/// Compute the display width of the text in `line` between two byte offsets
/// (clamped and snapped to char boundaries).
fn display_width_between(line: &str, byte_start: usize, byte_end: usize) -> usize {
    let start = line.len().min(byte_start);
    let start = line.ceil_char_boundary(start);
    let end = line.len().min(byte_end);
    let end = line.floor_char_boundary(end);
    if start >= end {
        return 0;
    }
    str_display_width(&line[start..end])
}

/// A source location with line and column.
///
/// Both `line` and `column` are **1-indexed**. A value of 0 for either is
/// considered a caller bug and will produce an error.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    /// 1-indexed line number.
    pub line: usize,
    /// 1-indexed column as a byte offset into the line. `None` means no
    /// column highlighting — only the line itself is highlighted.
    #[serde(default)]
    pub column: Option<usize>,
}

/// Location information for the error in the source code.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeFrameLocation {
    /// Starting location
    pub start: Location,
    /// Optional ending location (line inclusive, column half-open)
    pub end: Option<Location>,
}

/// The severity of the message (default: "error"), influences the color mode.
#[derive(Debug, Copy, Clone, Deserialize, PartialEq, Eq)]
pub enum CodeFrameColorMode {
    None,
    Error,
    Warning,
    Info,
}

/// Options for rendering the code frame
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CodeFrameOptions {
    /// Number of lines to show before the error
    pub lines_above: usize,
    /// Number of lines to show after the error
    pub lines_below: usize,
    /// Whether to use ANSI color output
    pub color: CodeFrameColorMode,
    /// Whether to attempt syntax highlighting
    pub highlight_code: bool,
    /// Optional message to display with the error
    pub message: Option<String>,
    /// Maximum width for the output in columns. Callers should set this to
    /// the actual display width (e.g., `process.stdout.columns` on the JS
    /// side, or a hard-coded value for browser display).
    pub max_width: usize,
    /// Language hint for keyword highlighting
    #[serde(default)]
    pub language: Language,
}

impl Default for CodeFrameOptions {
    fn default() -> Self {
        Self {
            lines_above: 2,
            lines_below: 3,
            color: CodeFrameColorMode::None,
            highlight_code: false,
            message: None,
            max_width: 100,
            language: Language::default(),
        }
    }
}

/// Result of applying line truncation.
/// All offsets are in byte space.
struct TruncationResult {
    /// The visible content after truncation (may include "..." prefix/suffix)
    visible_content: String,
    /// The byte offset in the original line where visible source content starts
    byte_offset: usize,
    /// The byte length of any prefix prepended before source content (e.g., "..." = 3)
    prefix_len: usize,
}

/// Convert a source-column range (byte offsets) to display coordinates,
/// accounting for line truncation, Unicode display widths, and available width.
///
/// `line_content` is the original (untruncated) line text used to convert byte
/// offsets into display column widths.
///
/// Returns `(display_col, display_length)` where `display_col` is the
/// number of leading spaces before the `^` markers.
fn marker_display_position(
    line_content: &str,
    col_start: usize,
    col_end: usize,
    truncation_offset: usize,
    available_width: usize,
) -> (usize, usize) {
    debug_assert!(
        col_start >= 1,
        "col_start should be 1-indexed, got {col_start}"
    );
    debug_assert!(
        col_start < col_end,
        "col_start ({col_start}) must be less than col_end ({col_end})"
    );

    let line_len = line_content.len();

    // Convert byte offsets to display widths using the line content.
    // col_start/col_end are 1-indexed byte offsets (exclusive end).
    // byte_start_0 is the 0-indexed byte position of the marker start.
    // col_start as an exclusive byte end = the first byte of the marker.
    let byte_start_0 = (col_start - 1).min(line_len);
    let byte_end_0 = (col_end - 1).min(line_len);

    // Width of text between truncation point and marker start
    let display_before_marker =
        display_width_between(line_content, truncation_offset, byte_start_0);
    // Width of the marked span
    let mut display_marker_width = display_width_between(line_content, byte_start_0, byte_end_0);

    // If the end column extends past the line, each overflow position adds 1
    // display column (matching the old byte-arithmetic behavior for the
    // "one past end" caret position).
    if col_end - 1 > line_len {
        display_marker_width += (col_end - 1) - line_len;
    }
    // If start is also past the end, fall back to byte arithmetic
    if col_start > line_len {
        display_marker_width = (col_end - col_start).max(1);
    }

    // Map source column to display column, accounting for "..." prefix
    let display_col = if truncation_offset > 0 {
        if col_start <= truncation_offset {
            ELLIPSIS_DISPLAY_OFFSET
        } else {
            display_before_marker + ELLIPSIS_DISPLAY_OFFSET
        }
    } else {
        // +1 because the marker line starts with a space after the gutter
        display_before_marker + 1
    };

    // Marker length: at least 1 caret, clamped to available width
    let length = display_marker_width
        .max(1)
        .min(available_width.saturating_sub(display_col.saturating_sub(1)));

    (display_col, length)
}

/// Renders a code frame showing the location of an error in source code.
///
/// Returns `Ok(None)` when the location is out of range (e.g., the source is
/// empty or the start line exceeds the number of lines). This lets callers
/// distinguish "no code frame to show" from a genuine rendering error.
pub fn render_code_frame(
    source: &str,
    location: &CodeFrameLocation,
    options: &CodeFrameOptions,
) -> Result<Option<String>> {
    // ── Validate and normalize the location ──────────────────────────────
    //
    // All line/column values are 1-indexed on input. We convert to
    // 0-indexed line indices here and validate that the location is
    // coherent. Invalid or out-of-range locations return `None` rather
    // than erroring — the source may have changed since the error was
    // captured (e.g., a racing file edit).

    // Lines and columns must be >0 (1-indexed). A value of 0 is a caller bug.
    if location.start.line == 0 {
        bail!("start.line must be 1-indexed (got 0)");
    }
    if let Some(0) = location.start.column {
        bail!("start.column must be 1-indexed (got 0)");
    }
    if let Some(end) = location.end {
        if end.line == 0 {
            bail!("end.line must be 1-indexed (got 0)");
        }
        if let Some(0) = end.column {
            bail!("end.column must be 1-indexed (got 0)");
        }
    }

    if source.is_empty() {
        return Ok(None);
    }

    // Convert 1-indexed line to 0-indexed.
    let start_line_idx = location.start.line - 1;

    // Start column (None = no column highlighting, just the line)
    let start_column = location.start.column;

    // Compute a generous end line for the windowed scan. We don't know the
    // total line count yet, but we need an upper bound for the window.
    // Clamp to at least start_line_idx so that degenerate locations
    // (end.line < start.line) don't shrink the window below the start.
    let max_end_line = location
        .end
        .map(|e| (e.line - 1).max(start_line_idx))
        .unwrap_or(start_line_idx);

    // Build a windowed line index that only stores offsets for the visible
    // window (plus margin for the skip-scan heuristic). This avoids the
    // O(file_size) cost of scanning every line in large files.
    let first_line_idx = start_line_idx.saturating_sub(options.lines_above);
    let last_line_idx_upper = max_end_line + options.lines_below + 1;
    let lines = Lines::windowed(source, first_line_idx, last_line_idx_upper);
    let line_count = lines.len().get();

    if start_line_idx >= line_count {
        // Start line is past the end of the file — skew between error and code
        return Ok(None);
    }

    // Normalize end location: clamp to valid range and ensure end >= start.
    // If the end location is before the start (invalid input), fall back to
    // a single-point marker at the start position.
    let (end_line_idx, end_column) = match location.end {
        Some(end) => {
            let end_line = (end.line - 1).min(line_count - 1);
            let end_col = end.column.or(start_column.map(|c| c + 1));

            let end_before_start = end_line < start_line_idx
                || (end_line == start_line_idx
                    && end_col.is_some()
                    && start_column.is_some()
                    && end_col.unwrap() <= start_column.unwrap());

            if end_before_start {
                // End is before start — treat as single-point marker
                (start_line_idx, start_column.map(|c| c + 1))
            } else {
                (end_line, end_col)
            }
        }
        None => (start_line_idx, start_column.map(|c| c + 1)),
    };

    // Calculate window of lines to show (0-indexed, last is exclusive)
    let last_line_idx = (end_line_idx + options.lines_below + 1).min(line_count);

    let gutter_width = last_line_idx.ilog10() as usize + 1;

    let max_width = options.max_width;

    // Format: "> N | code" or "  N | code"
    // That's: 2 (marker + space) + gutter_width + SEPARATOR.len()
    let gutter_total_width = 2 + gutter_width + SEPARATOR.len();
    let available_code_width = max_width.saturating_sub(gutter_total_width);

    // Not enough room to show meaningful code — skip the frame.
    const MIN_CODE_WIDTH: usize = 20;
    if available_code_width < MIN_CODE_WIDTH {
        return Ok(None);
    }

    let truncation_offset = calculate_truncation_offset(
        &lines,
        first_line_idx..last_line_idx,
        start_column.unwrap_or(0),
        end_column.unwrap_or(0),
        available_code_width,
    );

    let line_highlights = if options.color != CodeFrameColorMode::None && options.highlight_code {
        Some(extract_highlights(
            &lines,
            first_line_idx..last_line_idx,
            options.language,
            Some((truncation_offset, available_code_width)),
        ))
    } else {
        None
    };

    let color_scheme = match options.color {
        CodeFrameColorMode::None => ColorScheme::plain(),
        CodeFrameColorMode::Error => ColorScheme::colored(ANSI_CODE_RED_BOLD),
        CodeFrameColorMode::Warning => ColorScheme::colored(ANSI_CODE_YELLOW_BOLD),
        CodeFrameColorMode::Info => ColorScheme::colored(ANSI_CODE_CYAN_BOLD),
    };

    let mut output = String::new();
    // Track whether we need a newline before the next section.
    // By prepending newlines instead of appending them we avoid a
    // trailing newline that callers would have to strip.
    let mut needs_newline = false;

    // Add message if provided and no column specified
    if let Some(ref message) = options.message
        && start_column.is_none()
    {
        output.extend(std::iter::repeat_n(' ', gutter_total_width));
        output.push_str(color_scheme.message);
        output.push_str(message);
        output.push_str(color_scheme.reset);
        needs_newline = true;
    }

    for line_idx in first_line_idx..last_line_idx {
        let line_content = lines.content(line_idx);
        let is_error_line = line_idx >= start_line_idx && line_idx <= end_line_idx;
        let line_num = line_idx + 1;

        // Apply consistent truncation to all lines (all offsets in bytes)
        let truncation = truncate_line(line_content, truncation_offset, available_code_width);

        let visible_content = if let Some(highlight) = line_highlights
            .as_ref()
            .and_then(|h| h.get(line_idx - first_line_idx))
        {
            apply_line_highlights(
                &truncation.visible_content,
                highlight,
                &color_scheme,
                truncation.byte_offset,
                truncation.prefix_len,
            )
        } else {
            truncation.visible_content
        };

        // Separate from previous line/section
        if needs_newline {
            output.push('\n');
        }
        needs_newline = true;

        if is_error_line {
            output.push_str(color_scheme.marker);
            output.push('>');
            output.push_str(color_scheme.reset);
        } else {
            output.push(' ');
        }
        output.push(' ');
        output.push_str(color_scheme.gutter);
        write!(output, "{:>width$} |", line_num, width = gutter_width).unwrap();
        output.push_str(color_scheme.reset);
        if !visible_content.is_empty() {
            output.push(' ');
            output.push_str(&visible_content);
        }

        // Add marker line if this is an error line with column info
        if is_error_line && let Some(start_col) = start_column {
            let end_col = end_column.unwrap_or(start_col + 1);
            let line_len = line_content.len();

            // Determine which columns to underline on this error line
            let (col_start, col_end) = if start_line_idx == end_line_idx {
                (start_col, end_col)
            } else if line_idx == start_line_idx {
                (start_col, line_len)
            } else if line_idx == end_line_idx {
                (1, end_col)
            } else {
                (1, line_len + 1) // intermediate line: underline everything
            };

            // Clamp to line bounds (1-indexed)
            let col_start = col_start.min(line_len + 1);
            let col_end = col_end.min(line_len + 2);

            // project into display space
            let (marker_col, marker_length) = marker_display_position(
                line_content,
                col_start,
                col_end,
                truncation.byte_offset,
                available_code_width,
            );

            output.push_str("\n  ");
            output.push_str(color_scheme.gutter);
            write!(output, "{:>width$} |", "", width = gutter_width).unwrap();

            output.push_str(color_scheme.reset);
            output.extend(std::iter::repeat_n(' ', marker_col));
            output.push_str(color_scheme.marker);
            output.extend(std::iter::repeat_n('^', marker_length));
            output.push_str(color_scheme.reset);

            if line_idx == end_line_idx
                && let Some(ref message) = options.message
            {
                output.push(' ');
                output.push_str(color_scheme.message);
                output.push_str(message);
                output.push_str(color_scheme.reset);
            }
        }
    }

    Ok(Some(output))
}

const ELLIPSIS: &str = "...";
const SEPARATOR: &str = " | ";
/// Display offset for content after an ellipsis prefix
const ELLIPSIS_DISPLAY_OFFSET: usize = ELLIPSIS.len() + 1;

/// Calculate the truncation offset (in bytes) for all lines in the window.
/// This ensures all lines are "scrolled" to the same horizontal position, centering the error
/// range. Column values are byte offsets; width comparisons use display widths.
fn calculate_truncation_offset(
    lines: &Lines<'_>,
    window: Range<usize>,
    start_column: usize,
    end_column: usize,
    available_width: usize,
) -> usize {
    // Check if any line in the window needs truncation (using display width)
    let needs_truncation = window
        .clone()
        .any(|i| str_display_width(lines.content(i)) > available_width);

    // All lines are short enough or we don't have an error column so start at beginning
    if !needs_truncation || start_column == 0 {
        return 0;
    }

    // If we need truncation, center the error range
    // We need to account for the "..." ellipsis (3 chars) on each side
    let available_with_ellipsis = available_width.saturating_sub(2 * ELLIPSIS.len());

    // Calculate the midpoint of the error range
    // end_column is exclusive, so the range is [start_column, end_column)
    let start_0idx = start_column.saturating_sub(1);
    let end_0idx = end_column.saturating_sub(1);
    let error_midpoint = (start_0idx + end_0idx) / 2;

    // Try to center the error range in the window
    let half_width = available_with_ellipsis / 2;

    error_midpoint.saturating_sub(half_width)
}

/// Truncate a line at a specific byte offset, adding ellipsis as needed.
/// The `offset` is snapped forward to the nearest UTF-8 character boundary
/// to avoid splitting multi-byte characters. `max_width` is in display columns.
fn truncate_line(line: &str, offset: usize, max_width: usize) -> TruncationResult {
    // If no offset and line fits, return as-is (using display width)
    if offset == 0 && str_display_width(line) <= max_width {
        return TruncationResult {
            visible_content: line.to_string(),
            byte_offset: 0,
            prefix_len: 0,
        };
    }

    // Snap offset to nearest char boundary (forward)
    let byte_offset = line.ceil_char_boundary(offset);

    let mut result = String::with_capacity(max_width);

    // Add leading ellipsis if we're starting mid-line
    let prefix_len = if byte_offset > 0 {
        result.push_str(ELLIPSIS);
        ELLIPSIS.len()
    } else {
        0
    };

    // Calculate how many display columns are available for content
    let available_content_width = if byte_offset > 0 {
        max_width.saturating_sub(ELLIPSIS.len())
    } else {
        max_width
    };

    // Check if offset is past line length
    let remaining_line = if byte_offset < line.len() {
        &line[byte_offset..]
    } else {
        // Offset is past line length - show just ellipsis
        return TruncationResult {
            visible_content: ELLIPSIS.to_string(),
            byte_offset,
            prefix_len: ELLIPSIS.len(),
        };
    };

    let remaining_display_width = str_display_width(remaining_line);
    let needs_trailing_ellipsis = remaining_display_width > available_content_width;
    let target_width = if needs_trailing_ellipsis {
        available_content_width.saturating_sub(ELLIPSIS.len())
    } else {
        available_content_width
    };

    // Walk characters until we reach the target display width
    let mut cumulative_width = 0;
    let mut visible_end = 0;
    for (i, c) in remaining_line.char_indices() {
        let char_width = c.width().unwrap_or(0);
        if cumulative_width + char_width > target_width {
            break;
        }
        cumulative_width += char_width;
        visible_end = i + c.len_utf8();
    }

    result.push_str(&remaining_line[..visible_end]);

    if needs_trailing_ellipsis {
        result.push_str(ELLIPSIS);
    }

    TruncationResult {
        visible_content: result,
        byte_offset,
        prefix_len,
    }
}
