use anyhow::Result;
use futures::{StreamExt, TryStreamExt};
use hyper::{header::HeaderName, Request, Response};
use mime_guess::mime;
use turbo_tasks::TransientInstance;
use turbo_tasks_fs::{FileContent, FileContentReadRef};
use turbopack_cli_utils::issue::ConsoleUiVc;
use turbopack_core::{asset::AssetContent, version::VersionedContent};

use crate::source::{
    request::SourceRequest,
    resolve::{resolve_source_request, ResolveSourceRequestResult},
    Body, Bytes, ContentSourceVc, HeaderListReadRef, ProxyResultReadRef,
};

#[turbo_tasks::value(serialization = "none")]
enum GetFromSourceResult {
    Static {
        content: FileContentReadRef,
        status_code: u16,
        headers: HeaderListReadRef,
    },
    HttpProxy(ProxyResultReadRef),
    NotFound,
}

/// Resolves a [SourceRequest] within a [super::ContentSource], returning the
/// corresponding content as a
#[turbo_tasks::function]
async fn get_from_source(
    source: ContentSourceVc,
    request: TransientInstance<SourceRequest>,
    console_ui: ConsoleUiVc,
) -> Result<GetFromSourceResultVc> {
    Ok(
        match &*resolve_source_request(source, request, console_ui).await? {
            ResolveSourceRequestResult::Static(static_content_vc) => {
                let static_content = static_content_vc.await?;
                if let AssetContent::File(file) = &*static_content.content.content().await? {
                    GetFromSourceResult::Static {
                        content: file.await?,
                        status_code: static_content.status_code,
                        headers: static_content.headers.await?,
                    }
                } else {
                    GetFromSourceResult::NotFound
                }
            }
            ResolveSourceRequestResult::HttpProxy(proxy) => {
                GetFromSourceResult::HttpProxy(proxy.await?)
            }
            ResolveSourceRequestResult::NotFound => GetFromSourceResult::NotFound,
        }
        .cell(),
    )
}

/// Processes an HTTP request within a given content source and returns the
/// response.
pub async fn process_request_with_content_source(
    source: ContentSourceVc,
    request: Request<hyper::Body>,
    console_ui: ConsoleUiVc,
) -> Result<Response<hyper::Body>> {
    let original_path = request.uri().path().to_string();
    let request = http_request_to_source_request(request).await?;
    let result = get_from_source(source, TransientInstance::new(request), console_ui);
    match &*result.strongly_consistent().await? {
        GetFromSourceResult::Static {
            content,
            status_code,
            headers,
        } => {
            if let FileContent::Content(file) = &**content {
                let mut response = Response::builder().status(*status_code);

                let header_map = response.headers_mut().expect("headers must be defined");

                for (header_name, header_value) in headers {
                    header_map.append(
                        HeaderName::try_from(header_name.clone())?,
                        hyper::header::HeaderValue::try_from(header_value.as_str())?,
                    );
                }

                if let Some(content_type) = file.content_type() {
                    header_map.append(
                        "content-type",
                        hyper::header::HeaderValue::try_from(content_type.to_string())?,
                    );
                } else if let hyper::header::Entry::Vacant(entry) = header_map.entry("content-type")
                {
                    let guess = mime_guess::from_path(&original_path).first_or_octet_stream();
                    // If a text type, application/javascript, or application/json was
                    // guessed, use a utf-8 charset as  we most likely generated it as
                    // such.
                    entry.insert(hyper::header::HeaderValue::try_from(
                        if (guess.type_() == mime::TEXT
                            || guess.subtype() == mime::JAVASCRIPT
                            || guess.subtype() == mime::JSON)
                            && guess.get_param("charset").is_none()
                        {
                            guess.to_string() + "; charset=utf-8"
                        } else {
                            guess.to_string()
                        },
                    )?);
                }

                let content = file.content();
                header_map.insert(
                    "Content-Length",
                    hyper::header::HeaderValue::try_from(content.len().to_string())?,
                );

                let bytes = content.read();
                return Ok(response.body(hyper::Body::wrap_stream(bytes))?);
            }
        }
        GetFromSourceResult::HttpProxy(proxy_result) => {
            let mut response = Response::builder().status(proxy_result.status);
            let headers = response.headers_mut().expect("headers must be defined");

            for [name, value] in proxy_result.headers.array_chunks() {
                headers.append(
                    HeaderName::from_bytes(name.as_bytes())?,
                    hyper::header::HeaderValue::from_str(value)?,
                );
            }

            return Ok(response.body(hyper::Body::wrap_stream(proxy_result.body.read()))?);
        }
        _ => {}
    }

    Ok(Response::builder().status(404).body(hyper::Body::empty())?)
}

async fn http_request_to_source_request(request: Request<hyper::Body>) -> Result<SourceRequest> {
    let (parts, body) = request.into_parts();

    let bytes: Vec<_> = body
        .map(|bytes| bytes.map(Bytes::from))
        .try_collect::<Vec<_>>()
        .await?;

    Ok(SourceRequest {
        method: parts.method.to_string(),
        uri: parts.uri,
        headers: parts.headers,
        body: Body::new(bytes),
    })
}
