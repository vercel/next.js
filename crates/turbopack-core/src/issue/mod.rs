pub mod analyze;
pub mod code_gen;
pub mod resolve;
pub mod unsupported_module;

use std::{
    cmp::Ordering,
    fmt::{Display, Formatter},
    sync::Arc,
};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use auto_hash_map::AutoSet;
use turbo_tasks::{
    emit, CollectiblesSource, RawVc, ReadRef, TransientInstance, TransientValue, TryJoinIterExt,
    Upcast, ValueToString, Vc,
};
use turbo_tasks_fs::{FileContent, FileLine, FileLinesContent, FileSystemPath};
use turbo_tasks_hash::{DeterministicHash, Xxh3Hash64Hasher};

use crate::{
    asset::{Asset, AssetContent},
    source::Source,
    source_pos::SourcePos,
};

#[turbo_tasks::value(shared)]
#[derive(PartialOrd, Ord, Copy, Clone, Hash, Debug, DeterministicHash)]
#[serde(rename_all = "camelCase")]
pub enum IssueSeverity {
    Bug,
    Fatal,
    Error,
    Warning,
    Hint,
    Note,
    Suggestion,
    Info,
}

impl IssueSeverity {
    pub fn as_str(&self) -> &'static str {
        match self {
            IssueSeverity::Bug => "bug",
            IssueSeverity::Fatal => "fatal",
            IssueSeverity::Error => "error",
            IssueSeverity::Warning => "warning",
            IssueSeverity::Hint => "hint",
            IssueSeverity::Note => "note",
            IssueSeverity::Suggestion => "suggestion",
            IssueSeverity::Info => "info",
        }
    }

    pub fn as_help_str(&self) -> &'static str {
        match self {
            IssueSeverity::Bug => "bug in implementation",
            IssueSeverity::Fatal => "unrecoverable problem",
            IssueSeverity::Error => "problem that cause a broken result",
            IssueSeverity::Warning => "problem should be addressed in short term",
            IssueSeverity::Hint => "idea for improvement",
            IssueSeverity::Note => "detail that is worth mentioning",
            IssueSeverity::Suggestion => "change proposal for improvement",
            IssueSeverity::Info => "detail that is worth telling",
        }
    }
}

impl Display for IssueSeverity {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[turbo_tasks::value_trait]
pub trait Issue {
    /// Severity allows the user to filter out unimportant issues, with Bug
    /// being the highest priority and Info being the lowest.
    fn severity(self: Vc<Self>) -> Vc<IssueSeverity> {
        IssueSeverity::Error.into()
    }

    /// The file path that generated the issue, displayed to the user as message
    /// header.
    fn file_path(self: Vc<Self>) -> Vc<FileSystemPath>;

    /// A short identifier of the type of error (eg "parse", "analyze", or
    /// "evaluate") displayed to the user as part of the message header.
    fn category(self: Vc<Self>) -> Vc<String> {
        Vc::<String>::empty()
    }

    /// The issue title should be descriptive of the issue, but should be a
    /// single line. This is displayed to the user directly under the issue
    /// header.
    // TODO add Vc<StyledString>
    fn title(self: Vc<Self>) -> Vc<String>;

    /// A more verbose message of the issue, appropriate for providing multiline
    /// information of the issue.
    // TODO add Vc<StyledString>
    fn description(self: Vc<Self>) -> Vc<String>;

    /// Full details of the issue, appropriate for providing debug level
    /// information. Only displayed if the user explicitly asks for detailed
    /// messages (not to be confused with severity).
    fn detail(self: Vc<Self>) -> Vc<String> {
        Vc::<String>::empty()
    }

    /// A link to relevant documentation of the issue. Only displayed in console
    /// if the user explicitly asks for detailed messages.
    fn documentation_link(self: Vc<Self>) -> Vc<String> {
        Vc::<String>::empty()
    }

    /// The source location that caused the issue. Eg, for a parsing error it
    /// should point at the offending character. Displayed to the user alongside
    /// the title/description.
    fn source(self: Vc<Self>) -> Vc<OptionIssueSource> {
        OptionIssueSource::none()
    }

