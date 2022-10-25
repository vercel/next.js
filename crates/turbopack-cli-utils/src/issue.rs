use std::{
    borrow::Cow,
    cmp::{min, Ordering},
    collections::{hash_map::Entry, HashMap, HashSet},
    fmt::Write as _,
    path::PathBuf,
    str::FromStr,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, Result};
use crossterm::style::{StyledContent, Stylize};
use owo_colors::{OwoColorize as _, Style};
use turbo_tasks::{RawVc, TransientValue, TryJoinIterExt, ValueToString};
use turbo_tasks_fs::{
    attach::AttachedFileSystemVc, DiskFileSystemVc, FileLinesContent, FileSystemPathVc,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;
use turbopack_core::issue::{
    IssueProcessingPathItem, IssueSeverity, IssueVc, OptionIssueProcessingPathItemsVc, PlainIssue,
    PlainIssueSource,
};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct IssueSeverityCliOption(pub IssueSeverity);

impl serde::Serialize for IssueSeverityCliOption {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0.to_string())
    }
}

impl<'de> serde::Deserialize<'de> for IssueSeverityCliOption {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        IssueSeverityCliOption::from_str(&s).map_err(serde::de::Error::custom)
    }
}

impl clap::ValueEnum for IssueSeverityCliOption {
    fn value_variants<'a>() -> &'a [Self] {
        const VARIANTS: [IssueSeverityCliOption; 8] = [
            Self(IssueSeverity::Bug),
            Self(IssueSeverity::Fatal),
            Self(IssueSeverity::Error),
            Self(IssueSeverity::Warning),
            Self(IssueSeverity::Hint),
            Self(IssueSeverity::Note),
            Self(IssueSeverity::Suggestion),
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

fn severity_to_style(severity: IssueSeverity) -> Style {
    match severity {
        IssueSeverity::Bug => Style::new().bright_red().underline(),
        IssueSeverity::Fatal => Style::new().bright_red().underline(),
        IssueSeverity::Error => Style::new().bright_red(),
        IssueSeverity::Warning => Style::new().bright_yellow(),
        IssueSeverity::Hint => Style::new().bold(),
        IssueSeverity::Note => Style::new().bold(),
        IssueSeverity::Suggestion => Style::new().bright_green().underline(),
        IssueSeverity::Info => Style::new().bright_green(),
    }
}

fn format_source_content(source: &PlainIssueSource, formatted_issue: &mut String) {
    if let FileLinesContent::Lines(lines) = source.asset.content.lines() {
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
            match (i.cmp(&source.start.line), i.cmp(&source.end.line)) {
                // outside
                (Ordering::Less, _) | (_, Ordering::Greater) => {
                    writeln!(
                        formatted_issue,
                        "{:>6}   {}",
                        n.dimmed(),
                        limit_len(l).dimmed()
                    )
                    .unwrap();
                }
                // start line
                (Ordering::Equal, Ordering::Less) => {
                    let (before, marked) = safe_split_at(l, source.start.column);
                    writeln!(
                        formatted_issue,
                        "{:>6} + {}{}",
                        n,
                        limit_len(before).dimmed(),
                        limit_len(marked).bold()
                    )
                    .unwrap();
                }
                // start and end line
                (Ordering::Equal, Ordering::Equal) => {
                    let real_start = l.floor_char_boundary(source.start.column);
                    let (before, temp) = safe_split_at(l, real_start);
                    let (middle, after) = safe_split_at(temp, source.end.column - real_start);
                    writeln!(
                        formatted_issue,
                        "{:>6} > {}{}{}",
                        n,
                        limit_len(before).dimmed(),
                        limit_len(middle).bold(),
                        limit_len(after).dimmed()
                    )
                    .unwrap();
                }
                // end line
                (Ordering::Greater, Ordering::Equal) => {
                    let (marked, after) = safe_split_at(l, source.end.column);
                    writeln!(
                        formatted_issue,
                        "{:>6} + {}{}",
                        n,
                        limit_len(marked).bold(),
                        limit_len(after).dimmed()
                    )
                    .unwrap();
                }
                // middle line
                (Ordering::Greater, Ordering::Less) => {
                    writeln!(formatted_issue, "{:>6} | {}", n, limit_len(l).bold()).unwrap()
                }
            }
        }
    }
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

pub fn format_issue(
    plain_issue: &PlainIssue,
    path: Option<String>,
    options: &LogOptions,
) -> String {
    let &LogOptions {
        ref current_dir,
        log_detail,
        ..
    } = options;

    let mut issue_text = String::new();

    let severity = plain_issue.severity;
    // TODO CLICKABLE PATHS
    let context_path = plain_issue
        .context
        .replace("[project]", &current_dir.to_string_lossy())
        .replace("/./", "/")
        .replace("\\\\?\\", "");
    let category = &plain_issue.category;
    let title = &plain_issue.title;

    let mut styled_issue = if let Some(source) = &plain_issue.source {
        let mut styled_issue = format!(
            "{}:{}:{}  {}",
            context_path,
            source.start.line + 1,
            source.start.column,
            title.bold()
        );
        styled_issue.push('\n');
        format_source_content(source, &mut styled_issue);
        styled_issue
    } else {
        format!("{}", title.bold())
    };

    let description = &plain_issue.description;
    if !description.is_empty() {
        writeln!(styled_issue, "\n{description}").unwrap();
    }

    if log_detail {
        styled_issue.push('\n');
        let detail = &plain_issue.detail;
        if !detail.is_empty() {
            for line in detail.split('\n') {
                writeln!(styled_issue, "| {line}").unwrap();
            }
        }
        let documentation_link = &plain_issue.documentation_link;
        if !documentation_link.is_empty() {
            writeln!(styled_issue, "\ndocumentation: {documentation_link}").unwrap();
        }
        if let Some(path) = path {
            writeln!(styled_issue, "{}", path).unwrap();
        }
    }

    write!(
        issue_text,
        "{} - [{}] {}",
        severity.style(severity_to_style(severity)),
        category,
        plain_issue.context
    )
    .unwrap();

    for line in styled_issue.lines() {
        writeln!(issue_text, "  {line}").unwrap();
    }

    issue_text
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
    IssueSeverity::Suggestion,
    IssueSeverity::Info,
];

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub struct LogOptions {
    pub current_dir: PathBuf,
    pub show_all: bool,
    pub log_detail: bool,
    pub log_level: IssueSeverity,
}

/// Tracks the state of currently seen issues.
///
/// An issue is considered seen as long as a single source has pulled the issue.
/// When a source repulls emitted issues due to a recomputation somewhere in its
/// graph, there are a few possibilities:
///
/// 1. An issue from this pull is brand new to all sources, in which case it
/// will be logged and the issue's count is inremented.
/// 2. An issue from this pull is brand new to this source but another source
/// has already pulled it, in which case it will be logged and the issue's count
/// is incremented.
/// 3. The previous pull from this source had already seen the issue, in which
/// case the issue will be skipped and the issue's count remains constant.
/// 4. An issue seen in a previous pull was not repulled, and the issue's
/// count is decremented.
///
/// Once an issue's count reaches zero, it's removed. If it is ever seen again,
/// it is considered new and will be relogged.
#[derive(Default)]
struct SeenIssues {
    /// Keeps track of all issue pulled from the source. Used so that we can
    /// decrement issues that are not pulled in the current synchronization.
    source_to_issue_ids: HashMap<RawVc, HashSet<u64>>,

    /// Counts the number of times a particular issue is seen across all
    /// sources. As long as the count is positive, an issue is considered
    /// "seen" and will not be relogged. Once the count reaches zero, the
    /// issue is removed and the next time its seen it will be considered new.
    issues_count: HashMap<u64, usize>,
}

impl SeenIssues {
    fn new() -> Self {
        Default::default()
    }

    /// Synchronizes state between the issues previously pulled from this
    /// source, to the issues now pulled.
    fn new_ids(&mut self, source: RawVc, issue_ids: HashSet<u64>) -> HashSet<u64> {
        let old = self.source_to_issue_ids.entry(source).or_default();

        // difference is the issues that were never counted before.
        let difference = issue_ids
            .iter()
            .filter(|id| match self.issues_count.entry(**id) {
                Entry::Vacant(e) => {
                    // If the issue not currently counted, then it's new and should be logged.
                    e.insert(1);
                    true
                }
                Entry::Occupied(mut e) => {
                    if old.contains(*id) {
                        // If old contains the id, then we don't need to change the count, but we
                        // do need to remove the entry. Doing so allows us to iterate the final old
                        // state and decrement old issues.
                        old.remove(*id);
                    } else {
                        // If old didn't contain the entry, then this issue was already counted
                        // from a difference source.
                        *e.get_mut() += 1;
                    }
                    false
                }
            })
            .cloned()
            .collect::<HashSet<_>>();

        // Old now contains only the ids that were not present in the new issue_ids.
        for id in old.iter() {
            match self.issues_count.entry(*id) {
                Entry::Vacant(_) => unreachable!("issue must already be tracked to appear in old"),
                Entry::Occupied(mut e) => {
                    let v = e.get_mut();
                    if *v == 1 {
                        // If this was the last counter of the issue, then we need to prune the
                        // value to free memory.
                        e.remove();
                    } else {
                        // Another source counted the issue, and it must not be relogged until all
                        // sources remove it.
                        *v -= 1;
                    }
                }
            }
        }

        *old = issue_ids;
        difference
    }
}

/// Logs emitted issues to console logs, deduplicating issues between peeks of
/// the collected issues. The ConsoleUi can be shared and capture issues from
/// multiple sources, with deduplication operating across all issues.
#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
#[derive(Clone)]
pub struct ConsoleUi {
    options: LogOptions,

    #[turbo_tasks(trace_ignore, debug_ignore)]
    seen: Arc<Mutex<SeenIssues>>,
}

impl PartialEq for ConsoleUi {
    fn eq(&self, other: &Self) -> bool {
        self.options == other.options
    }
}

impl ConsoleUi {
    pub fn new(options: LogOptions) -> Self {
        ConsoleUi {
            options,
            seen: Arc::new(Mutex::new(SeenIssues::new())),
        }
    }
}

#[turbo_tasks::value(transparent)]
pub struct DisplayIssueState {
    pub has_fatal: bool,
    pub has_issues: bool,
    pub has_new_issues: bool,
}

#[turbo_tasks::value(transparent)]
pub struct IssueHash(u64);

/// We need deduplicate issues that can come from unique paths, but represent
/// the same underlying problem. Eg, a parse error for a file that is compiled
/// in both client and server contexts.
#[turbo_tasks::function]
async fn internal_hash(issue: IssueVc) -> Result<IssueHashVc> {
    let mut hasher = Xxh3Hash64Hasher::new();
    hasher.write_value(issue.severity().await?);
    hasher.write_ref(&issue.context().await?.path);
    hasher.write_value(issue.category().await?);
    hasher.write_value(issue.title().await?);
    hasher.write_value(issue.description().await?);
    hasher.write_value(issue.detail().await?);
    hasher.write_value(issue.documentation_link().await?);

    let source = issue.source().await?;
    if let Some(source) = &*source {
        let source = source.await?;
        // I'm assuming we don't need to hash the contents. Not 100% correct, but
        // probably 99%.
        hasher.write_value(source.start);
        hasher.write_value(source.end);
    }
    Ok(IssueHash(hasher.finish()).cell())
}

#[turbo_tasks::value_impl]
impl ConsoleUiVc {
    #[turbo_tasks::function]
    pub async fn group_and_display_issues(
        self,
        source: TransientValue<RawVc>,
    ) -> Result<DisplayIssueStateVc> {
        let source = source.into_value();
        let this = self.await?;

        let issues = IssueVc::peek_issues_with_path(source).await?;
        let issues = issues.await?;
        let &LogOptions {
            ref current_dir,
            show_all,
            log_detail,
            log_level,
            ..
        } = &this.options;
        let mut grouped_issues: GroupedIssues = HashMap::new();

        let issues = issues
            .iter_with_shortest_path()
            .map(async move |(issue, path)| {
                let id = internal_hash(issue).await?;
                Ok((issue, path, *id))
            })
            .try_join()
            .await?;

        let issue_ids = issues.iter().map(|(_, _, id)| *id).collect::<HashSet<_>>();
        let mut new_ids = this.seen.lock().unwrap().new_ids(source, issue_ids);

        let mut has_fatal = false;
        let has_issues = !issues.is_empty();
        let has_new_issues = !new_ids.is_empty();

        for (issue, path, id) in issues {
            if !new_ids.remove(&id) {
                continue;
            }

            let plain_issue = issue.into_plain().await?;

            let severity = plain_issue.severity;
            let context_path = make_relative_to_cwd(issue.context(), current_dir).await?;
            let category = &plain_issue.category;
            let title = &plain_issue.title;
            has_fatal = severity == IssueSeverity::Fatal;
            let severity_map = grouped_issues
                .entry(severity)
                .or_insert_with(Default::default);
            let category_map = severity_map
                .entry(category.clone())
                .or_insert_with(Default::default);
            let issues = category_map
                .entry(context_path.clone())
                .or_insert_with(Default::default);

            let mut styled_issue = if let Some(source) = &plain_issue.source {
                let mut styled_issue = format!(
                    "{}:{}:{}  {}",
                    context_path,
                    source.start.line + 1,
                    source.start.column,
                    title.bold()
                );
                styled_issue.push('\n');
                format_source_content(source, &mut styled_issue);
                styled_issue
            } else {
                format!("{}", title.bold())
            };

            let description = issue.description().await?;
            if !description.is_empty() {
                writeln!(&mut styled_issue, "\n{description}")?;
            }

            if log_detail {
                styled_issue.push('\n');
                let detail = issue.detail().await?;
                if !detail.is_empty() {
                    for line in detail.split('\n') {
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

        for severity in ORDERED_GROUPS.iter().copied().filter(|l| *l <= log_level) {
            if let Some(severity_map) = grouped_issues.get_mut(&severity) {
                let severity_map_size = severity_map.len();
                let indent = if severity_map_size == 1 {
                    print!("{} - ", severity.style(severity_to_style(severity)));
                    ""
                } else {
                    println!("{} -", severity.style(severity_to_style(severity)));
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
                    for (context, issues) in contextes.into_iter().take(category_issues_take_count)
                    {
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

        Ok(DisplayIssueState {
            has_fatal,
            has_issues,
            has_new_issues,
        }
        .cell())
    }
}

async fn make_relative_to_cwd(path: FileSystemPathVc, cwd: &PathBuf) -> Result<String> {
    let path = if let Some(fs) = AttachedFileSystemVc::resolve_from(path.fs()).await? {
        fs.get_inner_fs_path(path)
    } else {
        path
    };
    if let Some(fs) = DiskFileSystemVc::resolve_from(path.fs()).await? {
        let sys_path = fs.await?.to_sys_path(path).await?;
        let relative = sys_path
            .strip_prefix(cwd)
            .unwrap_or(&sys_path)
            .to_string_lossy()
            .into_owned();
        Ok(relative)
    } else {
        Ok(path.to_string().await?.clone_value())
    }
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
