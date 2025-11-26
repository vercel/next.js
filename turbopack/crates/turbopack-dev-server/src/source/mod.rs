pub mod asset_graph;
pub mod combined;
pub mod conditional;
pub mod headers;
pub mod issue_context;
pub mod lazy_instantiated;
pub mod query;
pub mod request;
pub(crate) mod resolve;
pub mod route_tree;
pub mod router;
pub mod static_assets;
pub mod wrapping_source;

use std::collections::BTreeSet;

use anyhow::Result;
use futures::{TryStreamExt, stream::Stream as StreamTrait};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Completion, NonLocalValue, OperationVc, ResolvedVc, TaskInput, Upcast, ValueDefault, Vc,
    trace::TraceRawVcs, util::SharedError,
};
use turbo_tasks_bytes::{Bytes, Stream, StreamRead};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher, Xxh3Hash64Hasher};
use turbopack_core::version::{Version, VersionedContent};

use self::{
    headers::Headers, issue_context::IssueFilePathContentSource, query::Query,
    route_tree::RouteTree,
};

/// The result of proxying a request to another HTTP server.
#[turbo_tasks::value(shared, operation)]
pub struct ProxyResult {
    /// The HTTP status code to return.
    pub status: u16,
    /// Headers arranged as contiguous (name, value) pairs.
    pub headers: Vec<(RcStr, RcStr)>,
    /// The body to return.
    #[turbo_tasks(trace_ignore)]
    pub body: Body,
}

#[turbo_tasks::value_impl]
impl Version for ProxyResult {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<Vc<RcStr>> {
        let mut hash = Xxh3Hash64Hasher::new();
        hash.write_u16(self.status);
        for (name, value) in &self.headers {
            name.deterministic_hash(&mut hash);
            value.deterministic_hash(&mut hash);
        }
        let mut read = self.body.read();
        while let Some(chunk) = read.try_next().await? {
            hash.write_bytes(&chunk);
        }
        Ok(Vc::cell(hash.finish().to_string().into()))
    }
}

/// A functor to receive the actual content of a content source result.
#[turbo_tasks::value_trait]
pub trait GetContentSourceContent {
    /// Specifies data requirements for the get function. Restricting data
    /// passed allows to cache the get method.
    #[turbo_tasks::function]
    fn vary(self: Vc<Self>) -> Vc<ContentSourceDataVary> {
        ContentSourceDataVary::default().cell()
    }

    /// Get the content
    #[turbo_tasks::function]
    fn get(self: Vc<Self>, path: RcStr, data: ContentSourceData) -> Vc<ContentSourceContent>;
}

#[turbo_tasks::value(transparent)]
pub struct GetContentSourceContents(Vec<ResolvedVc<Box<dyn GetContentSourceContent>>>);

#[turbo_tasks::value]
pub struct StaticContent {
    pub content: ResolvedVc<Box<dyn VersionedContent>>,
    pub status_code: u16,
    pub headers: ResolvedVc<HeaderList>,
}

#[turbo_tasks::value(shared)]
// TODO add Dynamic variant in future to allow streaming and server responses
/// The content of a result that is returned by a content source.
pub enum ContentSourceContent {
    NotFound,
    Static(ResolvedVc<StaticContent>),
    HttpProxy(OperationVc<ProxyResult>),
    Rewrite(ResolvedVc<Rewrite>),
    /// Continue with the next route
    Next,
}

/// This trait can be emitted as collectible and will be applied after the
/// request is handled and it's ensured that it finishes before the next request
/// is handled.
#[turbo_tasks::value_trait]
pub trait ContentSourceSideEffect {
    #[turbo_tasks::function]
    fn apply(self: Vc<Self>) -> Vc<Completion>;
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for ContentSourceContent {
    #[turbo_tasks::function]
    fn get(self: Vc<Self>, _path: RcStr, _data: ContentSourceData) -> Vc<ContentSourceContent> {
        self
    }
}

#[turbo_tasks::value_impl]
impl ContentSourceContent {
    #[turbo_tasks::function]
    pub async fn static_content(
        content: ResolvedVc<Box<dyn VersionedContent>>,
    ) -> Result<Vc<ContentSourceContent>> {
        Ok(ContentSourceContent::Static(
            StaticContent {
                content,
                status_code: 200,
                headers: HeaderList::empty().to_resolved().await?,
            }
            .resolved_cell(),
        )
        .cell())
    }

