pub mod analyze;
pub mod code_gen;
pub mod module;
pub mod resolve;

use std::{
    borrow::Cow,
    cmp::{Ordering, min},
    collections::hash_map::Entry,
    fmt::{Display, Formatter},
};

use anyhow::{Result, anyhow};
use async_trait::async_trait;
use auto_hash_map::AutoSet;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    CollectiblesSource, NonLocalValue, OperationVc, RawVc, ReadRef, ResolvedVc, TaskInput,
    TransientInstance, TransientValue, TryJoinIterExt, Upcast, ValueToString, Vc, emit,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{FileContent, FileLine, FileLinesContent, FileSystem, FileSystemPath};
use turbo_tasks_hash::{DeterministicHash, Xxh3Hash64Hasher};

use crate::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    module_graph::SingleModuleGraph,
    source::Source,
    source_map::{GenerateSourceMap, SourceMap, TokenWithSource},
    source_pos::SourcePos,
};

#[turbo_tasks::value(shared)]
#[derive(PartialOrd, Ord, Copy, Clone, Hash, Debug, DeterministicHash, TaskInput)]
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

/// Represents a section of structured styled text. This can be interpreted and
/// rendered by various UIs as appropriate, e.g. HTML for display on the web,
/// ANSI sequences in TTYs.
#[derive(Clone, Debug, PartialOrd, Ord, DeterministicHash)]
#[turbo_tasks::value(shared)]
pub enum StyledString {
    /// Multiple [StyledString]s concatenated into a single line. Each item is
    /// considered as inline element. Items might contain line breaks, which
    /// would be considered as soft line breaks.
    Line(Vec<StyledString>),
    /// Multiple [StyledString]s stacked vertically. They are considered as
    /// block elements, just like the top level [StyledString].
    Stack(Vec<StyledString>),
    /// Some prose text.
    Text(RcStr),
    /// Code snippet.
    // TODO add language to support syntax hightlighting
    Code(RcStr),
    /// Some important text.
    Strong(RcStr),
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

    /// The stage of the compilation process at which the issue occurred. This
    /// is used to sort issues.
    fn stage(self: Vc<Self>) -> Vc<IssueStage>;

    /// The issue title should be descriptive of the issue, but should be a
    /// single line. This is displayed to the user directly under the issue
    /// header.
    // TODO add Vc<StyledString>
    fn title(self: Vc<Self>) -> Vc<StyledString>;

    /// A more verbose message of the issue, appropriate for providing multiline
    /// information of the issue.
    // TODO add Vc<StyledString>
    fn description(self: Vc<Self>) -> Vc<OptionStyledString> {
        Vc::cell(None)
    }

    /// Full details of the issue, appropriate for providing debug level
    /// information. Only displayed if the user explicitly asks for detailed
    /// messages (not to be confused with severity).
    fn detail(self: Vc<Self>) -> Vc<OptionStyledString> {
        Vc::cell(None)
    }

    /// A link to relevant documentation of the issue. Only displayed in console
    /// if the user explicitly asks for detailed messages.
    fn documentation_link(self: Vc<Self>) -> Vc<RcStr> {
        Vc::<RcStr>::default()
    }

    /// The source location that caused the issue. Eg, for a parsing error it
    /// should point at the offending character. Displayed to the user alongside
    /// the title/description.
    fn source(self: Vc<Self>) -> Vc<OptionIssueSource> {
        Vc::cell(None)
    }
}

// A collectible marker trait that wraps a `SingleModuleGraph`
// It should be downcast access the graph.
#[turbo_tasks::value_trait]
pub trait CollectibleModuleGraph {}

pub type ImportTrace = Vec<ReadRef<AssetIdent>>;

#[turbo_tasks::value_trait]
trait IssueProcessingPath {
    fn shortest_path(
        self: Vc<Self>,
        issue: Vc<Box<dyn Issue>>,
    ) -> Vc<OptionIssueProcessingPathItems>;
}

#[turbo_tasks::value]
pub struct IssueProcessingPathItem {
    pub file_path: Option<ResolvedVc<FileSystemPath>>,
    pub description: ResolvedVc<RcStr>,
}