    fn sub_issues(self: Vc<Self>) -> Vc<Issues> {
        Vc::cell(Vec::new())
    }

    async fn into_plain(
        self: Vc<Self>,
        processing_path: Vc<OptionIssueProcessingPathItems>,
    ) -> Result<Vc<PlainIssue>> {
        Ok(PlainIssue {
            severity: *self.severity().await?,
            file_path: self.file_path().to_string().await?.clone_value(),
            category: self.category().await?.clone_value(),
            title: self.title().await?.clone_value(),
            description: self.description().await?.clone_value(),
            detail: self.detail().await?.clone_value(),
            documentation_link: self.documentation_link().await?.clone_value(),
            source: {
                if let Some(s) = *self.source().await? {
                    Some(s.into_plain().await?)
                } else {
                    None
                }
            },
            sub_issues: self
                .sub_issues()
                .await?
                .iter()
                .map(|i| async move {
                    anyhow::Ok(i.into_plain(OptionIssueProcessingPathItems::none()).await?)
                })
                .try_join()
                .await?,
            processing_path: processing_path.into_plain().await?,
        }
        .cell())
    }
}

#[turbo_tasks::value_trait]
trait IssueProcessingPath {
    fn shortest_path(
        self: Vc<Self>,
        issue: Vc<Box<dyn Issue>>,
    ) -> Vc<OptionIssueProcessingPathItems>;
}

#[turbo_tasks::value]
pub struct IssueProcessingPathItem {
    pub file_path: Option<Vc<FileSystemPath>>,
    pub description: Vc<String>,
}

#[turbo_tasks::value_impl]
impl ValueToString for IssueProcessingPathItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        if let Some(context) = self.file_path {
            Ok(Vc::cell(format!(
                "{} ({})",
                context.to_string().await?,
                self.description.await?
            )))
        } else {
            Ok(self.description)
        }
    }
}

