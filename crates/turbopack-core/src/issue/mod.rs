pub mod analyze;
pub mod code_gen;
pub mod package_json;
pub mod resolve;

use std::{cmp::Ordering, collections::HashSet, fmt::Display, future::IntoFuture, sync::Arc};

use anyhow::Result;
use futures::FutureExt;
use turbo_tasks::{
    emit,
    primitives::{BoolVc, StringVc},
    CollectiblesSource, ReadRef, TryJoinIterExt, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::{
    FileContent, FileContentReadRef, FileLine, FileLinesContent, FileSystemPathReadRef,
    FileSystemPathVc,
};
use turbo_tasks_hash::DeterministicHash;

use crate::{
    asset::{AssetContent, AssetVc},
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
            IssueSeverity::Warning => "problem should be adressed in short term",
            IssueSeverity::Hint => "idea for improvement",
            IssueSeverity::Note => "detail that is worth mentioning",
            IssueSeverity::Suggestion => "change proposal for improvement",
            IssueSeverity::Info => "detail that is worth telling",
        }
    }
}

impl Display for IssueSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
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
        OptionIssueSourceVc::cell(None)
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

#[turbo_tasks::value(transparent)]
pub struct OptionIssueProcessingPathItems(Option<Vec<IssueProcessingPathItemVc>>);

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
    HashSet<IssueProcessingPathVc>,
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
                match old.cmp(path) {
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
    pub async fn attach_context<T: CollectiblesSource + Copy>(
        context: FileSystemPathVc,
        description: String,
        source: T,
    ) -> Result<T> {
        #[cfg(feature = "issue_path")]
        {
            let children = source.take_collectibles().await?;
            if !children.is_empty() {
                emit(
                    ItemIssueProcessingPathVc::cell(ItemIssueProcessingPath(
                        Some(IssueProcessingPathItemVc::cell(IssueProcessingPathItem {
                            context: Some(context),
                            description: StringVc::cell(description),
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
    pub async fn attach_description<T: CollectiblesSource + Copy>(
        description: String,
        source: T,
    ) -> Result<T> {
        #[cfg(feature = "issue_path")]
        {
            let children = source.take_collectibles().await?;
            if !children.is_empty() {
                emit(
                    ItemIssueProcessingPathVc::cell(ItemIssueProcessingPath(
                        Some(IssueProcessingPathItemVc::cell(IssueProcessingPathItem {
                            context: None,
                            description: StringVc::cell(description),
                        })),
                        children,
                    ))
                    .as_issue_processing_path(),
                );
            }
        }
        Ok(source)
    }

    /// Returns all issues from `source` in a list with their associated
    /// processing path.
    pub async fn peek_issues_with_path<T: CollectiblesSource + Copy>(
        source: T,
    ) -> Result<CapturedIssuesVc> {
        Ok(CapturedIssuesVc::cell(CapturedIssues {
            issues: source.peek_collectibles().await?,
            #[cfg(feature = "issue_path")]
            processing_path: ItemIssueProcessingPathVc::cell(ItemIssueProcessingPath(
                None,
                source.peek_collectibles().await?,
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
            issues: source.take_collectibles().await?,
            #[cfg(feature = "issue_path")]
            processing_path: ItemIssueProcessingPathVc::cell(ItemIssueProcessingPath(
                None,
                source.take_collectibles().await?,
            )),
        }))
    }
}

#[turbo_tasks::value(transparent)]
pub struct Issues(Vec<IssueVc>);

/// A list of issues captured with [`IssueVc::peek_issues_with_path`] and
/// [`IssueVc::take_issues_with_path`].
#[turbo_tasks::value]
pub struct CapturedIssues {
    issues: HashSet<IssueVc>,
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
            let path = OptionIssueProcessingPathItemsVc::cell(None);
            (*issue, path)
        })
    }

    pub async fn get_plain_issues(&self) -> Result<Vec<PlainIssueReadRef>> {
        let mut list = self
            .issues
            .iter()
            .map(|issue| issue.into_plain().into_future())
            .try_join()
            .await?;
        list.sort_by(|a, b| ReadRef::ptr_cmp(a, b));
        Ok(list)
    }
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct IssueSource {
    pub asset: AssetVc,
    pub start: SourcePos,
    pub end: SourcePos,
}

#[turbo_tasks::value_impl]
impl IssueSourceVc {
    #[turbo_tasks::function]
    pub async fn from_byte_offset(asset: AssetVc, start: usize, end: usize) -> Result<Self> {
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
            if let FileLinesContent::Lines(lines) = &*asset.content().lines().await? {
                let start = find_line_and_column(lines.as_ref(), start);
                let end = find_line_and_column(lines.as_ref(), end);
                IssueSource { asset, start, end }
            } else {
                IssueSource {
                    asset,
                    start: SourcePos::default(),
                    end: SourcePos::max(),
                }
            },
        ))
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionIssueSource(Option<IssueSourceVc>);

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone)]
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
}

#[turbo_tasks::value_impl]
impl IssueVc {
    #[turbo_tasks::function]
    pub async fn into_plain(self) -> Result<PlainIssueVc> {
        Ok(PlainIssue {
            severity: *self.severity().await?,
            context: self.context().to_string().await?.clone_value(),
            category: self.category().await?.clone_value(),
            title: self.title().await?.clone_value(),
            description: self.description().await?.clone_value(),
            detail: self.detail().await?.clone_value(),
            documentation_link: self.documentation_link().await?.clone_value(),
            source: self
                .source()
                .into_future()
                .then(|s| async {
                    if let Some(s) = *s? {
                        return Ok(Some(s.into_plain().await?));
                    }

                    anyhow::Ok(None)
                })
                .await?,
            sub_issues: self
                .sub_issues()
                .await?
                .iter()
                .map(|i| async move { anyhow::Ok(i.into_plain().await?) })
                .try_join()
                .await?,
        }
        .cell())
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone)]
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
            asset: PlainAssetVc::from_asset(this.asset).await?,
            start: this.start,
            end: this.end,
        }
        .cell())
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone)]
pub struct PlainAsset {
    pub path: FileSystemPathReadRef,
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
            path: asset.path().await?,
            content,
        }
        .cell())
    }
}