#[turbo_tasks::value_impl]
impl ValueToString for IssueProcessingPathItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        if let Some(context) = self.file_path {
            let description_str = self.description.await?;
            Ok(Vc::cell(
                format!("{} ({})", context.to_string().await?, description_str).into(),
            ))
        } else {
            Ok(*self.description)
        }
    }
}

#[turbo_tasks::value_impl]
impl IssueProcessingPathItem {
    #[turbo_tasks::function]
    pub async fn into_plain(&self) -> Result<Vc<PlainIssueProcessingPathItem>> {
        Ok(PlainIssueProcessingPathItem {
            file_path: if let Some(context) = self.file_path {
                Some(context.to_string().await?)
            } else {
                None
            },
            description: self.description.await?,
        }
        .cell())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionIssueProcessingPathItems(Option<Vec<ResolvedVc<IssueProcessingPathItem>>>);

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
struct RootIssueProcessingPath(ResolvedVc<Box<dyn Issue>>);

#[turbo_tasks::value_impl]
impl IssueProcessingPath for RootIssueProcessingPath {
    #[turbo_tasks::function]
    fn shortest_path(
        &self,
        issue: ResolvedVc<Box<dyn Issue>>,
    ) -> Vc<OptionIssueProcessingPathItems> {
        if self.0 == issue {
            Vc::cell(Some(Vec::new()))
        } else {
            Vc::cell(None)
        }
    }
}

#[turbo_tasks::value]
struct ItemIssueProcessingPath(
    Option<ResolvedVc<IssueProcessingPathItem>>,
    AutoSet<ResolvedVc<Box<dyn IssueProcessingPath>>>,
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
                            match RcStr::cmp(&*a, &*b) {
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

impl<T> IssueExt for ResolvedVc<T>
where
    T: Upcast<Box<dyn Issue>>,
{
    fn emit(self) {
        let issue = ResolvedVc::upcast::<Box<dyn Issue>>(self);
        emit(issue);
        emit(ResolvedVc::upcast::<Box<dyn IssueProcessingPath>>(
            RootIssueProcessingPath::resolved_cell(RootIssueProcessingPath(issue)),
        ))
    }
}

#[turbo_tasks::value(transparent)]
pub struct Issues(Vec<ResolvedVc<Box<dyn Issue>>>);

/// A list of issues captured with [`Issue::peek_issues_with_path`] and
/// [`Issue::take_issues_with_path`].
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct CapturedIssues {
    issues: AutoSet<ResolvedVc<Box<dyn Issue>>>,
    #[cfg(feature = "issue_path")]
    processing_path: ResolvedVc<ItemIssueProcessingPath>,
    graphs: AutoSet<ResolvedVc<Box<dyn CollectibleModuleGraph>>>,
}

#[turbo_tasks::value_impl]
impl CapturedIssues {
    #[turbo_tasks::function]
    pub fn is_empty(&self) -> Vc<bool> {
        Vc::cell(self.is_empty_ref())
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
    pub fn iter(&self) -> impl Iterator<Item = ResolvedVc<Box<dyn Issue>>> + '_ {
        self.issues.iter().copied()
    }

    // Returns all the issues as formatted `PlainIssues`.
    pub async fn get_plain_issues(&self) -> Result<Vec<PlainIssue>> {
        let mut issue_to_traces = {
            let mut graphs = self
                .graphs
                .iter()
                .map(|&g| async move {
                    let graph = ResolvedVc::try_downcast_type::<SingleModuleGraph>(g)
                        .expect(
                            "`SingleModuleGraph` should be the only implementation of \
                             CollectibleModuleGraph",
                        )
                        .await?;
                    graph.compute_import_traces_for_issues(&self.issues).await
                })
                .try_join()
                .await?;

            // Merge the maps
            let mut issue_to_traces: FxHashMap<ResolvedVc<Box<dyn Issue>>, Vec<ImportTrace>> =
                FxHashMap::with_capacity_and_hasher(self.issues.len(), Default::default());
            for graph in graphs.iter_mut() {
                // Drain so we can transfer ownership into the new map.
                for (issue, mut traces) in graph.drain() {
                    match issue_to_traces.entry(issue) {
                        Entry::Occupied(mut entry) => {
                            entry.get_mut().append(&mut traces);
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(traces);
                        }
                    }
                }
            }
            issue_to_traces
        };

        let mut list = self
            .issues
            .iter()
            .map(|issue| {
                let traces = issue_to_traces.remove(issue).unwrap_or(Vec::new());
                async move {
                    let traces = into_plain(traces).await?;
                    #[cfg(feature = "issue_path")]
                    let processing_path = self.processing_path.shortest_path(**issue);
                    #[cfg(not(feature = "issue_path"))]
                    let processing_path = OptionIssueProcessingPathItems::none();
                    PlainIssue::from_issue(*issue, traces, processing_path).await
                }
            })
            .try_join()
            .await?;
        list.sort();
        Ok(list)
    }
}

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Hash, TaskInput, TraceRawVcs, NonLocalValue,
)]
pub struct IssueSource {
    source: ResolvedVc<Box<dyn Source>>,
    range: Option<SourceRange>,
}

/// The end position is the first character after the range
#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Hash, TaskInput, TraceRawVcs, NonLocalValue,
)]
enum SourceRange {
    LineColumn(SourcePos, SourcePos),
    ByteOffset(u32, u32),
}

