use std::{collections::VecDeque, fmt::Write as _};

use difference::{Changeset, Difference};

pub fn print_changeset(changeset: &Changeset) -> String {
    assert!(changeset.split == "\n");
    let mut result = String::from("--- DIFF ---\n- Expected\n+ Actual\n------------\n");
    const CONTEXT_LINES_COUNT: usize = 3;
    let mut context_lines = VecDeque::with_capacity(CONTEXT_LINES_COUNT);
    let mut context_lines_needed = CONTEXT_LINES_COUNT;
    let mut has_spacing = false;
    for diff in changeset.diffs.iter() {
        match diff {
            Difference::Same(content) => {
                let lines = content
                    .rsplit('\n')
                    .take(context_lines_needed)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev();
                for line in lines {
                    if context_lines_needed > 0 {
                        writeln!(result, "  {line}").unwrap();
                        context_lines_needed -= 1;
                    } else {
                        if context_lines.len() == CONTEXT_LINES_COUNT {
                            has_spacing = true;
                            context_lines.pop_front();
                        }
                        context_lines.push_back(line);
                    }
                }
            }
            Difference::Add(line) => {
                if has_spacing {
                    writeln!(result, "...").unwrap();
                    has_spacing = false;
                }
                while let Some(line) = context_lines.pop_front() {
                    writeln!(result, "  {line}").unwrap();
                }
                writeln!(result, "+ {line}").unwrap();
                context_lines_needed = CONTEXT_LINES_COUNT;
            }
            Difference::Rem(line) => {
                if has_spacing {
                    writeln!(result, "...").unwrap();
                    has_spacing = false;
                }
                while let Some(line) = context_lines.pop_front() {
                    writeln!(result, "  {line}").unwrap();
                }
                writeln!(result, "- {line}").unwrap();
                context_lines_needed = CONTEXT_LINES_COUNT;
            }
        }
    }
    result
}
