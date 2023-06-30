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
pub mod source_maps;
pub mod static_assets;
pub mod wrapping_source;

use std::collections::BTreeSet;

use anyhow::Result;
use futures::{stream::Stream as StreamTrait, TryStreamExt};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::StringVc, trace::TraceRawVcs, util::SharedError, CompletionVc, Value,
};
use turbo_tasks_bytes::{Bytes, Stream, StreamRead};
use turbo_tasks_fs::FileSystemPathVc;
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher, Xxh3Hash64Hasher};
use turbopack_core::version::{Version, VersionVc, VersionedContentVc};

use self::{
    headers::Headers, issue_context::IssueContextContentSourceVc, query::Query,
    route_tree::RouteTreeVc,
};

/// The result of proxying a request to another HTTP server.
#[turbo_tasks::value(shared)]
pub struct ProxyResult {
    /// The HTTP status code to return.
    pub status: u16,
    /// Headers arranged as contiguous (name, value) pairs.
    pub headers: Vec<(String, String)>,
    /// The body to return.
    pub body: Body,
}

#[turbo_tasks::value_impl]
impl Version for ProxyResult {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<StringVc> {
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
        Ok(StringVc::cell(hash.finish().to_string()))
    }
}

/// A functor to receive the actual content of a content source result.
#[turbo_tasks::value_trait]
pub trait GetContentSourceContent {
    /// Specifies data requirements for the get function. Restricting data
    /// passed allows to cache the get method.
    fn vary(&self) -> ContentSourceDataVaryVc {
        ContentSourceDataVary::default().cell()
    }

    /// Get the content
    fn get(&self, path: &str, data: Value<ContentSourceData>) -> ContentSourceContentVc;
}

#[turbo_tasks::value(transparent)]
pub struct GetContentSourceContents(Vec<GetContentSourceContentVc>);

#[turbo_tasks::value]
pub struct StaticContent {
    pub content: VersionedContentVc,
    pub status_code: u16,
    pub headers: HeaderListVc,
}

#[turbo_tasks::value(shared)]
// TODO add Dynamic variant in future to allow streaming and server responses
/// The content of a result that is returned by a content source.
pub enum ContentSourceContent {
    NotFound,
    Static(StaticContentVc),
    HttpProxy(ProxyResultVc),
    Rewrite(RewriteVc),
    /// Continue with the next route
    Next,
}

/// This trait can be emitted as collectible and will be applied after the
/// request is handled and it's ensured that it finishes before the next request
/// is handled.
#[turbo_tasks::value_trait]
pub trait ContentSourceSideEffect {
    fn apply(&self) -> CompletionVc;
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for ContentSourceContent {
    #[turbo_tasks::function]
    fn get(
        self_vc: ContentSourceContentVc,
        _path: &str,
        _data: Value<ContentSourceData>,
    ) -> ContentSourceContentVc {
        self_vc
    }
}

#[turbo_tasks::value_impl]
impl ContentSourceContentVc {
    #[turbo_tasks::function]
    pub fn static_content(content: VersionedContentVc) -> ContentSourceContentVc {
        ContentSourceContent::Static(
            StaticContent {
                content,
                status_code: 200,
                headers: HeaderListVc::empty(),
            }
            .cell(),
        )
        .cell()
    }

    #[turbo_tasks::function]
    pub fn static_with_headers(
        content: VersionedContentVc,
        status_code: u16,
        headers: HeaderListVc,
    ) -> ContentSourceContentVc {
        ContentSourceContent::Static(
            StaticContent {
                content,
                status_code,
                headers,
            }
            .cell(),
        )
        .cell()
    }

    #[turbo_tasks::function]
    pub fn not_found() -> ContentSourceContentVc {
        ContentSourceContent::NotFound.cell()
    }
}

/// A list of headers arranged as contiguous (name, value) pairs.
#[turbo_tasks::value(transparent)]
pub struct HeaderList(Vec<(String, String)>);

#[turbo_tasks::value_impl]
impl HeaderListVc {
    #[turbo_tasks::function]
    pub fn new(headers: Vec<(String, String)>) -> Self {
        HeaderList(headers).cell()
    }