impl IssueSource {
    // Sometimes we only have the source file that causes an issue, not the
    // exact location, such as as in some generated code.
    pub fn from_source_only(source: ResolvedVc<Box<dyn Source>>) -> Self {
        IssueSource {
            source,
            range: None,
        }
    }

    pub fn from_line_col(
        source: ResolvedVc<Box<dyn Source>>,
        start: SourcePos,
        end: SourcePos,
    ) -> Self {
        IssueSource {
            source,
            range: Some(SourceRange::LineColumn(start, end)),
        }
    }

    pub async fn resolve_source_map(&self) -> Result<Cow<'_, Self>> {
        if let Some(range) = &self.range {
            let (start, end) = match range {
                SourceRange::LineColumn(start, end) => (*start, *end),
                SourceRange::ByteOffset(start, end) => {
                    if let FileLinesContent::Lines(lines) = &*self.source.content().lines().await? {
                        let start = find_line_and_column(lines.as_ref(), *start);
                        let end = find_line_and_column(lines.as_ref(), *end);
                        (start, end)
                    } else {
                        return Ok(Cow::Borrowed(self));
                    }
                }
            };

            // If we have a source map, map the line/column to the original source.
            let mapped = source_pos(self.source, start, end).await?;

            if let Some((source, start, end)) = mapped {
                return Ok(Cow::Owned(IssueSource {
                    source,
                    range: Some(SourceRange::LineColumn(start, end)),
                }));
            }
        }

        Ok(Cow::Borrowed(self))
    }

    /// Create a [`IssueSource`] from byte offsets given by an swc ast node
    /// span.
    ///
    /// Arguments:
    ///
    /// * `source`: The source code in which to look up the byte offsets.
    /// * `start`: The start index of the span. Must use **1-based** indexing.
    /// * `end`: The end index of the span. Must use **1-based** indexing.
    pub fn from_swc_offsets(source: ResolvedVc<Box<dyn Source>>, start: u32, end: u32) -> Self {
        IssueSource {
            source,
            range: match (start == 0, end == 0) {
                (true, true) => None,
                (false, false) => Some(SourceRange::ByteOffset(start - 1, end - 1)),
                (false, true) => Some(SourceRange::ByteOffset(start - 1, start - 1)),
                (true, false) => Some(SourceRange::ByteOffset(end - 1, end - 1)),
            },
        }
    }

    /// Returns an `IssueSource` representing a span of code in the `source`.
    /// Positions are derived from byte offsets and stored as lines and columns.
    /// Requires a binary search of the source text to perform this.
    ///
    /// Arguments:
    ///
    /// * `source`: The source code in which to look up the byte offsets.
    /// * `start`: Byte offset into the source that the text begins. 0-based index and inclusive.
    /// * `end`: Byte offset into the source that the text ends. 0-based index and exclusive.
    pub async fn from_byte_offset(
        source: ResolvedVc<Box<dyn Source>>,
        start: u32,
        end: u32,
    ) -> Result<Self> {
        Ok(IssueSource {
            source,
            range: if let FileLinesContent::Lines(lines) = &*source.content().lines().await? {
                let start = find_line_and_column(lines.as_ref(), start);
                let end = find_line_and_column(lines.as_ref(), end);
                Some(SourceRange::LineColumn(start, end))
            } else {
                None
            },
        })
    }

    /// Returns the file path for the source file.
    pub fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.ident().path()
    }
}

