use std::{io::Error as IOError, string::FromUtf8Error};

use colored::*;
use strip_ansi_escapes::strip as strip_ansi_escapes;
use thiserror::Error as ThisError;

pub enum BorderAlignment {
    Divider,
    Top,
    Bottom,
}

pub enum Layout {
    Unknown,
    Small,
    Medium,
    Large,
}

const TOP_LEFT: &str = "╭";
const TOP_RIGHT: &str = "╮";
const BOTTOM_LEFT: &str = "╰";
const BOTTOM_RIGHT: &str = "╯";
const HORIZONTAL: &str = "─";
const VERTICAL: &str = "│";
const SPACE: &str = " ";

#[derive(ThisError, Debug)]
pub enum GetDisplayLengthError {
    #[error("Could not strip ANSI escape codes from string")]
    StripError(#[from] IOError),
    #[error("Could not convert to string")]
    ConvertError(#[from] FromUtf8Error),
}

pub fn get_display_length(line: &str) -> Result<usize, GetDisplayLengthError> {
    // strip any ansi escape codes (for color)
    let stripped = strip_ansi_escapes(line)?;
    let stripped = String::from_utf8(stripped)?;
    // count the chars instead of the bytes (for unicode)
    return Ok(stripped.chars().count());
}

pub fn x_border(width: usize, position: BorderAlignment) {
    match position {
        BorderAlignment::Top => {
            println!(
                "{}{}{}",
                TOP_LEFT.yellow(),
                HORIZONTAL.repeat(width).yellow(),
                TOP_RIGHT.yellow()
            );
        }
        BorderAlignment::Bottom => {
            println!(
                "{}{}{}",
                BOTTOM_LEFT.yellow(),
                HORIZONTAL.repeat(width).yellow(),
                BOTTOM_RIGHT.yellow()
            );
        }
        BorderAlignment::Divider => {
            println!("{}", HORIZONTAL.repeat(width).yellow(),);
        }
    }
}

pub fn render_message(
    layout: Layout,
    width: usize,
    lines: Vec<&str>,
    lines_display_width: Vec<usize>,
    full_message_width: usize,
) {
    match layout {
        // Left aligned text with no border.
        // Used when term width is unknown.
        Layout::Unknown => {
            for line in lines.iter() {
                println!("{}", line);
            }
        }

        // Left aligned text with top and bottom border.
        // Used when text cannot be centered without wrapping
        Layout::Small => {
            x_border(width, BorderAlignment::Divider);
            for (line, line_display_width) in lines.iter().zip(lines_display_width.iter()) {
                if *line_display_width == 0 {
                    println!("{}", SPACE.repeat(width));
                } else {
                    println!("{}", line);
                }
            }
            x_border(width, BorderAlignment::Divider);
        }

        // Centered text with top and bottom border.
        // Used when text can be centered without wrapping, but
        // there isn't enough room to include the box with padding.
        Layout::Medium => {
            x_border(width, BorderAlignment::Divider);
            for (line, line_display_width) in lines.iter().zip(lines_display_width.iter()) {
                if *line_display_width == 0 {
                    println!("{}", SPACE.repeat(width));
                } else {
                    let line_padding = (width - line_display_width) / 2;
                    // for lines of odd length, tack the reminder to the end
                    let line_padding_remainder = width - (line_padding * 2) - line_display_width;
                    println!(
                        "{}{}{}",
                        SPACE.repeat(line_padding),
                        line,
                        SPACE.repeat(line_padding + line_padding_remainder),
                    );
                }
            }
            x_border(width, BorderAlignment::Divider);
        }

        // Centered text with border on all sides
        Layout::Large => {
            x_border(full_message_width, BorderAlignment::Top);
            for (line, line_display_width) in lines.iter().zip(lines_display_width.iter()) {
                if *line_display_width == 0 {
                    println!(
                        "{}{}{}",
                        VERTICAL.yellow(),
                        SPACE.repeat(full_message_width),
                        VERTICAL.yellow()
                    );
                } else {
                    let line_padding = (full_message_width - line_display_width) / 2;
                    // for lines of odd length, tack the reminder to the end
                    let line_padding_remainder =
                        full_message_width - (line_padding * 2) - line_display_width;
                    println!(
                        "{}{}{}{}{}",
                        VERTICAL.yellow(),
                        SPACE.repeat(line_padding),
                        line,
                        SPACE.repeat(line_padding + line_padding_remainder),
                        VERTICAL.yellow()
                    );
                }
            }
            x_border(full_message_width, BorderAlignment::Bottom);
        }
    }
}