    #[turbo_tasks::function]
    pub fn static_with_headers(
        content: ResolvedVc<Box<dyn VersionedContent>>,
        status_code: u16,
        headers: ResolvedVc<HeaderList>,
    ) -> Vc<ContentSourceContent> {
        ContentSourceContent::Static(
            StaticContent {
                content,
                status_code,
                headers,
            }
            .resolved_cell(),
        )
        .cell()
    }

    #[turbo_tasks::function]
    pub fn not_found() -> Vc<ContentSourceContent> {
        ContentSourceContent::NotFound.cell()
    }
}

/// A list of headers arranged as contiguous (name, value) pairs.
#[turbo_tasks::value(transparent)]
pub struct HeaderList(Vec<(RcStr, RcStr)>);

#[turbo_tasks::value_impl]
impl HeaderList {
    #[turbo_tasks::function]
    pub fn new(headers: Vec<(RcStr, RcStr)>) -> Vc<Self> {
        HeaderList(headers).cell()
    }

    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        HeaderList(vec![]).cell()
    }
}

/// Additional info passed to the ContentSource. It was extracted from the http
/// request.
///
/// Note that you might not receive information that has not been requested via
/// `ContentSource::vary()`. So make sure to request all information that's
/// needed.
#[derive(
    PartialEq,
    Eq,
    NonLocalValue,
    TraceRawVcs,
    Serialize,
    Deserialize,
    Clone,
    Debug,
    Hash,
    Default,
    TaskInput,
)]
pub struct ContentSourceData {
    /// HTTP method, if requested.
    pub method: Option<RcStr>,
    /// The full url (including query string), if requested.
    pub url: Option<RcStr>,
    /// The full url (including query string) before rewrites where applied, if
    /// requested.
    pub original_url: Option<RcStr>,
    /// Query string items, if requested.
    pub query: Option<Query>,
    /// raw query string, if requested. Does not include the `?`.
    pub raw_query: Option<RcStr>,
    /// HTTP headers, might contain multiple headers with the same name, if
    /// requested.
    pub headers: Option<Headers>,
    /// Raw HTTP headers, might contain multiple headers with the same name, if
    /// requested.
    pub raw_headers: Option<Vec<(RcStr, RcStr)>>,
    /// Request body, if requested.
    pub body: Option<ResolvedVc<Body>>,
    /// See [ContentSourceDataVary::cache_buster].
    pub cache_buster: u64,
}

pub type BodyChunk = Result<Bytes, SharedError>;

/// A request body.
#[turbo_tasks::value(shared)]
#[derive(Default, Clone, Debug)]
pub struct Body {
    #[turbo_tasks(trace_ignore)]
    chunks: Stream<BodyChunk>,
}

impl Body {
    /// Creates a new body from a list of chunks.
    pub fn new(chunks: Vec<BodyChunk>) -> Self {
        Self {
            chunks: Stream::new_closed(chunks),
        }
    }

    /// Returns an iterator over the body's chunks.
    pub fn read(&self) -> StreamRead<BodyChunk> {
        self.chunks.read()
    }

    pub fn from_stream<T: StreamTrait<Item = BodyChunk> + Send + Unpin + 'static>(
        source: T,
    ) -> Self {
        Self {
            chunks: Stream::from(source),
        }
    }
}

impl<T: Into<Bytes>> From<T> for Body {
    fn from(value: T) -> Self {
        Body::new(vec![Ok(value.into())])
    }
}

impl ValueDefault for Body {
    fn value_default() -> Vc<Self> {
        Body::default().cell()
    }
}

/// Filter function that describes which information is required.
#[derive(Debug, Clone, PartialEq, Eq, TraceRawVcs, Hash, Serialize, Deserialize, NonLocalValue)]
pub enum ContentSourceDataFilter {
    All,
    Subset(BTreeSet<String>),
}

impl ContentSourceDataFilter {
    /// Merges the filtering to get a filter that covers both filters.
    pub fn extend(&mut self, other: &ContentSourceDataFilter) {
        match self {
            ContentSourceDataFilter::All => {}
            ContentSourceDataFilter::Subset(set) => match other {
                ContentSourceDataFilter::All => *self = ContentSourceDataFilter::All,
                ContentSourceDataFilter::Subset(set2) => set.extend(set2.iter().cloned()),
            },
        }
    }

