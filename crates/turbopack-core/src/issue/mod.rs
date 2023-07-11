pub mod analyze;
pub mod code_gen;
pub mod resolve;
pub mod unsupported_module;

use std::{
    cmp::Ordering,
    fmt::{Display, Formatter},
    sync::Arc,
};

use anyhow::Result;
use async_trait::async_trait;
use auto_hash_map::AutoSet;
use turbo_tasks::{
    emit,
    primitives::{BoolVc, StringReadRef, StringVc, U64Vc},
    CollectiblesSource, RawVc, ReadRef, TransientInstance, TransientValue, TryJoinIterExt,
    ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::{
    FileContent, FileContentReadRef, FileLine, FileLinesContent, FileSystemPathVc,
};
use turbo_tasks_hash::{DeterministicHash, Xxh3Hash64Hasher};

use crate::{
    asset::{Asset, AssetContent, AssetVc},
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
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Error.into()
    }

    /// The file path that generated the issue, displayed to the user as message
    /// header.
    fn context(&self) -> FileSystemPathVc;

    /// A short identifier of the type of error (eg "parse", "analyze", or
    /// "evaluate") displayed to the user as part of the message header.
    fn category(&self) -> StringVc {
        StringVc::empty()
    }

    /// The issue title should be descriptive of the issue, but should be a
    /// single line. This is displayed to the user directly under the issue
    /// header.
    // TODO add StyledStringVc
    fn title(&self) -> StringVc;

    /// A more verbose message of the issue, appropriate for providing multiline
    /// information of the issue.
    // TODO add StyledStringVc
    fn description(&self) -> StringVc;

    /// Full details of the issue, appropriate for providing debug level
    /// information. Only displayed if the user explicitly asks for detailed
    /// messages (not to be confused with severity).
    fn detail(&self) -> StringVc {
        StringVc::empty()
    }

    /// A link to relevant documentation of the issue. Only displayed in console
    /// if the user explicitly asks for detailed messages.
    fn documentation_link(&self) -> StringVc {
        StringVc::empty()
    }

    /// The source location that caused the issue. Eg, for a parsing error it
    /// should point at the offending character. Displayed to the user alongside
    /// the title/description.
    fn source(&self) -> OptionIssueSourceVc {
        OptionIssueSourceVc::none()
    }

    fn sub_issues(&self) -> IssuesVc {
        IssuesVc::cell(Vec::new())
    }
}

#[turbo_tasks::value_trait]
trait IssueProcessingPath {
    fn shortest_path(&self, issue: IssueVc) -> OptionIssueProcessingPathItemsVc;
}