#[turbo_tasks::value_impl]
impl IssueProcessingPathItem {
    #[turbo_tasks::function]
    pub async fn into_plain(self: Vc<Self>) -> Result<Vc<PlainIssueProcessingPathItem>> {
        let this = self.await?;
        Ok(PlainIssueProcessingPathItem {
            file_path: if let Some(context) = this.file_path {
                Some(context.to_string().await?)
            } else {
                None
            },
            description: this.description.await?,
        }
        .cell())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionIssueProcessingPathItems(Option<Vec<Vc<IssueProcessingPathItem>>>);

#[turbo_tasks::value_impl]
impl OptionIssueProcessingPathItems {
    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    pub async fn into_plain(self: Vc<Self>) -> Result<Vc<PlainIssueProcessingPath>> {
        Ok(Vc::cell(if let Some(items) = &*self.await? {
            Some(
                items
                    .iter()
                    .map(|item| item.into_plain())
                    .try_join()
                    .await?,
            )
        } else {
            None
        }))
    }
}

#[turbo_tasks::value]
struct RootIssueProcessingPath(Vc<Box<dyn Issue>>);

#[turbo_tasks::value_impl]
impl IssueProcessingPath for RootIssueProcessingPath {
    #[turbo_tasks::function]
    fn shortest_path(&self, issue: Vc<Box<dyn Issue>>) -> Vc<OptionIssueProcessingPathItems> {
        if self.0 == issue {
            Vc::cell(Some(Vec::new()))
        } else {
            Vc::cell(None)
        }
    }
}

#[turbo_tasks::value]
struct ItemIssueProcessingPath(
    Option<Vc<IssueProcessingPathItem>>,
    AutoSet<Vc<Box<dyn IssueProcessingPath>>>,
);

#[turbo_tasks::value_impl]
impl IssueProcessingPath for ItemIssueProcessingPath {
    /// Returns the shortest path from the root issue to the given issue.
    #[turbo_tasks::function]
    async fn shortest_path(
        &self,
        issue: Vc<Box<dyn Issue>>,
    ) -> Result<Vc<OptionIssueProcessingPathItems>> {
        assert!(!self.1.is_empty());
        let paths = self
            .1
            .iter()
            .map(|child| child.shortest_path(issue))
            .collect::<Vec<_>>();
        let paths = paths.iter().try_join().await?;
        let mut shortest: Option<&Vec<_>> = None;
        for path in paths.iter().filter_map(|p| p.as_ref()) {
            if let Some(old) = shortest {
                match old.len().cmp(&path.len()) {
                    Ordering::Greater => {
                        shortest = Some(path);
                    }
                    Ordering::Equal => {
                        let (mut a, mut b) = (old.iter(), path.iter());
                        while let (Some(a), Some(b)) = (a.next(), b.next()) {
                            let (a, b) = (a.to_string().await?, b.to_string().await?);
                            match String::cmp(&*a, &*b) {
                                Ordering::Less => break,
                                Ordering::Greater => {
                                    shortest = Some(path);
                                    break;
                                }
                                Ordering::Equal => {}
                            }
                        }
                    }
                    Ordering::Less => {}
                }
            } else {
                shortest = Some(path);
            }
        }
        Ok(Vc::cell(shortest.map(|path| {
            if let Some(item) = self.0 {
                std::iter::once(item).chain(path.iter().copied()).collect()
            } else {
                path.clone()
            }
        })))
    }
}

pub trait IssueExt {
    fn emit(self);
}

impl<T> IssueExt for Vc<T>
where
    T: Upcast<Box<dyn Issue>>,
{
    fn emit(self) {
        let issue = Vc::upcast::<Box<dyn Issue>>(self);
        emit(issue);
        emit(Vc::upcast::<Box<dyn IssueProcessingPath>>(
            RootIssueProcessingPath::cell(RootIssueProcessingPath(issue)),
        ))
    }
}

#[turbo_tasks::value(transparent)]
pub struct Issues(Vec<Vc<Box<dyn Issue>>>);

/// A list of issues captured with [`Issue::peek_issues_with_path`] and
/// [`Issue::take_issues_with_path`].
#[turbo_tasks::value]
#[derive(Debug)]
pub struct CapturedIssues {
    issues: AutoSet<Vc<Box<dyn Issue>>>,
    #[cfg(feature = "issue_path")]
    processing_path: Vc<ItemIssueProcessingPath>,
}

#[turbo_tasks::value_impl]
impl CapturedIssues {
    #[turbo_tasks::function]
    pub async fn is_empty(self: Vc<Self>) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.await?.is_empty_ref()))
    }
}

impl CapturedIssues {
    /// Returns true if there are no issues.
    pub fn is_empty_ref(&self) -> bool {
        self.issues.is_empty()
    }

    /// Returns the number of issues.
    #[allow(clippy::len_without_is_empty)]
    pub fn len(&self) -> usize {
        self.issues.len()
    }

    /// Returns an iterator over the issues.
    pub fn iter(&self) -> impl Iterator<Item = Vc<Box<dyn Issue>>> + '_ {
        self.issues.iter().copied()
    }

    /// Returns an iterator over the issues with the shortest path from the root
    /// issue to each issue.
    pub fn iter_with_shortest_path(
        &self,
    ) -> impl Iterator<Item = (Vc<Box<dyn Issue>>, Vc<OptionIssueProcessingPathItems>)> + '_ {
        self.issues.iter().map(|issue| {
            #[cfg(feature = "issue_path")]
            let path = self.processing_path.shortest_path(*issue);
            #[cfg(not(feature = "issue_path"))]
            let path = OptionIssueProcessingPathItems::none();
            (*issue, path)
        })
    }

    pub async fn get_plain_issues(&self) -> Result<Vec<ReadRef<PlainIssue>>> {
        let mut list = self
            .issues
            .iter()
            .map(|&issue| async move {
                #[cfg(feature = "issue_path")]
                return issue
                    .into_plain(self.processing_path.shortest_path(issue))
                    .await;
                #[cfg(not(feature = "issue_path"))]
                return issue
                    .into_plain(OptionIssueProcessingPathItems::none())
                    .await;
            })
            .try_join()
            .await?;
        list.sort_by(|a, b| ReadRef::ptr_cmp(a, b));
        Ok(list)
    }
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct IssueSource {
    pub source: Vc<Box<dyn Source>>,
    pub start: SourcePos,
    pub end: SourcePos,
}

