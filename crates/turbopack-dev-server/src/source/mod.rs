pub mod asset_graph;
pub mod combined;
pub mod conditional;
pub mod headers;
pub mod lazy_instatiated;
pub mod query;
pub mod router;
pub mod source_maps;
pub mod specificity;
pub mod static_assets;

use std::collections::BTreeSet;

use anyhow::Result;
use serde::{Deserialize, Serialize, Serializer};
use turbo_tasks::{trace::TraceRawVcs, Value};
use turbo_tasks_fs::rope::Rope;
use turbopack_core::version::VersionedContentVc;

use self::{headers::Headers, query::Query, specificity::SpecificityVc};

/// The result of proxying a request to another HTTP server.
#[turbo_tasks::value(shared)]
pub struct ProxyResult {
    /// The HTTP status code to return.
    pub status: u16,
    /// Headers arranged as contiguous (name, value) pairs.
    pub headers: Vec<String>,
    /// The body to return.
    pub body: Rope,
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

#[turbo_tasks::value(shared)]
#[derive(Debug)]
// TODO add Dynamic variant in future to allow streaming and server responses
/// The content of a result that is returned by a content source.
pub enum ContentSourceContent {
    NotFound,
    Static(VersionedContentVc),
    HttpProxy(ProxyResultVc),
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
    pub fn not_found() -> ContentSourceContentVc {
        ContentSourceContent::NotFound.cell()
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

impl From<VersionedContentVc> for ContentSourceContentVc {
    fn from(content: VersionedContentVc) -> Self {
        ContentSourceContent::Static(content).cell()
    }
}

/// Additional info passed to the ContentSource. It was extracted from the http
/// request.
///
/// Note that you might not receive information that has not been requested via
/// `ContentSource::vary()`. So make sure to request all information that's
/// needed.
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Clone, Debug, PartialOrd, Ord, Hash, Default)]
pub struct ContentSourceData {
    /// http method, if requested
    pub method: Option<String>,
    /// The full url (including query string), if requested
    pub url: Option<String>,
    /// query string items, if requested
    pub query: Option<Query>,
    /// http headers, might contain multiple headers with the same name, if
    /// requested
    pub headers: Option<Headers>,
    /// request body, if requested
    pub body: Option<BodyVc>,
    /// see [ContentSourceDataVary::cache_buster]
    pub cache_buster: u64,
}

/// A request body.
#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct Body {
    #[turbo_tasks(debug_ignore, trace_ignore)]
    chunks: Vec<Bytes>,
}

impl Body {
    /// Creates a new body from a list of chunks.
    pub fn new(chunks: Vec<Bytes>) -> Self {
        Self { chunks }
    }

    /// Returns an iterator over the body's chunks.
    pub fn chunks(&self) -> impl Iterator<Item = &Bytes> {
        self.chunks.iter()
    }
}

/// A wrapper around [hyper::body::Bytes] that implements [Serialize] and
/// [Deserialize].
#[derive(Clone, Eq, PartialEq)]
pub struct Bytes(hyper::body::Bytes);

impl Bytes {
    /// Returns the bytes as a slice.
    pub fn as_bytes(&self) -> &[u8] {
        self.0.as_ref()
    }
}

impl From<hyper::body::Bytes> for Bytes {
    fn from(bytes: hyper::body::Bytes) -> Self {
        Self(bytes)
    }
}

impl Serialize for Bytes {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_bytes(self.0.as_ref())
    }
}

impl<'de> Deserialize<'de> for Bytes {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let bytes = Vec::<u8>::deserialize(deserializer)?;
        Ok(Bytes(hyper::body::Bytes::from(bytes)))
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
    pub headers: Option<ContentSourceDataFilter>,
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
        self.method = self.method || other.method;
        self.url = self.url || other.url;
        self.body = self.body || other.body;
        self.cache_buster = self.cache_buster || other.cache_buster;
        ContentSourceDataFilter::extend_options(&mut self.query, &other.query);
        ContentSourceDataFilter::extend_options(&mut self.headers, &other.headers);
    }

    /// Returns true if `self` at least contains all values that the
    /// argument would contain.
    pub fn fulfills(&self, other: &ContentSourceDataVary) -> bool {
        // All fields must be used!
        let ContentSourceDataVary {
            method,
            url,
            query,
            headers,
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
