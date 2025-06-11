use hyper::{HeaderMap, Uri};
use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};

use super::Body;

/// A request to a content source.
#[derive(Debug, Clone, NonLocalValue, TraceRawVcs)]
pub struct SourceRequest {
    /// The HTTP method to use.
    pub method: String,
    /// The URI to request.
    #[turbo_tasks(trace_ignore)]
    pub uri: Uri,
    /// The headers to send.
    #[turbo_tasks(trace_ignore)]
    pub headers: HeaderMap<hyper::header::HeaderValue>,
    /// The body to send.
    pub body: Body,
}