impl IssueSource {
    /// Returns bytes offsets corresponding the source range in the format used by swc's Spans.
    pub async fn to_swc_offsets(&self) -> Result<Option<(u32, u32)>> {
        Ok(match &self.range {
            Some(range) => match range {
                SourceRange::ByteOffset(start, end) => Some((*start + 1, *end + 1)),
                SourceRange::LineColumn(start, end) => {
                    if let FileLinesContent::Lines(lines) = &*self.source.content().lines().await? {
                        let start = find_offset(lines.as_ref(), *start) + 1;
                        let end = find_offset(lines.as_ref(), *end) + 1;
                        Some((start, end))
                    } else {
                        None
                    }
                }
            },
            _ => None,
        })
    }
}

async fn source_pos(
    source: ResolvedVc<Box<dyn Source>>,
    start: SourcePos,
    end: SourcePos,
) -> Result<Option<(ResolvedVc<Box<dyn Source>>, SourcePos, SourcePos)>> {
    let Some(generator) = ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(source) else {
        return Ok(None);
    };

    let srcmap = generator.generate_source_map();
    let Some(srcmap) = &*SourceMap::new_from_rope_cached(srcmap).await? else {
        return Ok(None);
    };

    let find = async |line: u32, col: u32| {
        let TokenWithSource {
            token,
            source_content,
        } = &srcmap.lookup_token_and_source(line, col).await?;

        match token {
            crate::source_map::Token::Synthetic(t) => anyhow::Ok((
                SourcePos {
                    line: t.generated_line as _,
                    column: t.generated_column as _,
                },
                *source_content,
            )),
            crate::source_map::Token::Original(t) => anyhow::Ok((
                SourcePos {
                    line: t.original_line as _,
                    column: t.original_column as _,
                },
                *source_content,
            )),
        }
    };

    let (start, content_1) = find(start.line, start.column).await?;
    let (end, content_2) = find(end.line, end.column).await?;

    let Some((content_1, content_2)) = content_1.zip(content_2) else {
        return Ok(None);
    };

    if content_1 != content_2 {
        return Ok(None);
    }

    Ok(Some((content_1, start, end)))
}

#[turbo_tasks::value(transparent)]
pub struct OptionIssueSource(Option<IssueSource>);

#[turbo_tasks::value(transparent)]
pub struct OptionStyledString(Option<ResolvedVc<StyledString>>);

// A structured reference to a file with module level details for displaying in an import trace
#[derive(Serialize, PartialEq, Eq, PartialOrd, Ord, Clone, Debug, TraceRawVcs, NonLocalValue)]
#[serde(rename_all = "camelCase")]
pub struct PlainTraceItem {
    // The name of the filesystem
    pub fs_name: String,
    // The root path of the filesystem, for constructing links
    pub root_path: String,
    // The path of the file, relative to the filesystem root
    pub path: String,
    // An optional label attached to the module that clarifies where in the module grpah it is.
    pub layer: Option<String>,
}

impl PlainTraceItem {
    async fn from_asset(asset: &ReadRef<AssetIdent>) -> Result<Self> {
        // TODO(lukesandberg): How should we display paths? it would be good to display all paths
        // relative to the cwd or the project root.
        let fs_path = asset.path.await?;
        let fs_name = fs_path.fs.to_string().await?.to_string();
        let root_path = fs_path.fs.root().await?.path.to_string();
        let path = fs_path.path.to_string();
        let layer = match asset.layer {
            Some(layer) => Some(layer.await?.to_string()),
            None => None,
        };
        Ok(Self {
            fs_name,
            root_path,
            path,
            layer,
        })
    }
}