    #[turbo_tasks::function]
    pub fn empty() -> Self {
        HeaderList(vec![]).cell()
    }
}

/// Additional info passed to the ContentSource. It was extracted from the http
/// request.
///
/// Note that you might not receive information that has not been requested via
/// `ContentSource::vary()`. So make sure to request all information that's
/// needed.
#[turbo_tasks::value(shared, serialization = "auto_for_input")]
#[derive(Clone, Debug, PartialOrd, Ord, Hash, Default)]
pub struct ContentSourceData {
    /// HTTP method, if requested.
    pub method: Option<String>,
    /// The full url (including query string), if requested.
    pub url: Option<String>,
    /// The full url (including query string) before rewrites where applied, if
    /// requested.
    pub original_url: Option<String>,
    /// Query string items, if requested.
    pub query: Option<Query>,
    /// raw query string, if requested. Does not include the `?`.
    pub raw_query: Option<String>,
    /// HTTP headers, might contain multiple headers with the same name, if
    /// requested.
    pub headers: Option<Headers>,
    /// Raw HTTP headers, might contain multiple headers with the same name, if
    /// requested.
    pub raw_headers: Option<Vec<(String, String)>>,
    /// Request body, if requested.
    pub body: Option<BodyVc>,
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

impl Default for BodyVc {
    fn default() -> Self {
        Body::default().cell()
    }
}

/// Filter function that describes which information is required.
#[derive(
    Debug, Clone, PartialEq, Eq, TraceRawVcs, Hash, PartialOrd, Ord, Serialize, Deserialize,
)]
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
            *this = other.clone();
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
#[turbo_tasks::value(shared, serialization = "auto_for_input")]
#[derive(Debug, Default, Clone, PartialOrd, Ord, Hash)]
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
    fn get_routes(&self) -> RouteTreeVc;

    /// Gets any content sources wrapped in this content source.
    fn get_children(&self) -> ContentSourcesVc {
        ContentSourcesVc::empty()
    }
}

#[turbo_tasks::value_impl]
impl ContentSourceVc {
    #[turbo_tasks::function]
    pub fn issue_context(self, context: FileSystemPathVc, description: &str) -> ContentSourceVc {
        IssueContextContentSourceVc::new_context(context, description, self).into()
    }
}

#[turbo_tasks::value(transparent)]
pub struct ContentSources(Vec<ContentSourceVc>);

#[turbo_tasks::value_impl]
impl ContentSourcesVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        ContentSourcesVc::cell(Vec::new())
    }
}

/// An empty ContentSource implementation that responds with NotFound for every
/// request.
#[turbo_tasks::value]
pub struct NoContentSource;

#[turbo_tasks::value_impl]
impl NoContentSourceVc {
    #[turbo_tasks::function]
    pub fn new() -> Self {
        NoContentSource.cell()
    }
}
#[turbo_tasks::value_impl]
impl ContentSource for NoContentSource {
    #[turbo_tasks::function]
    fn get_routes(&self) -> RouteTreeVc {
        RouteTreeVc::empty()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs)]
pub enum RewriteType {
    Location {
        /// The new path and query used to lookup content. This _does not_ need
        /// to be the original path or query.
        path_and_query: String,
    },
    ContentSource {
        /// [ContentSourceVc]s from which to restart the lookup
        /// process. This _does not_ need to be the original content
        /// source.
        source: ContentSourceVc,
        /// The new path and query used to lookup content. This _does not_ need
        /// to be the original path or query.
        path_and_query: String,
    },
    Sources {
        /// [GetContentSourceContent]s from which to restart the lookup
        /// process. This _does not_ need to be the original content
        /// source.
        sources: GetContentSourceContentsVc,
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
    pub response_headers: Option<HeaderListVc>,

    /// A [HeaderList] which will overwrite the values used during the lookup
    /// process. All headers not present in this list will be deleted.
    pub request_headers: Option<HeaderListVc>,
}

pub struct RewriteBuilder {
    rewrite: Rewrite,
}

impl RewriteBuilder {
    pub fn new(path_and_query: String) -> Self {
        Self {
            rewrite: Rewrite {
                ty: RewriteType::Location { path_and_query },
                response_headers: None,
                request_headers: None,
            },
        }
    }

    pub fn new_source_with_path_and_query(source: ContentSourceVc, path_and_query: String) -> Self {
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

    pub fn new_sources(sources: GetContentSourceContentsVc) -> Self {
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
    pub fn response_headers(mut self, headers: HeaderListVc) -> Self {
        self.rewrite.response_headers = Some(headers);
        self
    }

    /// Sets request headers to overwrite the headers used during the lookup
    /// process.
    pub fn request_headers(mut self, headers: HeaderListVc) -> Self {
        self.rewrite.request_headers = Some(headers);
        self
    }

    pub fn build(self) -> RewriteVc {
        self.rewrite.cell()
    }
}