#[turbo_tasks::value_impl]
impl IssueSource {
    #[turbo_tasks::function]
    pub async fn from_byte_offset(
        source: Vc<Box<dyn Source>>,
        start: usize,
        end: usize,
    ) -> Result<Vc<Self>> {
        fn find_line_and_column(lines: &[FileLine], offset: usize) -> SourcePos {
            match lines.binary_search_by(|line| line.bytes_offset.cmp(&offset)) {
                Ok(i) => SourcePos { line: i, column: 0 },
                Err(i) => {
                    if i == 0 {
                        SourcePos {
                            line: 0,
                            column: offset,
                        }
                    } else {
                        SourcePos {
                            line: i - 1,
                            column: offset - lines[i - 1].bytes_offset,
                        }
                    }
                }
            }
        }
        Ok(Self::cell(
            if let FileLinesContent::Lines(lines) = &*source.content().lines().await? {
                let start = find_line_and_column(lines.as_ref(), start);
                let end = find_line_and_column(lines.as_ref(), end);
                IssueSource { source, start, end }
            } else {
                IssueSource {
                    source,
                    start: SourcePos::default(),
                    end: SourcePos::max(),
                }
            },
        ))
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionIssueSource(Option<Vc<IssueSource>>);

#[turbo_tasks::value_impl]
impl OptionIssueSource {
    #[turbo_tasks::function]
    pub fn some(source: Vc<IssueSource>) -> Vc<Self> {
        Vc::cell(Some(source))
    }

    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        Vc::cell(None)
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug)]
pub struct PlainIssue {
    pub severity: IssueSeverity,
    pub file_path: String,
    pub category: String,

    pub title: String,
    pub description: String,
    pub detail: String,
    pub documentation_link: String,