pub type PlainTrace = Vec<PlainTraceItem>;

// Flatten this set of traces into a simpler format for formatting.
async fn into_plain(traces: Vec<Vec<ReadRef<AssetIdent>>>) -> Result<Vec<PlainTrace>> {
    let mut plain_traces = traces
        .iter()
        .map(|trace| {
            trace
                .iter()
                .filter(|asset| {
                    // If there are nested assets, this is a synthetic module which is likely to be
                    // confusing/distracting.  Just skip it.
                    asset.assets.is_empty()
                })
                .map(PlainTraceItem::from_asset)
                .try_join()
        })
        .try_join()
        .await?;

    // Sort so the shortest traces come first, and break ties by the trace itself to ensure
    // stability
    plain_traces.sort_by(|a, b| {
        // Sort by length first, so that shorter traces come first.
        let ordering = a.len().cmp(&b.len());
        if ordering.is_eq() {
            // If the lengths are equal, sort by the trace itself to ensure stability.
            return a.cmp(b);
        }
        ordering
    });
    // trim any empty traces and traces that only contain 1 item.  Showing a trace that points to
    // the file with the issue is not useful.  Due to the sort these are all at the beginning so we
    // just remove all until the first one with a length greater than 1.
    if let Some(end) = plain_traces.iter().position(|t| t.len() > 1) {
        drop(plain_traces.drain(0..end));
    }

    // Now see if there are any overlaps
    // If two of the traces overlap that means one is a suffix of another one.  Because we are
    // computing shortest paths in the same graph and the shortest path algorithm we use is
    // deterministic.
    // Technically this is a quadratic algorithm since we need to compare each trace with all
    // subsequent traces, however there are rarely more than 3 traces and certainly never more
    // than 10.
    if plain_traces.len() > 1 {
        let mut i = 0;
        while i < plain_traces.len() - 1 {
            let mut j = plain_traces.len() - 1;
            while j > i {
                if plain_traces[j].ends_with(&plain_traces[i]) {
                    // Remove the longer trace.
                    // This typically happens due to things like server->client transitions where
                    // the same file appears multiple times under different modules identifiers.
                    // On the one hand the shorter trace is simpler, on the other hand the longer
                    // trace might be more 'interesting' and even relevant.
                    plain_traces.remove(j);
                }
                j -= 1;
            }
            i += 1;
        }
    }

    Ok(plain_traces)
}

#[turbo_tasks::value(shared, serialization = "none")]
#[derive(Clone, Debug, PartialOrd, Ord, DeterministicHash, Serialize)]
pub enum IssueStage {
    Config,
    AppStructure,
    ProcessModule,
    /// Read file.
    Load,
    SourceTransform,
    Parse,
    /// TODO: Add index of the transform
    Transform,
    Analysis,
    Resolve,
    Bindings,
    CodeGen,
    Unsupported,
    Misc,
    Other(String),
}

impl Display for IssueStage {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            IssueStage::Config => write!(f, "config"),
            IssueStage::Resolve => write!(f, "resolve"),
            IssueStage::ProcessModule => write!(f, "process module"),
            IssueStage::Load => write!(f, "load"),
            IssueStage::SourceTransform => write!(f, "source transform"),
            IssueStage::Parse => write!(f, "parse"),
            IssueStage::Transform => write!(f, "transform"),
            IssueStage::Analysis => write!(f, "analysis"),
            IssueStage::Bindings => write!(f, "bindings"),
            IssueStage::CodeGen => write!(f, "code gen"),
            IssueStage::Unsupported => write!(f, "unsupported"),
            IssueStage::AppStructure => write!(f, "app structure"),
            IssueStage::Misc => write!(f, "misc"),
            IssueStage::Other(s) => write!(f, "{s}"),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, TraceRawVcs, NonLocalValue)]
pub struct PlainIssue {
    pub severity: IssueSeverity,
    pub stage: IssueStage,

    pub title: StyledString,
    pub file_path: RcStr,

    pub description: Option<StyledString>,
    pub detail: Option<StyledString>,
    pub documentation_link: RcStr,