    /// Merges the filtering to get a filter that covers both filters. Works on
    /// Option<DataFilter> where None is considers as empty filter.
    pub fn extend_options(
        this: &mut Option<ContentSourceDataFilter>,
        other: &Option<ContentSourceDataFilter>,
    ) {
        if let Some(this) = this.as_mut() {
            if let Some(other) = other.as_ref() {
                this.extend(other);
            }
        } else {
            this.clone_from(other);
        }
    }

    /// Returns true if the filter contains the given key.
    pub fn contains(&self, key: &str) -> bool {
        match self {
            ContentSourceDataFilter::All => true,
            ContentSourceDataFilter::Subset(set) => set.contains(key),
        }
    }

    /// Returns true if the first argument at least contains all values that the
    /// second argument would contain.
    pub fn fulfills(
        this: &Option<ContentSourceDataFilter>,
        other: &Option<ContentSourceDataFilter>,
    ) -> bool {
        match (this, other) {
            (_, None) => true,
            (None, Some(_)) => false,
            (Some(this), Some(other)) => match (this, other) {
                (ContentSourceDataFilter::All, _) => true,
                (_, ContentSourceDataFilter::All) => false,
                (ContentSourceDataFilter::Subset(this), ContentSourceDataFilter::Subset(other)) => {
                    this.is_superset(other)
                }
            },
        }
    }
}

/// Describes additional information that need to be sent to requests to
/// ContentSource. By sending these information ContentSource responses are
/// cached-keyed by them and they can access them.
#[turbo_tasks::value(shared)]
#[derive(Debug, Default, Clone, Hash)]
pub struct ContentSourceDataVary {
    pub method: bool,
    pub url: bool,
    pub original_url: bool,
    pub query: Option<ContentSourceDataFilter>,
    pub raw_query: bool,
    pub headers: Option<ContentSourceDataFilter>,
    pub raw_headers: bool,
    pub body: bool,
    /// When true, a `cache_buster` value is added to the [ContentSourceData].
    /// This value will be different on every request, which ensures the
    /// content is never cached.
    pub cache_buster: bool,
    pub placeholder_for_future_extensions: (),
}

impl ContentSourceDataVary {
    /// Merges two vary specification to create a combination of both that cover
    /// all information requested by either one
    pub fn extend(&mut self, other: &ContentSourceDataVary) {
        let ContentSourceDataVary {
            method,
            url,
            original_url,
            query,
            raw_query,
            headers,
            raw_headers,
            body,
            cache_buster,
            placeholder_for_future_extensions: _,
        } = self;
        *method = *method || other.method;
        *url = *url || other.url;
        *original_url = *original_url || other.original_url;
        *body = *body || other.body;
        *cache_buster = *cache_buster || other.cache_buster;
        *raw_query = *raw_query || other.raw_query;
        *raw_headers = *raw_headers || other.raw_headers;
        ContentSourceDataFilter::extend_options(query, &other.query);
        ContentSourceDataFilter::extend_options(headers, &other.headers);
    }

    /// Returns true if `self` at least contains all values that the
    /// argument would contain.
    pub fn fulfills(&self, other: &ContentSourceDataVary) -> bool {
        // All fields must be used!
        let ContentSourceDataVary {
            method,
            url,
            original_url,
            query,
            raw_query,
            headers,
            raw_headers,
            body,
            cache_buster,
            placeholder_for_future_extensions: _,
        } = self;
        if other.method && !method {
            return false;
        }
        if other.url && !url {
            return false;
        }
        if other.original_url && !original_url {
            return false;
        }
        if other.body && !body {
            return false;
        }
        if other.raw_query && !raw_query {
            return false;
        }
        if other.raw_headers && !raw_headers {
            return false;
        }
        if other.cache_buster && !cache_buster {
            return false;
        }
        if !ContentSourceDataFilter::fulfills(query, &other.query) {
            return false;
        }
        if !ContentSourceDataFilter::fulfills(headers, &other.headers) {
            return false;
        }
        true
    }
}

/// A source of content that the dev server uses to respond to http requests.
#[turbo_tasks::value_trait]
pub trait ContentSource {
    #[turbo_tasks::function]
    fn get_routes(self: Vc<Self>) -> Vc<RouteTree>;

