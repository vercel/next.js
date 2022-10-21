use std::{collections::VecDeque, fmt::Write as _};

use difference::{Changeset, Difference};

pub fn print_changeset(changeset: &Changeset) -> String {
    assert!(changeset.split == "\n");
    let mut result = String::from("--- DIFF ---\n- Expected\n+ Actual\n------------\n");
    const CONTEXT_LINES: usize = 3;
    let mut context = VecDeque::new();
    let mut need_context = CONTEXT_LINES;
    let mut has_spacing = false;
    for diff in changeset.diffs.iter() {
        match diff {
            Difference::Same(content) => {
                let lines = content
                    .rsplit('\n')
                    .take(need_context)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev();
                for line in lines {
                    if need_context > 0 {
                        writeln!(result, "  {line}").unwrap();
                        need_context -= 1;
                    } else {
                        if context.len() == CONTEXT_LINES {
                            has_spacing = true;
                            context.pop_front();
                        }
                        context.push_back(line);
                    }
                }
            }
            Difference::Add(line) => {
                if has_spacing {
                    writeln!(result, "...").unwrap();
                    has_spacing = false;
                }
                while let Some(line) = context.pop_front() {
                    writeln!(result, "  {line}").unwrap();
                }
                writeln!(result, "+ {line}").unwrap();
                need_context = CONTEXT_LINES;
            }
            Difference::Rem(line) => {
                if has_spacing {
                    writeln!(result, "...").unwrap();
                    has_spacing = false;
                }
                while let Some(line) = context.pop_front() {
                    writeln!(result, "  {line}").unwrap();
                }
                writeln!(result, "- {line}").unwrap();
                need_context = CONTEXT_LINES;
            }
        }
    }
    result
}
