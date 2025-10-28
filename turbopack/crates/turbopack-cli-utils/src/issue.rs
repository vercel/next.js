use std::{
    borrow::Cow,
    cmp::min,
    collections::hash_map::Entry,
    fmt::Write as _,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use anyhow::Result;
use crossterm::style::{StyledContent, Stylize};
use owo_colors::{OwoColorize as _, Style};
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{RawVc, TransientInstance, TransientValue, Vc};
use turbo_tasks_fs::{FileLinesContent, source_context::get_source_context};
use turbopack_core::issue::{
    CollectibleIssuesExt, IssueReporter, IssueSeverity, PlainIssue, PlainIssueSource,
    PlainTraceItem, StyledString,
};

use crate::source_context::format_source_context_lines;

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
    if let FileLinesContent::Lines(lines) = source.asset.content.lines_ref()
        && let Some((start, end)) = source.range
    {
        let lines = lines.iter().map(|l| l.content.as_str());
        let ctx = get_source_context(lines, start.line, start.column, end.line, end.column);
        format_source_context_lines(&ctx, formatted_issue);
    }
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
        .file_path
        .replace("[project]", &current_dir.to_string_lossy())
        .replace("/./", "/")
        .replace("\\\\?\\", "");
    let stage = plain_issue.stage.to_string();

    let mut styled_issue = style_issue_source(plain_issue, &context_path);
    let description = &plain_issue.description;
    if let Some(description) = description {
        writeln!(
            styled_issue,
            "\n{}",
            render_styled_string_to_ansi(description)
        )
        .unwrap();
    }

    if log_detail {
        styled_issue.push('\n');
        let detail = &plain_issue.detail;
        if let Some(detail) = detail {
            for line in render_styled_string_to_ansi(detail).split('\n') {
                writeln!(styled_issue, "| {line}").unwrap();
            }
        }
        let documentation_link = &plain_issue.documentation_link;
        if !documentation_link.is_empty() {
            writeln!(styled_issue, "\ndocumentation: {documentation_link}").unwrap();
        }
        if let Some(path) = path {
            writeln!(styled_issue, "{path}").unwrap();
        }
    }
    let traces = &*plain_issue.import_traces;
    if !traces.is_empty() {
        /// Returns the leaf layer name, which is the first present layer name in the trace
        fn leaf_layer_name(items: &[PlainTraceItem]) -> Option<RcStr> {
            items
                .iter()
                .find(|t| t.layer.is_some())
                .and_then(|t| t.layer.clone())
        }
        /// Returns whether or not all layers in the trace are identical
        /// If a layer is missing we ignore it in this analysis
        fn are_layers_identical(items: &[PlainTraceItem]) -> bool {
            let Some(first_present_layer) = items.iter().position(|t| t.layer.is_some()) else {
                return true; // if all layers are absent they are the same.
            };
            let layer = &items[first_present_layer].layer;
            items
                .iter()
                .skip(first_present_layer + 1)
                .all(|t| t.layer.is_none() || &t.layer == layer)
        }
        fn format_trace_items(
            out: &mut String,
            indent: &'static str,
            print_layers: bool,
            items: &[PlainTraceItem],
        ) {
            for item in items {
                out.push_str(indent);
                // We want to format the filepath but with a few caveats
                // - if it is part of the `[project]` filesystem, omit the fs name
                // - format the label at the end
                // - if it is the last item add the special marker `[entrypoint]` to help clarify
                //   that this is an application entry point
                // TODO(lukesandberg): some formatting could be useful. We could use colors,
                // bold/faint, links?
                if item.fs_name != "project" {
                    out.push('[');
                    out.push_str(&item.fs_name);
                    out.push_str("]/");
                } else {
                    // This is consistent with webpack's output
                    out.push_str("./");
                }
                out.push_str(&item.path);
                if let Some(ref label) = item.layer
                    && print_layers
                {
                    out.push_str(" [");
                    out.push_str(label);
                    out.push(']');
                }
                out.push('\n');
            }
        }

        // For each trace we:
        // * display the layer in the header if the trace has a consistent layer
        // * label the traces with their index, unless the layer is sufficiently unique.
        writeln!(
            styled_issue,
            "Import trace{}:",
            if traces.len() > 1 { "s" } else { "" }
        )
        .unwrap();
        let every_trace_has_a_distinct_root_layer = traces
            .iter()
            .filter_map(|t| leaf_layer_name(t))
            .collect::<FxHashSet<RcStr>>()
            .len()
            == traces.len();
        for (index, trace) in traces.iter().enumerate() {
            let layer = leaf_layer_name(trace);
            let mut trace_indent = "    ";
            if every_trace_has_a_distinct_root_layer {
                writeln!(styled_issue, "  {}:", layer.unwrap()).unwrap();
            } else if traces.len() > 1 {
                write!(styled_issue, "  #{}", index + 1).unwrap();
                if let Some(layer) = layer {
                    write!(styled_issue, " [{layer}]").unwrap();
                }
                writeln!(styled_issue, ":").unwrap();
            } else if let Some(layer) = layer {
                write!(styled_issue, " [{layer}]").unwrap();
            } else {
                // There is one trace and no layer (!?) just indent once
                trace_indent = "  ";
            }

            format_trace_items(
                &mut styled_issue,
                trace_indent,
                !are_layers_identical(trace),
                trace,
            );
        }
    }

    let severity = severity.style(severity_to_style(severity));
    write!(issue_text, "{severity} - [{stage}] ").unwrap();
    for (index, line) in styled_issue.lines().enumerate() {
        // don't indent the first line
        if index > 0 {
            issue_text.push_str("  ");
        }
        issue_text.push_str(line);
        issue_text.push('\n');
    }

    issue_text
}

