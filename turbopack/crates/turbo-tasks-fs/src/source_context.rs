use std::{borrow::Cow, cmp::Ordering, fmt::Display};

pub enum SourceContextLine<'a> {
    Context {
        line: usize,
        outside: Cow<'a, str>,
    },
    Start {
        line: usize,
        before: Cow<'a, str>,
        inside: Cow<'a, str>,
    },
    End {
        line: usize,
        inside: Cow<'a, str>,
        after: Cow<'a, str>,
    },
    StartAndEnd {
        line: usize,
        before: Cow<'a, str>,
        inside: Cow<'a, str>,
        after: Cow<'a, str>,
    },
    Inside {
        line: usize,
        inside: Cow<'a, str>,
    },
}

impl Display for SourceContextLine<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SourceContextLine::Context { line, outside } => {
                writeln!(f, "{line:>6} | {outside}")
            }
            SourceContextLine::Start {
                line,
                before,
                inside,
            } => {
                writeln!(
                    f,
                    "       | {}v{}",
                    " ".repeat(before.len()),
                    "-".repeat(inside.len()),
                )?;
                writeln!(f, "{line:>6} + {before}{inside}")
            }
            SourceContextLine::End {
                line,
                inside,
                after,
            } => {
                writeln!(f, "{line:>6} + {inside}{after}")?;
                writeln!(f, "       +{}^", "-".repeat(inside.len()))
            }
            SourceContextLine::StartAndEnd {
                line,
                before,
                inside,
                after,
            } => {
                if inside.len() >= 2 {
                    writeln!(
                        f,
                        "       | {}v{}v",
                        " ".repeat(before.len()),
                        "-".repeat(inside.len() - 2)
                    )?;
                } else {
                    writeln!(f, "       | {}v", " ".repeat(before.len()))?;
                }
                writeln!(f, "{line:>6} + {before}{inside}{after}")?;
                if inside.len() >= 2 {
                    writeln!(
                        f,
                        "       | {}^{}^",
                        " ".repeat(before.len()),
                        "-".repeat(inside.len() - 2),
                    )
                } else {
                    writeln!(f, "       | {}^", " ".repeat(before.len()))
                }
            }
            SourceContextLine::Inside { line, inside } => {
                writeln!(f, "{line:>6} + {inside}")
            }
        }
    }
}

pub struct SourceContextLines<'a>(pub Vec<SourceContextLine<'a>>);

impl Display for SourceContextLines<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for line in &self.0 {
            write!(f, "{}", line)?;
        }
        Ok(())
    }
}

/// Compute the source context for a given range of lines, including selected
/// ranges in these lines. (Lines are 0-indexed)
pub fn get_source_context<'a>(
    lines: impl Iterator<Item = &'a str>,
    start_line: u32,
    start_column: u32,
    end_line: u32,
    end_column: u32,
) -> SourceContextLines<'a> {
    let mut result = Vec::new();
    let context_start = (start_line.saturating_sub(4)) as usize;
    let context_end = (end_line + 4) as usize;
    for (i, l) in lines.enumerate().take(context_end + 1).skip(context_start) {
        let n = i + 1;
        let i = i as u32;
        fn safe_split_at(s: &str, i: u32) -> (&str, &str) {
            let i = i as usize;
            if i < s.len() {
                s.split_at(s.floor_char_boundary(i))
            } else {
                (s, "")
            }
        }
        fn limit_len(s: &str) -> Cow<'_, str> {
            if s.len() < 200 {
                return Cow::Borrowed(s);
            }
            let (a, b) = s.split_at(s.floor_char_boundary(98));
            let (_, c) = b.split_at(b.ceil_char_boundary(b.len() - 99));
            Cow::Owned(format!("{}...{}", a, c))
        }
        match (i.cmp(&start_line), i.cmp(&end_line)) {
            // outside
            (Ordering::Less, _) | (_, Ordering::Greater) => {
                result.push(SourceContextLine::Context {
                    line: n,
                    outside: limit_len(l),
                });
            }
            // start line
            (Ordering::Equal, Ordering::Less) => {
                let (before, inside) = safe_split_at(l, start_column);
                let before = limit_len(before);
                let inside = limit_len(inside);
                result.push(SourceContextLine::Start {
                    line: n,
                    before,
                    inside,
                });
            }
            // start and end line
            (Ordering::Equal, Ordering::Equal) => {
                let real_start = l.floor_char_boundary(start_column as usize) as u32;
                let (before, temp) = safe_split_at(l, real_start);
                let (inside, after) = safe_split_at(temp, end_column - real_start);
                let before = limit_len(before);
                let inside = limit_len(inside);
                let after = limit_len(after);
                result.push(SourceContextLine::StartAndEnd {
                    line: n,
                    before,
                    inside,
                    after,
                });
            }
            // end line
            (Ordering::Greater, Ordering::Equal) => {
                let (inside, after) = safe_split_at(l, end_column);
                let inside = limit_len(inside);
                let after = limit_len(after);
                result.push(SourceContextLine::End {
                    line: n,
                    inside,
                    after,
                });
            }
            // middle line
            (Ordering::Greater, Ordering::Less) => {
                result.push(SourceContextLine::Inside {
                    line: n,
                    inside: limit_len(l),
                });
            }
        }
    }
    SourceContextLines(result)
}