    /// Gets any content sources wrapped in this content source.
    #[turbo_tasks::function]
    fn get_children(self: Vc<Self>) -> Vc<ContentSources> {
        ContentSources::empty()
    }
}

pub trait ContentSourceExt {
    fn issue_file_path(
        self: Vc<Self>,
        file_path: FileSystemPath,
        description: RcStr,
    ) -> Vc<Box<dyn ContentSource>>;
}

impl<T> ContentSourceExt for T
where
    T: Upcast<Box<dyn ContentSource>>,
{
    fn issue_file_path(
        self: Vc<Self>,
        file_path: FileSystemPath,
        description: RcStr,
    ) -> Vc<Box<dyn ContentSource>> {
        Vc::upcast(IssueFilePathContentSource::new_file_path(
            file_path,
            description,
            Vc::upcast_non_strict(self),
        ))
    }
}

#[turbo_tasks::value(transparent)]
pub struct ContentSources(Vec<ResolvedVc<Box<dyn ContentSource>>>);

#[turbo_tasks::value_impl]
impl ContentSources {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}

/// An empty ContentSource implementation that responds with NotFound for every
/// request.
#[turbo_tasks::value]
pub struct NoContentSource;

#[turbo_tasks::value_impl]
impl NoContentSource {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        NoContentSource.cell()
    }
}
#[turbo_tasks::value_impl]
impl ContentSource for NoContentSource {
    #[turbo_tasks::function]
    fn get_routes(&self) -> Vc<RouteTree> {
        RouteTree::empty()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub enum RewriteType {
    Location {
        /// The new path and query used to lookup content. This _does not_ need to be the original
        /// path or query.
        path_and_query: RcStr,
    },
    ContentSource {
        /// [`ContentSource`]s from which to restart the lookup process. This _does not_ need to be
        /// the original content source.
        source: OperationVc<Box<dyn ContentSource>>,
        /// The new path and query used to lookup content. This _does not_ need
        /// to be the original path or query.
        path_and_query: RcStr,
    },
    Sources {
        /// [`GetContentSourceContent`]s from which to restart the lookup process. This _does not_
        /// need to be the original content source.
        sources: OperationVc<GetContentSourceContents>,
    },
}

/// A rewrite returned from a [ContentSource]. This tells the dev server to
/// update its parsed url, path, and queries with this new information.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct Rewrite {
    pub ty: RewriteType,

    /// A [Headers] which will be appended to the eventual, fully resolved
    /// content result. This overwrites any previous matching headers.
    pub response_headers: Option<ResolvedVc<HeaderList>>,

    /// A [HeaderList] which will overwrite the values used during the lookup
    /// process. All headers not present in this list will be deleted.
    pub request_headers: Option<ResolvedVc<HeaderList>>,
}

pub struct RewriteBuilder {
    rewrite: Rewrite,
}

impl RewriteBuilder {
    pub fn new(path_and_query: RcStr) -> Self {
        Self {
            rewrite: Rewrite {
                ty: RewriteType::Location { path_and_query },
                response_headers: None,
                request_headers: None,
            },
        }
    }

    pub fn new_source_with_path_and_query(
        source: OperationVc<Box<dyn ContentSource>>,
        path_and_query: RcStr,
    ) -> Self {
        Self {
            rewrite: Rewrite {
                ty: RewriteType::ContentSource {
                    source,
                    path_and_query,
                },
                response_headers: None,
                request_headers: None,
            },
        }
    }

    pub fn new_sources(sources: OperationVc<GetContentSourceContents>) -> Self {
        Self {
            rewrite: Rewrite {
                ty: RewriteType::Sources { sources },
                response_headers: None,
                request_headers: None,
            },
        }
    }

    /// Sets response headers to append to the eventual, fully resolved content
    /// result.
    pub fn response_headers(mut self, headers: ResolvedVc<HeaderList>) -> Self {
        self.rewrite.response_headers = Some(headers);
        self
    }

    /// Sets request headers to overwrite the headers used during the lookup
    /// process.
    pub fn request_headers(mut self, headers: ResolvedVc<HeaderList>) -> Self {
        self.rewrite.request_headers = Some(headers);
        self
    }

    pub fn build(self) -> Vc<Rewrite> {
        self.rewrite.cell()
    }
}
