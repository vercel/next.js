pub mod asset_graph;
pub mod combined;
pub mod conditional;
pub mod headers;
pub mod issue_context;
pub mod lazy_instantiated;
pub mod query;
pub mod request;
pub(crate) mod resolve;
pub mod router;
pub mod source_maps;
pub mod specificity;
pub mod static_assets;
pub mod wrapping_source;

use std::collections::BTreeSet;

use anyhow::Result;
use futures::{stream::Stream as StreamTrait, TryStreamExt};
use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::StringVc, trace::TraceRawVcs, util::SharedError, Value};
use turbo_tasks_bytes::{Bytes, Stream, StreamRead};
use turbo_tasks_fs::FileSystemPathVc;
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher, Xxh3Hash64Hasher};
use turbopack_core::version::{Version, VersionVc, VersionedContentVc};

use self::{
    headers::Headers, issue_context::IssueContextContentSourceVc, query::Query,
    specificity::SpecificityVc,
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

/// The return value of a content source when getting a path. A specificity is
/// attached and when combining results this specificity should be used to order
/// results.
#[turbo_tasks::value(shared)]
pub enum ContentSourceResult {
    NotFound,
    NeedData(NeededData),
    Result {
        specificity: SpecificityVc,
        get_content: GetContentSourceContentVc,
    },
}

#[turbo_tasks::value_impl]
impl ContentSource for ContentSourceResult {
    #[turbo_tasks::function]
    fn get(
        self_vc: ContentSourceResultVc,
        _path: &str,
        _data: Value<ContentSourceData>,
    ) -> ContentSourceResultVc {
        self_vc
    }
}

#[turbo_tasks::value_impl]
impl ContentSourceResultVc {
    /// Wraps some content source content with exact match specificity.
    #[turbo_tasks::function]
    pub fn exact(get_content: GetContentSourceContentVc) -> ContentSourceResultVc {
        ContentSourceResult::Result {
            specificity: SpecificityVc::exact(),
            get_content,
        }
        .cell()
    }

    /// Wraps some content source content with exact match specificity.
    #[turbo_tasks::function]
    pub fn need_data(data: Value<NeededData>) -> ContentSourceResultVc {
        ContentSourceResult::NeedData(data.into_value()).cell()
    }

    /// Result when no match was found with the lowest specificity.
    #[turbo_tasks::function]
    pub fn not_found() -> ContentSourceResultVc {
        ContentSourceResult::NotFound.cell()
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
    fn get(&self, data: Value<ContentSourceData>) -> ContentSourceContentVc;
}

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
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for ContentSourceContent {
    #[turbo_tasks::function]
    fn get(
        self_vc: ContentSourceContentVc,
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

/// Needed data content signals that the content source requires more
/// information in order to serve the request. The held data allows us to
/// partially compute some data, and resume computation after the needed vary
/// data is supplied by the dev server.
#[turbo_tasks::value(shared, serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub struct NeededData {
    /// A [ContentSource] to query once the data has been extracted from the
    /// server. This _does not_ need to be the original content source.
    pub source: ContentSourceVc,

    /// A path with which to call into that content source. This _does not_ need
    /// to be the original path.
    pub path: String,

    /// The vary data which is needed in order to process the request.
    pub vary: ContentSourceDataVary,
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
    /// Gets content by `path` and request `data` from the source. `data` is
    /// empty by default and will only be filled when returning `NeedData`.
    /// This is useful as this method call will be cached based on it's
    /// arguments, so we want to make the arguments contain as little
    /// information as possible to increase cache hit ratio.
    fn get(&self, path: &str, data: Value<ContentSourceData>) -> ContentSourceResultVc;

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
    fn get(&self, _path: &str, _data: Value<ContentSourceData>) -> ContentSourceResultVc {
        ContentSourceResultVc::not_found()
    }
}

/// A rewrite returned from a [ContentSource]. This tells the dev server to
/// update its parsed url, path, and queries with this new information, and any
/// later [NeededData] will receive data out of these new values.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct Rewrite {
    /// The new path and query used to lookup content. This _does not_ need to
    /// be the original path or query.
    pub path_and_query: String,

    /// A [ContentSource] from which to restart the lookup process. This _does
    /// not_ need to be the original content source. Having [None] source will
    /// restart the lookup process from the original root ContentSource.
    pub source: Option<ContentSourceVc>,

    /// A [Headers] which will be appended to the eventual, fully resolved
    /// content result. This overwrites any previous matching headers.
    pub response_headers: Option<HeaderListVc>,
}

pub struct RewriteBuilder {
    rewrite: Rewrite,
}

impl RewriteBuilder {
    pub fn new(path_and_query: String) -> Self {
        Self {
            rewrite: Rewrite {
                path_and_query,
                source: None,
                response_headers: None,
            },
        }
    }

    /// Sets the [ContentSource] from which to restart the lookup process.
    /// Without a source, the lookup will restart from the original root
    /// ContentSource.
    pub fn content_source(mut self, source: ContentSourceVc) -> Self {
        self.rewrite.source = Some(source);
        self
    }

    /// Sets response headers to append to the eventual, fully resolved content
    /// result.
    pub fn response_headers(mut self, headers: HeaderListVc) -> Self {
        self.rewrite.response_headers = Some(headers);
        self
    }

    pub fn build(self) -> RewriteVc {
        self.rewrite.cell()
    }
}