pub type GroupedIssues =
    FxHashMap<IssueSeverity, FxHashMap<String, FxHashMap<String, Vec<String>>>>;

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
    pub project_dir: PathBuf,
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
/// 1. An issue from this pull is brand new to all sources, in which case it will be logged and the
///    issue's count is inremented.
/// 2. An issue from this pull is brand new to this source but another source has already pulled it,
///    in which case it will be logged and the issue's count is incremented.
/// 3. The previous pull from this source had already seen the issue, in which case the issue will
///    be skipped and the issue's count remains constant.
/// 4. An issue seen in a previous pull was not repulled, and the issue's count is decremented.
///
/// Once an issue's count reaches zero, it's removed. If it is ever seen again,
/// it is considered new and will be relogged.
#[derive(Default)]
struct SeenIssues {
    /// Keeps track of all issue pulled from the source. Used so that we can
    /// decrement issues that are not pulled in the current synchronization.
    source_to_issue_ids: FxHashMap<RawVc, FxHashSet<u64>>,

    /// Counts the number of times a particular issue is seen across all
    /// sources. As long as the count is positive, an issue is considered
    /// "seen" and will not be relogged. Once the count reaches zero, the
    /// issue is removed and the next time its seen it will be considered new.
    issues_count: FxHashMap<u64, usize>,
}

impl SeenIssues {
    fn new() -> Self {
        Default::default()
    }

