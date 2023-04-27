use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::primitives::JsonValueReadRef;

use crate::{route_matcher::Param, ResponseHeaders, StructuredError};

pub(crate) mod error_page;
pub mod issue;
pub mod node_api_source;
pub mod render_proxy;
pub mod render_static;
pub mod rendered_source;

#[turbo_tasks::value(shared)]
#[serde(rename_all = "camelCase")]
pub struct RenderData {
    params: IndexMap<String, Param>,
    method: String,
    url: String,
    raw_query: String,
    raw_headers: Vec<(String, String)>,
    path: String,
    data: Option<JsonValueReadRef>,
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

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RenderProxyIncomingMessage {
    Headers { data: ResponseHeaders },
    BodyChunk { data: Vec<u8> },
    BodyEnd,
    Error(StructuredError),
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RenderStaticIncomingMessage {
    #[serde(rename_all = "camelCase")]
    Response {
        status_code: u16,
        headers: Vec<(String, String)>,
        body: String,
    },
    Headers {
        data: ResponseHeaders,
    },
    BodyChunk {
        data: Vec<u8>,
    },
    BodyEnd,
    Rewrite {
        path: String,
    },
    Error(StructuredError),
}
