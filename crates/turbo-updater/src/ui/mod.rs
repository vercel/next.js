use console::{measure_text_width, Term};

use crate::UpdateNotifierError;
pub mod utils;

const DEFAULT_PADDING: usize = 8;

pub fn message(text: &str) -> Result<(), UpdateNotifierError> {
    let size = Term::stdout().size_checked();
    let lines: Vec<&str> = text.split('\n').map(|line| line.trim()).collect();

    // get the display width of each line so we can center it within the box later
    let lines_display_width = lines
        .iter()
        .map(|line| measure_text_width(line))
        .collect::<Vec<_>>();

    // find the longest line to determine layout
    let longest_line = lines_display_width
        .iter()
        .max()
        .copied()
        .unwrap_or_default();
    let full_message_width = longest_line + DEFAULT_PADDING;

    // create a curried render function to reduce verbosity when calling
    let render_at_layout = |layout: utils::Layout, width: usize| {
        utils::render_message(
            layout,
            width,
            lines,
            lines_display_width,
            full_message_width,
        )
    };

    // render differently depending on viewport
    if let Some((_, num_cols)) = size {
        // if possible, pad this value slightly
        let term_width = if num_cols > 2 {
            usize::from(num_cols) - 2
        } else {
            num_cols.into()
        };

        let can_fit_box = term_width >= full_message_width;
        let can_center_text = term_width >= longest_line;

        if can_fit_box {
            render_at_layout(utils::Layout::Large, term_width);
        } else if can_center_text {
            render_at_layout(utils::Layout::Medium, term_width);
        } else {
            render_at_layout(utils::Layout::Small, term_width);
        }
    } else {
        render_at_layout(utils::Layout::Unknown, 0);
    }

    Ok(())
}
