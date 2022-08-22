use std::{
    cmp::{min, Ordering},
    collections::HashMap,
    fmt::Write as _,
    str::FromStr,
};

use anyhow::{anyhow, Result};
use crossterm::style::{StyledContent, Stylize};
use owo_colors::{OwoColorize as _, Style};
use turbo_tasks::{primitives::BoolVc, ValueToString};
use turbo_tasks_fs::FileLinesContent;
use turbopack_core::issue::{
    CapturedIssuesVc, IssueProcessingPathItem, IssueSeverity, IssueSource,
    OptionIssueProcessingPathItemsVc,
};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct IssueSeverityCliOption(pub IssueSeverity);

impl clap::ValueEnum for IssueSeverityCliOption {
    fn value_variants<'a>() -> &'a [Self] {
        const VARIANTS: [IssueSeverityCliOption; 8] = [
            Self(IssueSeverity::Bug),
            Self(IssueSeverity::Fatal),
            Self(IssueSeverity::Error),
            Self(IssueSeverity::Warning),
            Self(IssueSeverity::Hint),
            Self(IssueSeverity::Note),
            Self(IssueSeverity::Suggestions),
            Self(IssueSeverity::Info),
        ];
        &VARIANTS
    }

    fn to_possible_value<'a>(&self) -> Option<clap::PossibleValue<'a>> {
        Some(clap::PossibleValue::new(self.0.as_str()).help(self.0.as_help_str()))
    }
}

impl FromStr for IssueSeverityCliOption {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        <IssueSeverityCliOption as clap::ValueEnum>::from_str(s, true).map_err(|s| anyhow!("{}", s))
    }
}

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

async fn format_source_content(source: &IssueSource, formatted_issue: &mut String) -> Result<()> {
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
                    writeln!(formatted_issue, "{:>6}   {}", n.dimmed(), l.dimmed())?;
                }
                // start line
                (Ordering::Equal, Ordering::Less) => {
                    let (before, marked) = safe_split_at(l, source.start.column);
                    writeln!(
                        formatted_issue,
                        "{:>6} + {}{}",
                        n,
                        before.dimmed(),
                        marked.bold()
                    )?;
                }
                // start and end line
                (Ordering::Equal, Ordering::Equal) => {
                    let (before, temp) = safe_split_at(l, source.start.column);
                    let (middle, after) = safe_split_at(temp, source.end.column);
                    writeln!(
                        formatted_issue,
                        "{:>6} > {}{}{}",
                        n,
                        before.dimmed(),
                        middle.bold(),
                        after.dimmed()
                    )?;
                }
                // end line
                (Ordering::Greater, Ordering::Equal) => {
                    let (marked, after) = safe_split_at(l, source.end.column);
                    writeln!(
                        formatted_issue,
                        "{:>6} + {}{}",
                        n,
                        marked.bold(),
                        after.dimmed()
                    )?;
                }
                // middle line
                (Ordering::Greater, Ordering::Less) => {
                    writeln!(formatted_issue, "{:>6} | {}", n, l.bold())?
                }
            }
        }
    }
    Ok(())
}

async fn format_optional_path(
    path: &OptionIssueProcessingPathItemsVc,
    formatted_issue: &mut String,
) -> Result<()> {
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
                    writeln!(formatted_issue, " at {}", &*description.await?)?;
                } else {
                    writeln!(
                        formatted_issue,
                        " at {} ({})",
                        context.to_string().await?.bright_blue(),
                        &*description.await?
                    )?;
                    last_context = Some(context);
                }
            } else {
                writeln!(formatted_issue, " at {}", &*description.await?)?;
                last_context = None;
            }
        }
    }
    Ok(())
}

pub type GroupedIssues = HashMap<IssueSeverity, HashMap<String, HashMap<String, Vec<String>>>>;

const DEFAULT_SHOW_COUNT: usize = 3;

const ORDERED_GROUPS: &[IssueSeverity] = &[
    IssueSeverity::Bug,
    IssueSeverity::Fatal,
    IssueSeverity::Error,
    IssueSeverity::Warning,
    IssueSeverity::Hint,
    IssueSeverity::Note,
    IssueSeverity::Suggestions,
    IssueSeverity::Info,
];

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub struct LogOptions {
    pub project_dir: String,
    pub show_all: bool,
    pub log_detail: bool,
    pub log_level: IssueSeverity,
}