    /// Synchronizes state between the issues previously pulled from this
    /// source, to the issues now pulled.
    fn new_ids(&mut self, source: RawVc, issue_ids: FxHashSet<u64>) -> FxHashSet<u64> {
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
            .collect::<FxHashSet<_>>();

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
/// the collected issues.
///
/// The ConsoleUi can be shared and capture issues from multiple sources, with deduplication
/// operating across all issues.
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

#[turbo_tasks::value_impl]
impl ConsoleUi {
    #[turbo_tasks::function]
    pub fn new(options: TransientInstance<LogOptions>) -> Vc<Self> {
        ConsoleUi {
            options: (*options).clone(),
            seen: Arc::new(Mutex::new(SeenIssues::new())),
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl IssueReporter for ConsoleUi {
    #[turbo_tasks::function]
    async fn report_issues(
        &self,
        source: TransientValue<RawVc>,
        min_failing_severity: IssueSeverity,
    ) -> Result<Vc<bool>> {
        let issues = source.peek_issues();
        let LogOptions {
            ref current_dir,
            ref project_dir,
            show_all,
            log_detail,
            log_level,
            ..
        } = self.options;
        let mut grouped_issues: GroupedIssues = FxHashMap::default();

        let plain_issues = issues.get_plain_issues().await?;
        let issues = plain_issues
            .iter()
            .map(|plain_issue| {
                let id = plain_issue.internal_hash_ref(false);
                (plain_issue, id)
            })
            .collect::<Vec<_>>();

        let issue_ids = issues.iter().map(|(_, id)| *id).collect::<FxHashSet<_>>();
        let mut new_ids = self
            .seen
            .lock()
            .unwrap()
            .new_ids(source.into_value(), issue_ids);

        let mut has_fatal = false;
        for (plain_issue, id) in issues {
            if !new_ids.remove(&id) {
                continue;
            }

            let severity = plain_issue.severity;
            if severity <= min_failing_severity {
                has_fatal = true;
            }

            let context_path =
                make_relative_to_cwd(&plain_issue.file_path, project_dir, current_dir);
            let stage = plain_issue.stage.to_string();
            let severity_map = grouped_issues.entry(severity).or_default();
            let category_map = severity_map.entry(stage.clone()).or_default();
            let issues = category_map.entry(context_path.to_string()).or_default();

            let mut styled_issue = style_issue_source(plain_issue, &context_path);
            let description = &plain_issue.description;
            if let Some(description) = description {
                writeln!(
                    &mut styled_issue,
                    "\n{}",
                    render_styled_string_to_ansi(description)
                )?;
            }

            if log_detail {
                styled_issue.push('\n');
                let detail = &plain_issue.detail;
                if let Some(detail) = detail {
                    for line in render_styled_string_to_ansi(detail).split('\n') {
                        writeln!(&mut styled_issue, "| {line}")?;
                    }
                }
                let documentation_link = &plain_issue.documentation_link;
                if !documentation_link.is_empty() {
                    writeln!(&mut styled_issue, "\ndocumentation: {documentation_link}")?;
                }
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
                    let (mut contexts, mut vendor_contexts): (Vec<_>, Vec<_>) = category_issues
                        .iter_mut()
                        .partition(|(context, _)| !context.contains("node_modules"));
                    contexts.sort_by_key(|(c, _)| *c);
                    if show_all {
                        vendor_contexts.sort_by_key(|(c, _)| *c);
                        contexts.extend(vendor_contexts);
                    }
                    let category_issues_take_count = if show_all {
                        category_issues_size
                    } else {
                        min(contexts.len(), DEFAULT_SHOW_COUNT)
                    };
                    for (context, issues) in contexts.into_iter().take(category_issues_take_count) {
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

        Ok(Vc::cell(has_fatal))
    }
}

fn make_relative_to_cwd<'a>(path: &'a str, project_dir: &Path, cwd: &Path) -> Cow<'a, str> {
    if let Some(path_in_project) = path.strip_prefix("[project]/") {
        let abs_path = if std::path::MAIN_SEPARATOR != '/' {
            project_dir.join(path_in_project.replace('/', std::path::MAIN_SEPARATOR_STR))
        } else {
            project_dir.join(path_in_project)
        };
        let relative = abs_path
            .strip_prefix(cwd)
            .unwrap_or(&abs_path)
            .to_string_lossy()
            .to_string();
        relative.into()
    } else {
        path.into()
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

fn render_styled_string_to_ansi(styled_string: &StyledString) -> String {
    match styled_string {
        StyledString::Line(parts) => {
            let mut string = String::new();
            for part in parts {
                string.push_str(&render_styled_string_to_ansi(part));
            }
            string.push('\n');
            string
        }
        StyledString::Stack(parts) => {
            let mut string = String::new();
            for part in parts {
                string.push_str(&render_styled_string_to_ansi(part));
                string.push('\n');
            }
            string
        }
        StyledString::Text(string) => string.to_string(),
        StyledString::Code(string) => string.blue().to_string(),
        StyledString::Strong(string) => string.bold().to_string(),
    }
}

fn style_issue_source(plain_issue: &PlainIssue, context_path: &str) -> String {
    let title = &plain_issue.title;
    let formatted_title = match title {
        StyledString::Text(text) => text.bold().to_string(),
        _ => render_styled_string_to_ansi(title),
    };

    if let Some(source) = &plain_issue.source {
        let mut styled_issue = match source.range {
            Some((start, _)) => format!(
                "{}:{}:{}  {}",
                context_path,
                start.line + 1,
                start.column,
                formatted_title
            ),
            None => format!("{context_path}  {formatted_title}"),
        };
        styled_issue.push('\n');
        format_source_content(source, &mut styled_issue);
        styled_issue
    } else {
        format!("{context_path}  {formatted_title}\n")
    }
}