    pub source: Option<ReadRef<PlainIssueSource>>,
    pub sub_issues: Vec<ReadRef<PlainIssue>>,
    pub processing_path: ReadRef<PlainIssueProcessingPath>,
}

fn hash_plain_issue(issue: &PlainIssue, hasher: &mut Xxh3Hash64Hasher, full: bool) {
    hasher.write_ref(&issue.severity);
    hasher.write_ref(&issue.file_path);
    hasher.write_ref(&issue.category);
    hasher.write_ref(&issue.title);
    hasher.write_ref(
        // Normalize syspaths from Windows. These appear in stack traces.
        &issue.description.replace('\\', "/"),
    );
    hasher.write_ref(&issue.detail);
    hasher.write_ref(&issue.documentation_link);

    if let Some(source) = &issue.source {
        hasher.write_value(1_u8);
        // I'm assuming we don't need to hash the contents. Not 100% correct, but
        // probably 99%.
        hasher.write_ref(&source.start);
        hasher.write_ref(&source.end);
    } else {
        hasher.write_value(0_u8);
    }

    if full {
        hasher.write_value(issue.sub_issues.len());
        for i in &issue.sub_issues {
            hash_plain_issue(i, hasher, full);
        }

        hasher.write_ref(&issue.processing_path);
    }
}

impl PlainIssue {
    /// We need deduplicate issues that can come from unique paths, but
    /// represent the same underlying problem. Eg, a parse error for a file
    /// that is compiled in both client and server contexts.
    ///
    /// Passing [full] will also hash any sub-issues and processing paths. While
    /// useful for generating exact matching hashes, it's possible for the
    /// same issue to pass from multiple processing paths, making for overly
    /// verbose logging.
    pub fn internal_hash_ref(&self, full: bool) -> u64 {
        let mut hasher = Xxh3Hash64Hasher::new();
        hash_plain_issue(self, &mut hasher, full);
        hasher.finish()
    }
}

#[turbo_tasks::value_impl]
impl PlainIssue {
    /// We need deduplicate issues that can come from unique paths, but
    /// represent the same underlying problem. Eg, a parse error for a file
    /// that is compiled in both client and server contexts.
    ///
    /// Passing [full] will also hash any sub-issues and processing paths. While
    /// useful for generating exact matching hashes, it's possible for the
    /// same issue to pass from multiple processing paths, making for overly
    /// verbose logging.
    #[turbo_tasks::function]
    pub async fn internal_hash(self: Vc<Self>, full: bool) -> Result<Vc<u64>> {
        Ok(Vc::cell(self.await?.internal_hash_ref(full)))
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug)]
pub struct PlainIssueSource {
    pub asset: ReadRef<PlainSource>,
    pub start: SourcePos,
    pub end: SourcePos,
}

#[turbo_tasks::value_impl]
impl IssueSource {
    #[turbo_tasks::function]
    pub async fn into_plain(self: Vc<Self>) -> Result<Vc<PlainIssueSource>> {
        let this = self.await?;
        Ok(PlainIssueSource {
            asset: PlainSource::from_source(this.source).await?,
            start: this.start,
            end: this.end,
        }
        .cell())
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug)]
pub struct PlainSource {
    pub ident: ReadRef<String>,
    #[turbo_tasks(debug_ignore)]
    pub content: ReadRef<FileContent>,
}

#[turbo_tasks::value_impl]
impl PlainSource {
    #[turbo_tasks::function]
    pub async fn from_source(asset: Vc<Box<dyn Source>>) -> Result<Vc<PlainSource>> {
        let asset_content = asset.content().await?;
        let content = match *asset_content {
            AssetContent::File(file_content) => file_content.await?,
            AssetContent::Redirect { .. } => ReadRef::new(Arc::new(FileContent::NotFound)),
        };

        Ok(PlainSource {
            ident: asset.ident().to_string().await?,
            content,
        }
        .cell())
    }
}

#[turbo_tasks::value(transparent, serialization = "none")]
#[derive(Clone, Debug, DeterministicHash)]
pub struct PlainIssueProcessingPath(Option<Vec<ReadRef<PlainIssueProcessingPathItem>>>);

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug, DeterministicHash)]
pub struct PlainIssueProcessingPathItem {
    pub file_path: Option<ReadRef<String>>,
    pub description: ReadRef<String>,
}

#[turbo_tasks::value_trait]
pub trait IssueReporter {
    /// Reports issues to the user (e.g. to stdio). Returns whether fatal
    /// (program-ending) issues were present.
    ///
    /// # Arguments:
    ///
    /// * `issues` - A [ReadRef] of [CapturedIssues]. Typically obtained with
    ///   `source.peek_issues_with_path()`.
    /// * `source` - The root [Vc] from which issues are traced. Can be used by
    ///   implementers to determine which issues are new.
    /// * `min_failing_severity` - The minimum Vc<[IssueSeverity]>
    ///  The minimum issue severity level considered to fatally end the program.
    fn report_issues(
        self: Vc<Self>,
        issues: TransientInstance<ReadRef<CapturedIssues>>,
        source: TransientValue<RawVc>,
        min_failing_severity: Vc<IssueSeverity>,
    ) -> Vc<bool>;
}

#[async_trait]
pub trait IssueDescriptionExt
where
    Self: Sized,
{
    #[allow(unused_variables, reason = "behind feature flag")]
    async fn attach_file_path(
        self,
        file_path: impl Into<Option<Vc<FileSystemPath>>> + Send,
        description: impl Into<String> + Send,
    ) -> Result<Self>;

    #[allow(unused_variables, reason = "behind feature flag")]
    async fn attach_description(self, description: impl Into<String> + Send) -> Result<Self>;

    async fn issue_file_path(
        self,
        file_path: impl Into<Option<Vc<FileSystemPath>>> + Send,
        description: impl Into<String> + Send,
    ) -> Result<Self>;
    async fn issue_description(self, description: impl Into<String> + Send) -> Result<Self>;

    /// Returns all issues from `source` in a list with their associated
    /// processing path.
    async fn peek_issues_with_path(self) -> Result<Vc<CapturedIssues>>;

    /// Returns all issues from `source` in a list with their associated
    /// processing path.
    ///
    /// This unemits the issues. They will not propagate up.
    async fn take_issues_with_path(self) -> Result<Vc<CapturedIssues>>;
}