#[turbo_tasks::value]
pub struct IssueProcessingPathItem {
    pub context: Option<FileSystemPathVc>,
    pub description: StringVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for IssueProcessingPathItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        if let Some(context) = self.context {
            Ok(StringVc::cell(format!(
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
impl IssueProcessingPathItemVc {
    #[turbo_tasks::function]
    pub async fn into_plain(self) -> Result<PlainIssueProcessingPathItemVc> {
        let this = self.await?;
        Ok(PlainIssueProcessingPathItem {
            context: if let Some(context) = this.context {
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
pub struct OptionIssueProcessingPathItems(Option<Vec<IssueProcessingPathItemVc>>);

#[turbo_tasks::value_impl]
impl OptionIssueProcessingPathItemsVc {
    #[turbo_tasks::function]
    pub fn none() -> Self {
        OptionIssueProcessingPathItemsVc::cell(None)
    }

    #[turbo_tasks::function]
    pub async fn into_plain(self) -> Result<PlainIssueProcessingPathVc> {
        Ok(PlainIssueProcessingPathVc::cell(
            if let Some(items) = &*self.await? {
                Some(
                    items
                        .iter()
                        .map(|item| item.into_plain())
                        .try_join()
                        .await?,
                )
            } else {
                None
            },
        ))
    }
}

#[turbo_tasks::value]
struct RootIssueProcessingPath(IssueVc);

#[turbo_tasks::value_impl]
impl IssueProcessingPath for RootIssueProcessingPath {
    #[turbo_tasks::function]
    fn shortest_path(&self, issue: IssueVc) -> OptionIssueProcessingPathItemsVc {
        if self.0 == issue {
            OptionIssueProcessingPathItemsVc::cell(Some(Vec::new()))
        } else {
            OptionIssueProcessingPathItemsVc::cell(None)
        }
    }
}

#[turbo_tasks::value]
struct ItemIssueProcessingPath(
    Option<IssueProcessingPathItemVc>,
    AutoSet<IssueProcessingPathVc>,
);

#[turbo_tasks::value_impl]
impl IssueProcessingPath for ItemIssueProcessingPath {
    /// Returns the shortest path from the root issue to the given issue.
    #[turbo_tasks::function]
    async fn shortest_path(&self, issue: IssueVc) -> Result<OptionIssueProcessingPathItemsVc> {
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
        Ok(OptionIssueProcessingPathItemsVc::cell(shortest.map(
            |path| {
                if let Some(item) = self.0 {
                    std::iter::once(item).chain(path.iter().copied()).collect()
                } else {
                    path.clone()
                }
            },
        )))
    }
}

impl IssueVc {
    pub fn emit(self) {
        emit(self);
        emit(
            RootIssueProcessingPathVc::cell(RootIssueProcessingPath(self))
                .as_issue_processing_path(),
        )
    }
}

impl IssueVc {
    #[allow(unused_variables, reason = "behind feature flag")]
    pub async fn attach_context<T: CollectiblesSource + Copy + Send>(
        context: impl Into<Option<FileSystemPathVc>> + Send,
        description: impl Into<String> + Send,
        source: T,
    ) -> Result<T> {
        #[cfg(feature = "issue_path")]
        {
            let children = source.take_collectibles().await?;
            if !children.is_empty() {
                emit(
                    ItemIssueProcessingPathVc::cell(ItemIssueProcessingPath(
                        Some(IssueProcessingPathItemVc::cell(IssueProcessingPathItem {
                            context: context.into(),
                            description: StringVc::cell(description.into()),
                        })),
                        children,
                    ))
                    .as_issue_processing_path(),
                );
            }
        }
        Ok(source)
    }

    #[allow(unused_variables, reason = "behind feature flag")]
    pub async fn attach_description<T: CollectiblesSource + Copy + Send>(
        description: impl Into<String> + Send,
        source: T,
    ) -> Result<T> {
        Self::attach_context(None, description, source).await
    }

    /// Returns all issues from `source` in a list with their associated
    /// processing path.
    pub async fn peek_issues_with_path<T: CollectiblesSource + Copy>(
        source: T,
    ) -> Result<CapturedIssuesVc> {
        Ok(CapturedIssuesVc::cell(CapturedIssues {
            issues: source.peek_collectibles().strongly_consistent().await?,
            #[cfg(feature = "issue_path")]
            processing_path: ItemIssueProcessingPathVc::cell(ItemIssueProcessingPath(
                None,
                source.peek_collectibles().strongly_consistent().await?,
            )),
        }))
    }

    /// Returns all issues from `source` in a list with their associated
    /// processing path.
    ///
    /// This unemits the issues. They will not propagate up.
    pub async fn take_issues_with_path<T: CollectiblesSource + Copy>(
        source: T,
    ) -> Result<CapturedIssuesVc> {
        Ok(CapturedIssuesVc::cell(CapturedIssues {
            issues: source.take_collectibles().strongly_consistent().await?,
            #[cfg(feature = "issue_path")]
            processing_path: ItemIssueProcessingPathVc::cell(ItemIssueProcessingPath(
                None,
                source.take_collectibles().strongly_consistent().await?,
            )),
        }))
    }
}

#[turbo_tasks::value(transparent)]
pub struct Issues(Vec<IssueVc>);

/// A list of issues captured with [`IssueVc::peek_issues_with_path`] and
/// [`IssueVc::take_issues_with_path`].
#[derive(Debug)]
#[turbo_tasks::value]
pub struct CapturedIssues {
    issues: AutoSet<IssueVc>,
    #[cfg(feature = "issue_path")]
    processing_path: ItemIssueProcessingPathVc,
}

#[turbo_tasks::value_impl]
impl CapturedIssuesVc {
    #[turbo_tasks::function]
    pub async fn is_empty(self) -> Result<BoolVc> {
        Ok(BoolVc::cell(self.await?.is_empty()))
    }
}

impl CapturedIssues {
    /// Returns true if there are no issues.
    pub fn is_empty(&self) -> bool {
        self.issues.is_empty()
    }

    /// Returns the number of issues.
    pub fn len(&self) -> usize {
        self.issues.len()
    }

    /// Returns an iterator over the issues.
    pub fn iter(&self) -> impl Iterator<Item = IssueVc> + '_ {
        self.issues.iter().copied()
    }

    /// Returns an iterator over the issues with the shortest path from the root
    /// issue to each issue.
    pub fn iter_with_shortest_path(
        &self,
    ) -> impl Iterator<Item = (IssueVc, OptionIssueProcessingPathItemsVc)> + '_ {
        self.issues.iter().map(|issue| {
            #[cfg(feature = "issue_path")]
            let path = self.processing_path.shortest_path(*issue);
            #[cfg(not(feature = "issue_path"))]
            let path = OptionIssueProcessingPathItemsVc::none();
            (*issue, path)
        })
    }

    pub async fn get_plain_issues(&self) -> Result<Vec<PlainIssueReadRef>> {
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
                    .into_plain(OptionIssueProcessingPathItemsVc::none())
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
    pub source: AssetVc,
    pub start: SourcePos,
    pub end: SourcePos,
}

#[turbo_tasks::value_impl]
impl IssueSourceVc {
    #[turbo_tasks::function]
    pub async fn from_byte_offset(source: AssetVc, start: usize, end: usize) -> Result<Self> {
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
pub struct OptionIssueSource(Option<IssueSourceVc>);

#[turbo_tasks::value_impl]
impl OptionIssueSourceVc {
    #[turbo_tasks::function]
    pub fn some(source: IssueSourceVc) -> Self {
        OptionIssueSourceVc::cell(Some(source))
    }

    #[turbo_tasks::function]
    pub fn none() -> Self {
        OptionIssueSourceVc::cell(None)
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug)]
pub struct PlainIssue {
    pub severity: IssueSeverity,
    pub context: String,
    pub category: String,

    pub title: String,
    pub description: String,
    pub detail: String,
    pub documentation_link: String,

    pub source: Option<PlainIssueSourceReadRef>,
    pub sub_issues: Vec<PlainIssueReadRef>,
    pub processing_path: PlainIssueProcessingPathReadRef,
}

fn hash_plain_issue(issue: &PlainIssue, hasher: &mut Xxh3Hash64Hasher, full: bool) {
    hasher.write_ref(&issue.severity);
    hasher.write_ref(&issue.context);
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
    pub fn internal_hash(&self, full: bool) -> u64 {
        let mut hasher = Xxh3Hash64Hasher::new();
        hash_plain_issue(self, &mut hasher, full);
        hasher.finish()
    }
}

#[turbo_tasks::value_impl]
impl PlainIssueVc {
    /// We need deduplicate issues that can come from unique paths, but
    /// represent the same underlying problem. Eg, a parse error for a file
    /// that is compiled in both client and server contexts.
    ///
    /// Passing [full] will also hash any sub-issues and processing paths. While
    /// useful for generating exact matching hashes, it's possible for the
    /// same issue to pass from multiple processing paths, making for overly
    /// verbose logging.
    #[turbo_tasks::function]
    pub async fn internal_hash(self, full: bool) -> Result<U64Vc> {
        Ok(U64Vc::cell(self.await?.internal_hash(full)))
    }
}

#[turbo_tasks::value_impl]
impl IssueVc {
    #[turbo_tasks::function]
    pub async fn into_plain(
        self,
        processing_path: OptionIssueProcessingPathItemsVc,
    ) -> Result<PlainIssueVc> {
        Ok(PlainIssue {
            severity: *self.severity().await?,
            context: self.context().to_string().await?.clone_value(),
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
                    anyhow::Ok(
                        i.into_plain(OptionIssueProcessingPathItemsVc::none())
                            .await?,
                    )
                })
                .try_join()
                .await?,
            processing_path: processing_path.into_plain().await?,
        }
        .cell())
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug)]
pub struct PlainIssueSource {
    pub asset: PlainAssetReadRef,
    pub start: SourcePos,
    pub end: SourcePos,
}

#[turbo_tasks::value_impl]
impl IssueSourceVc {
    #[turbo_tasks::function]
    pub async fn into_plain(self) -> Result<PlainIssueSourceVc> {
        let this = self.await?;
        Ok(PlainIssueSource {
            asset: PlainAssetVc::from_asset(this.source).await?,
            start: this.start,
            end: this.end,
        }
        .cell())
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug)]
pub struct PlainAsset {
    pub ident: StringReadRef,
    #[turbo_tasks(debug_ignore)]
    pub content: FileContentReadRef,
}

#[turbo_tasks::value_impl]
impl PlainAssetVc {
    #[turbo_tasks::function]
    pub async fn from_asset(asset: AssetVc) -> Result<PlainAssetVc> {
        let asset_content = asset.content().await?;
        let content = match *asset_content {
            AssetContent::File(file_content) => file_content.await?,
            AssetContent::Redirect { .. } => ReadRef::new(Arc::new(FileContent::NotFound)),
        };

        Ok(PlainAsset {
            ident: asset.ident().to_string().await?,
            content,
        }
        .cell())
    }
}

#[turbo_tasks::value(transparent, serialization = "none")]
#[derive(Clone, Debug, DeterministicHash)]
pub struct PlainIssueProcessingPath(Option<Vec<PlainIssueProcessingPathItemReadRef>>);

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug, DeterministicHash)]
pub struct PlainIssueProcessingPathItem {
    pub context: Option<StringReadRef>,
    pub description: StringReadRef,
}

#[turbo_tasks::value_trait]
pub trait IssueReporter {
    fn report_issues(
        &self,
        issues: TransientInstance<ReadRef<CapturedIssues>>,
        source: TransientValue<RawVc>,
    ) -> BoolVc;
}

#[async_trait]
pub trait IssueContextExt
where
    Self: Sized,
{
    async fn issue_context(
        self,
        context: impl Into<Option<FileSystemPathVc>> + Send,
        description: impl Into<String> + Send,
    ) -> Result<Self>;
    async fn issue_description(self, description: impl Into<String> + Send) -> Result<Self>;
}

#[async_trait]
impl<T> IssueContextExt for T
where
    T: CollectiblesSource + Copy + Send,
{
    async fn issue_context(
        self,
        context: impl Into<Option<FileSystemPathVc>> + Send,
        description: impl Into<String> + Send,
    ) -> Result<Self> {
        IssueVc::attach_context(context, description, self).await
    }
    async fn issue_description(self, description: impl Into<String> + Send) -> Result<Self> {
        IssueVc::attach_description(description, self).await
    }
}
