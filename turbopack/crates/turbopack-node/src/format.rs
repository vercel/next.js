use std::fmt::Display;

use owo_colors::{OwoColorize, Style};

#[derive(Clone, Copy)]
pub(crate) enum FormattingMode {
    /// No formatting, just print the output
    Plain,
    /// Use ansi colors to format the output
    AnsiColors,
}

impl FormattingMode {
    pub(crate) fn magic_identifier<'a>(&self, content: impl Display + 'a) -> impl Display + 'a {
        match self {
            FormattingMode::Plain => format!("{{{content}}}"),
            FormattingMode::AnsiColors => format!("{{{content}}}").italic().to_string(),
        }
    }

    pub(crate) fn lowlight<'a>(&self, content: impl Display + 'a) -> impl Display + 'a {
        match self {
            FormattingMode::Plain => Style::new(),
            FormattingMode::AnsiColors => Style::new().dimmed(),
        }
        .style(content)
    }

    pub(crate) fn highlight<'a>(&self, content: impl Display + 'a) -> impl Display + 'a {
        match self {
            FormattingMode::Plain => Style::new(),
            FormattingMode::AnsiColors => Style::new().bold().underline(),
        }
        .style(content)
    }
}