#[async_trait]
impl<T> IssueDescriptionExt for T
where
    T: CollectiblesSource + Copy + Send,
{
    #[allow(unused_variables, reason = "behind feature flag")]
    async fn attach_file_path(
        self,
        file_path: impl Into<Option<Vc<FileSystemPath>>> + Send,
        description: impl Into<String> + Send,
    ) -> Result<Self> {
        #[cfg(feature = "issue_path")]
        {
            let children = self.take_collectibles().await?;
            if !children.is_empty() {
                emit(Vc::upcast::<Box<dyn IssueProcessingPath>>(
                    ItemIssueProcessingPath::cell(ItemIssueProcessingPath(
                        Some(IssueProcessingPathItem::cell(IssueProcessingPathItem {
                            file_path: file_path.into(),
                            description: Vc::cell(description.into()),
                        })),
                        children,
                    )),
                ));
            }
        }
        Ok(self)
    }

    #[allow(unused_variables, reason = "behind feature flag")]
    async fn attach_description(self, description: impl Into<String> + Send) -> Result<T> {
        self.attach_file_path(None, description).await
    }

    async fn issue_file_path(
        self,
        file_path: impl Into<Option<Vc<FileSystemPath>>> + Send,
        description: impl Into<String> + Send,
    ) -> Result<Self> {
        #[cfg(feature = "issue_path")]
        {
            let children = self.take_collectibles().await?;
            if !children.is_empty() {
                emit(Vc::upcast::<Box<dyn IssueProcessingPath>>(
                    ItemIssueProcessingPath::cell(ItemIssueProcessingPath(
                        Some(IssueProcessingPathItem::cell(IssueProcessingPathItem {
                            file_path: file_path.into(),
                            description: Vc::cell(description.into()),
                        })),
                        children,
                    )),
                ));
            }
        }
        #[cfg(not(feature = "issue_path"))]
        {
            let _ = (file_path, description);
        }
        Ok(self)
    }

    async fn issue_description(self, description: impl Into<String> + Send) -> Result<Self> {
        self.issue_file_path(None, description).await
    }

    async fn peek_issues_with_path(self) -> Result<Vc<CapturedIssues>> {
        Ok(CapturedIssues::cell(CapturedIssues {
            issues: self.peek_collectibles().strongly_consistent().await?,
            #[cfg(feature = "issue_path")]
            processing_path: ItemIssueProcessingPath::cell(ItemIssueProcessingPath(
                None,
                self.peek_collectibles().strongly_consistent().await?,
            )),
        }))
    }

    async fn take_issues_with_path(self) -> Result<Vc<CapturedIssues>> {
        Ok(CapturedIssues::cell(CapturedIssues {
            issues: self.take_collectibles().strongly_consistent().await?,
            #[cfg(feature = "issue_path")]
            processing_path: ItemIssueProcessingPath::cell(ItemIssueProcessingPath(
                None,
                self.take_collectibles().strongly_consistent().await?,
            )),
        }))
    }
}

pub async fn handle_issues<T>(
    source: Vc<T>,
    issue_reporter: Vc<Box<dyn IssueReporter>>,
    min_failing_severity: Vc<IssueSeverity>,
    path: Option<&str>,
    operation: Option<&str>,
) -> Result<()> {
    let issues = source
        .peek_issues_with_path()
        .await?
        .strongly_consistent()
        .await?;

    let has_fatal = issue_reporter.report_issues(
        TransientInstance::new(issues.clone()),
        TransientValue::new(source.node),
        min_failing_severity,
    );

    if *has_fatal.await? {
        let mut message = "Fatal issue(s) occurred".to_owned();
        if let Some(path) = path.as_ref() {
            message += &format!(" in {path}");
        };
        if let Some(operation) = operation.as_ref() {
            message += &format!(" ({operation})");
        };

        Err(anyhow!(message))
    } else {
        Ok(())
    }
}
