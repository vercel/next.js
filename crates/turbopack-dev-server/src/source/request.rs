use hyper::{HeaderMap, Uri};

use super::Body;

/// A request to a content source.
#[derive(Debug, Clone)]
pub struct SourceRequest {
    /// The HTTP method to use.
    pub method: String,
    /// The URI to request.
    pub uri: Uri,
    /// The headers to send.
    pub headers: HeaderMap<hyper::header::HeaderValue>,
    /// The body to send.
    pub body: Body,
}