    pub source: Option<PlainIssueSource>,
    pub processing_path: ReadRef<PlainIssueProcessingPath>,
    pub import_traces: Vec<PlainTrace>,
}

fn hash_plain_issue(issue: &PlainIssue, hasher: &mut Xxh3Hash64Hasher, full: bool) {
    hasher.write_ref(&issue.severity);
    hasher.write_ref(&issue.file_path);
    hasher.write_ref(&issue.stage);
    hasher.write_ref(&issue.title);
    hasher.write_ref(&issue.description);
    hasher.write_ref(&issue.detail);
    hasher.write_ref(&issue.documentation_link);

    if let Some(source) = &issue.source {
        hasher.write_value(1_u8);
        // I'm assuming we don't need to hash the contents. Not 100% correct, but
        // probably 99%.
        hasher.write_ref(&source.range);
    } else {
        hasher.write_value(0_u8);
    }

    if full {
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

    /// Translate an [Issue] into a [PlainIssue]. A more regular structure suitable for printing and
    /// serialization.
    pub async fn from_issue(
        issue: ResolvedVc<Box<dyn Issue>>,
        import_traces: Vec<PlainTrace>,
        processing_path: Vc<OptionIssueProcessingPathItems>,
    ) -> Result<Self> {
        let description: Option<StyledString> = match *issue.description().await? {
            Some(description) => Some((*description.await?).clone()),
            None => None,
        };
        let detail = match *issue.detail().await? {
            Some(detail) => Some((*detail.await?).clone()),
            None => None,
        };

        Ok(Self {
            severity: *issue.severity().await?,
            file_path: issue.file_path().to_string().owned().await?,
            stage: issue.stage().owned().await?,
            title: issue.title().owned().await?,
            description,
            detail,
            documentation_link: issue.documentation_link().owned().await?,
            source: {
                if let Some(s) = &*issue.source().await? {
                    Some(s.into_plain().await?)
                } else {
                    None
                }
            },
            processing_path: processing_path.into_plain().await?,
            import_traces,
        })
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug, PartialOrd, Ord)]
pub struct PlainIssueSource {
    pub asset: ReadRef<PlainSource>,
    pub range: Option<(SourcePos, SourcePos)>,
}

impl IssueSource {
    pub async fn into_plain(&self) -> Result<PlainIssueSource> {
        Ok(PlainIssueSource {
            asset: PlainSource::from_source(*self.source).await?,
            range: match &self.range {
                Some(range) => match range {
                    SourceRange::LineColumn(start, end) => Some((*start, *end)),
                    SourceRange::ByteOffset(start, end) => {
                        if let FileLinesContent::Lines(lines) =
                            &*self.source.content().lines().await?
                        {
                            let start = find_line_and_column(lines.as_ref(), *start);
                            let end = find_line_and_column(lines.as_ref(), *end);
                            Some((start, end))
                        } else {
                            None
                        }
                    }
                },
                _ => None,
            },
        })
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug, PartialOrd, Ord)]
pub struct PlainSource {
    pub ident: ReadRef<RcStr>,
    #[turbo_tasks(debug_ignore)]
    pub content: ReadRef<FileContent>,
}

#[turbo_tasks::value_impl]
impl PlainSource {
    #[turbo_tasks::function]
    pub async fn from_source(asset: ResolvedVc<Box<dyn Source>>) -> Result<Vc<PlainSource>> {
        let asset_content = asset.content().await?;
        let content = match *asset_content {
            AssetContent::File(file_content) => file_content.await?,
            AssetContent::Redirect { .. } => ReadRef::new_owned(FileContent::NotFound),
        };

        Ok(PlainSource {
            ident: asset.ident().to_string().await?,
            content,
        }
        .cell())
    }
}

#[turbo_tasks::value(transparent, serialization = "none")]
#[derive(Clone, Debug, DeterministicHash, PartialOrd, Ord)]
pub struct PlainIssueProcessingPath(Option<Vec<ReadRef<PlainIssueProcessingPathItem>>>);

#[turbo_tasks::value(serialization = "none")]
#[derive(Clone, Debug, DeterministicHash, PartialOrd, Ord)]
pub struct PlainIssueProcessingPathItem {
    pub file_path: Option<ReadRef<RcStr>>,
    pub description: ReadRef<RcStr>,
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
    /// * `source` - The root [Vc] from which issues are traced. Can be used by implementers to
    ///   determine which issues are new.
    /// * `min_failing_severity` - The minimum Vc<[IssueSeverity]>
    ///  The minimum issue severity level considered to fatally end the program.
    fn report_issues(
        self: Vc<Self>,
        issues: TransientInstance<CapturedIssues>,
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
    async fn peek_issues_with_path(self) -> Result<CapturedIssues>;

    /// Returns all issues from `source` in a list with their associated
    /// processing path.
    ///
    /// This unemits the issues. They will not propagate up.
    async fn take_issues_with_path(self) -> Result<CapturedIssues>;
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
            let children = self.take_collectibles();
            if !children.is_empty() {
                emit(ResolvedVc::upcast::<Box<dyn IssueProcessingPath>>(
                    ItemIssueProcessingPath::resolved_cell(ItemIssueProcessingPath(
                        Some(IssueProcessingPathItem::resolved_cell(
                            IssueProcessingPathItem {
                                file_path: match file_path.into() {
                                    Some(path) => Some(path.to_resolved().await?),
                                    None => None,
                                },
                                description: ResolvedVc::cell(RcStr::from(description.into())),
                            },
                        )),
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
            let children = self.take_collectibles();
            if !children.is_empty() {
                emit(ResolvedVc::upcast::<Box<dyn IssueProcessingPath>>(
                    ItemIssueProcessingPath::resolved_cell(ItemIssueProcessingPath(
                        Some(IssueProcessingPathItem::resolved_cell(
                            IssueProcessingPathItem {
                                file_path: match file_path.into() {
                                    Some(path) => Some(path.to_resolved().await?),
                                    None => None,
                                },
                                description: ResolvedVc::cell(RcStr::from(description.into())),
                            },
                        )),
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

    async fn peek_issues_with_path(self) -> Result<CapturedIssues> {
        Ok(CapturedIssues {
            issues: self.peek_collectibles(),
            #[cfg(feature = "issue_path")]
            processing_path: ItemIssueProcessingPath::resolved_cell(ItemIssueProcessingPath(
                None,
                self.peek_collectibles(),
            )),
            graphs: self.peek_collectibles(),
        })
    }

    async fn take_issues_with_path(self) -> Result<CapturedIssues> {
        Ok(CapturedIssues {
            issues: self.take_collectibles(),
            #[cfg(feature = "issue_path")]
            processing_path: ItemIssueProcessingPath::resolved_cell(ItemIssueProcessingPath(
                None,
                self.take_collectibles(),
            )),
            graphs: self.take_collectibles(),
        })
    }
}

pub async fn handle_issues<T: Send>(
    source_op: OperationVc<T>,
    issue_reporter: Vc<Box<dyn IssueReporter>>,
    min_failing_severity: Vc<IssueSeverity>,
    path: Option<&str>,
    operation: Option<&str>,
) -> Result<()> {
    let source_vc = source_op.connect();
    let _ = source_op.resolve_strongly_consistent().await?;
    let issues = source_op.peek_issues_with_path().await?;

    let has_fatal = issue_reporter.report_issues(
        TransientInstance::new(issues),
        TransientValue::new(Vc::into_raw(source_vc)),
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

fn find_line_and_column(lines: &[FileLine], offset: u32) -> SourcePos {
    match lines.binary_search_by(|line| line.bytes_offset.cmp(&offset)) {
        Ok(i) => SourcePos {
            line: i as u32,
            column: 0,
        },
        Err(i) => {
            if i == 0 {
                SourcePos {
                    line: 0,
                    column: offset,
                }
            } else {
                let line = &lines[i - 1];
                SourcePos {
                    line: (i - 1) as u32,
                    column: min(line.content.len() as u32, offset - line.bytes_offset),
                }
            }
        }
    }
}

fn find_offset(lines: &[FileLine], pos: SourcePos) -> u32 {
    let line = &lines[pos.line as usize];
    line.bytes_offset + pos.column
}
