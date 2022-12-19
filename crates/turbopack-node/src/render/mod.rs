use std::collections::BTreeMap;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbopack_dev_server::source::{query::Query, HeaderValue};

use crate::{ResponseHeaders, StructuredError};

pub mod issue;
pub mod node_api_source;
pub mod render_proxy;
pub mod render_static;
pub mod rendered_source;

#[turbo_tasks::value(shared)]
pub struct RenderData {
    params: IndexMap<String, String>,
    method: String,
    url: String,
    query: Query,
    headers: BTreeMap<String, HeaderValue>,
    path: String,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RenderStaticOutgoingMessage<'a> {
    Headers { data: &'a RenderData },
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RenderProxyOutgoingMessage<'a> {
    Headers { data: &'a RenderData },
    BodyChunk { data: &'a [u8] },
    BodyEnd,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RenderProxyIncomingMessage {
    Headers { data: ResponseHeaders },
    Body { data: Vec<u8> },
    Error(StructuredError),
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RenderStaticIncomingMessage {
    Result { result: RenderResult },
    Error(StructuredError),
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum RenderResult {
    Simple(String),
    Advanced {
        body: String,
        #[serde(rename = "contentType")]
        content_type: Option<String>,
    },
}
