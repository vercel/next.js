use std::fmt::{Display, Formatter, Result};

/// Implements [Display] to print the error message in a friendly way.
/// Puts a summary first and details after that.
pub struct PrettyPrintError<'a>(pub &'a anyhow::Error);

impl Display for PrettyPrintError<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        let mut i = 0;
        let mut has_details = false;

        let descriptions = self
            .0
            .chain()
            .map(|cause| cause.to_string())
            .collect::<Vec<_>>();

        for description in &descriptions {
            // see turbo-tasks-memory/src/task.rs for the error message
            let hidden = description.starts_with("Execution of ");
            if !hidden {
                let header =
                    description
                        .split_once('\n')
                        .map_or(description.as_str(), |(header, _)| {
                            has_details = true;
                            header
                        });
                match i {
                    0 => write!(f, "{}", header)?,
                    1 => write!(f, "\n\nCaused by:\n- {}", header)?,
                    _ => write!(f, "\n- {}", header)?,
                }
                i += 1;
            } else {
                has_details = true;
            }
        }
        if has_details {
            write!(f, "\n\nDebug info:")?;
            for description in descriptions {
                f.write_str("\n")?;
                WithDash(&description).fmt(f)?;
            }
        }
        Ok(())
    }
}

/// Indents all lines after the first one. Puts a dash before the first line.
struct WithDash<'a>(&'a str);

impl Display for WithDash<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        let mut lines = self.0.lines();
        if let Some(line) = lines.next() {
            write!(f, "- {}", line)?;
        }
        for line in lines {
            write!(f, "\n  {}", line)?;
        }
        Ok(())
    }
}