#[turbo_tasks::function]
pub async fn group_and_display_issues(
    options: LogOptionsVc,
    issues: CapturedIssuesVc,
) -> Result<BoolVc> {
    let issues = issues.await?;
    let &LogOptions {
        project_dir: ref context,
        show_all,
        log_detail,
        log_level,
    } = &*options.await?;
    let mut grouped_issues: GroupedIssues = HashMap::new();
    let mut has_fatal = false;
    for (issue, path) in issues.iter_with_shortest_path() {
        let severity = &*issue.severity().await?;
        let context_name = issue.context().to_string().await?;
        let category = &*issue.category().await?;
        let title = &*issue.title().await?;
        has_fatal = severity == &IssueSeverity::Fatal;
        let severity_map = grouped_issues
            .entry(*severity)
            .or_insert_with(Default::default);
        let category_map = severity_map
            .entry(category.clone())
            .or_insert_with(Default::default);
        let issues = category_map
            .entry(context_name.clone())
            .or_insert_with(Default::default);
        let mut styled_issue = if let Some(source) = &*issue.source().await? {
            let source = &*source.await?;
            let mut styled_issue = format!(
                "{}:{}:{}  {}",
                context_name
                    .replace("[context directory]", context)
                    .replace("/./", "/"),
                source.start.line + 1,
                source.start.column,
                title.bold()
            );
            if log_detail {
                styled_issue.push('\n');
                format_source_content(source, &mut styled_issue).await?;
            }
            styled_issue
        } else {
            format!("{}", title.bold())
        };
        if log_detail {
            styled_issue.push('\n');
            let description = issue.description().await?;
            if !description.is_empty() {
                for line in description.split('\n') {
                    writeln!(&mut styled_issue, "| {line}")?;
                }
            }
            let documentation_link = issue.documentation_link().await?;
            if !documentation_link.is_empty() {
                writeln!(&mut styled_issue, "\ndocumentation: {documentation_link}")?;
            }
            format_optional_path(&path, &mut styled_issue).await?;
        }
        issues.push(styled_issue);
    }
    for severity in ORDERED_GROUPS.iter().filter(|l| **l <= log_level) {
        if let Some(severity_map) = grouped_issues.get_mut(severity) {
            let severity_map_size = severity_map.len();
            let indent = if severity_map_size == 1 {
                print!("{} ", severity.style(severity_to_style(severity)));
                ""
            } else {
                println!("{}", severity.style(severity_to_style(severity)));
                "  "
            };
            let severity_map_take_count = if show_all {
                severity_map_size
            } else {
                DEFAULT_SHOW_COUNT
            };
            let mut categories = severity_map.keys().cloned().collect::<Vec<_>>();
            categories.sort();
            for category in categories.iter().take(severity_map_take_count) {
                let category_issues = severity_map.get_mut(category).unwrap();
                let category_issues_size = category_issues.len();
                let indent = if category_issues_size == 1 && indent.is_empty() {
                    print!("[{category}] ");
                    "".to_string()
                } else {
                    println!("{indent}[{category}]");
                    format!("{indent}  ")
                };
                let (mut contextes, mut vendor_contextes): (Vec<_>, Vec<_>) = category_issues
                    .iter_mut()
                    .partition(|(context, _)| !context.contains("node_modules"));
                contextes.sort_by_key(|(c, _)| *c);
                if show_all {
                    vendor_contextes.sort_by_key(|(c, _)| *c);
                    contextes.extend(vendor_contextes);
                }
                let category_issues_take_count = if show_all {
                    category_issues_size
                } else {
                    min(contextes.len(), DEFAULT_SHOW_COUNT)
                };
                for (context, issues) in contextes.into_iter().take(category_issues_take_count) {
                    issues.sort();
                    println!("{indent}{}", context.bright_blue());
                    let issues_size = issues.len();
                    let issues_take_count = if show_all {
                        issues_size
                    } else {
                        DEFAULT_SHOW_COUNT
                    };
                    for issue in issues.iter().take(issues_take_count) {
                        let mut i = 0;
                        for line in issue.lines() {
                            println!("{indent}  {line}");
                            i += 1;
                        }
                        if i > 1 {
                            // Spacing after multi line issues
                            println!();
                        }
                    }
                    if issues_size > issues_take_count {
                        println!("{indent}  {}", show_all_message("issues", issues_size));
                    }
                }
                if category_issues_size > category_issues_take_count {
                    println!(
                        "{indent}{}",
                        show_all_message_with_shown_count(
                            "paths",
                            category_issues_size,
                            category_issues_take_count
                        )
                    );
                }
            }
            if severity_map_size > severity_map_take_count {
                println!(
                    "{indent}{}",
                    show_all_message("categories", severity_map_size)
                )
            }
        }
    }
    Ok(BoolVc::cell(has_fatal))
}

fn show_all_message(label: &str, size: usize) -> StyledContent<String> {
    show_all_message_with_shown_count(label, size, DEFAULT_SHOW_COUNT)
}

fn show_all_message_with_shown_count(
    label: &str,
    size: usize,
    shown: usize,
) -> StyledContent<String> {
    if shown == 0 {
        format!(
            "... [{} {label}] are hidden, run with {} to show them",
            size,
            "--show-all".bright_green()
        )
        .bold()
    } else {
        format!(
            "... [{} more {label}] are hidden, run with {} to show all",
            size - shown,
            "--show-all".bright_green()
        )
        .bold()
    }
}
