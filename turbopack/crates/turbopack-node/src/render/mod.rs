use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ReadRef};

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
    params: FxIndexMap<RcStr, Param>,
    method: RcStr,
    url: RcStr,
    original_url: RcStr,
    raw_query: RcStr,
    raw_headers: Vec<(RcStr, RcStr)>,
    path: RcStr,
    data: Option<ReadRef<JsonValue>>,
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
        headers: Vec<(RcStr, RcStr)>,
        body: RcStr,
    },
    Headers {
        data: ResponseHeaders,
    },
    BodyChunk {
        data: Vec<u8>,
    },
    BodyEnd,
    Rewrite {
        path: RcStr,
    },
    Error(StructuredError),
}
