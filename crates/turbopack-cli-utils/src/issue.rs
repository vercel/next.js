use std::{cmp::Ordering, fmt::Write as _};

use anyhow::Result;
use owo_colors::{OwoColorize as _, Style};
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbo_tasks_fs::FileLinesContent;
use turbopack_core::issue::{
    IssueProcessingPathItem, IssueSeverity, IssueVc, OptionIssueProcessingPathItemsVc,
};

#[turbo_tasks::function]
pub async fn issue_to_styled_string(
    issue: IssueVc,
    path: OptionIssueProcessingPathItemsVc,
) -> Result<StringVc> {
    let mut str = String::new();
    let context_name = issue.context().to_string().await?;
    if let Some(source) = &*issue.source().await? {
        let source = &*source.await?;
        let source_name = source.asset.path().to_string().await?;
        if *source_name != *context_name {
            writeln!(&mut str, "{}", (*context_name).bright_blue())?;
        }
        writeln!(
            &mut str,
            "{}:{}:{}",
            (*source_name).bright_blue(),
            source.start.line + 1,
            source.start.column
        )?;
        if let FileLinesContent::Lines(lines) = &*source.asset.content().lines().await? {
            let context_start = source.start.line.saturating_sub(4);
            let context_end = source.end.line + 4;
            for (i, l) in lines
                .iter()
                .map(|l| &l.content)
                .enumerate()
                .take(context_end + 1)
                .skip(context_start)
            {
                let n = i + 1;
                fn safe_split_at(s: &str, i: usize) -> (&str, &str) {
                    if i < s.len() {
                        s.split_at(i)
                    } else {
                        (s, "")
                    }
                }
                match (i.cmp(&source.start.line), i.cmp(&source.end.line)) {
                    // outside
                    (Ordering::Less, _) | (_, Ordering::Greater) => {
                        writeln!(&mut str, "{:>7}   {}", n, l.dimmed())?;
                    }
                    // start line
                    (Ordering::Equal, Ordering::Less) => {
                        let (before, marked) = safe_split_at(l, source.start.column);
                        writeln!(&mut str, "{:>7} + {}{}", n, before.dimmed(), marked.bold())?;
                    }
                    // start and end line
                    (Ordering::Equal, Ordering::Equal) => {
                        let (before, temp) = safe_split_at(l, source.start.column);
                        let (middle, after) = safe_split_at(temp, source.end.column);
                        writeln!(
                            &mut str,
                            "{:>7} > {}{}{}",
                            n,
                            before.dimmed(),
                            middle.bold(),
                            after.dimmed()
                        )?;
                    }
                    // end line
                    (Ordering::Greater, Ordering::Equal) => {
                        let (marked, after) = safe_split_at(l, source.end.column);
                        writeln!(&mut str, "{:>7} + {}{}", n, marked.bold(), after.dimmed())?;
                    }
                    // middle line
                    (Ordering::Greater, Ordering::Less) => {
                        writeln!(&mut str, "{:>7} | {}", n, l.bold())?
                    }
                }
            }
        }
    } else {
        writeln!(&mut str, "{}", (*context_name).bright_blue())?;
    }
    let severity = &*issue.severity().await?;
    let title = &*issue.title().await?;
    let category = &*issue.category().await?;
    fn severity_to_style(severity: &IssueSeverity) -> Style {
        match severity {
            IssueSeverity::Bug => Style::new().bright_red().underline(),
            IssueSeverity::Fatal => Style::new().bright_red().underline(),
            IssueSeverity::Error => Style::new().bright_red(),
            IssueSeverity::Warning => Style::new().bright_yellow(),
            IssueSeverity::Hint => Style::new().bold(),
            IssueSeverity::Note => Style::new().bold(),
            IssueSeverity::Suggestions => Style::new().bright_green().underline(),
            IssueSeverity::Info => Style::new().bright_green(),
        }
    }
    writeln!(
        &mut str,
        "{} [{}] {}",
        severity.style(severity_to_style(severity)),
        category,
        title.bold()
    )?;
    let description = issue.description().await?;
    if !description.is_empty() {
        for line in description.split('\n') {
            writeln!(&mut str, "| {line}")?;
        }
    }
    let documentation_link = issue.documentation_link().await?;
    if !documentation_link.is_empty() {
        writeln!(&mut str, "documentation: {documentation_link}")?;
    }
    if let Some(path) = &*path.await? {
        let mut last_context = None;
        for item in path.iter().rev() {
            let IssueProcessingPathItem {
                context,
                description,
            } = &*item.await?;
            if let Some(context) = context {
                let context = context.resolve().await?;
                if last_context == Some(context) {
                    writeln!(&mut str, " at {}", &*description.await?)?;
                } else {
                    writeln!(
                        &mut str,
                        " at {} ({})",
                        context.to_string().await?.bright_blue(),
                        &*description.await?
                    )?;
                    last_context = Some(context);
                }
            } else {
                writeln!(&mut str, " at {}", &*description.await?)?;
                last_context = None;
            }
        }
    }
    Ok(StringVc::cell(str))
}
