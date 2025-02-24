use std::io::{Error, ErrorKind};

use anyhow::{anyhow, Result};
use auto_hash_map::AutoSet;
use futures::{StreamExt, TryStreamExt};
use hyper::{
    header::{HeaderName, CONTENT_ENCODING, CONTENT_LENGTH},
    http::HeaderValue,
    Request, Response,
};
use mime::Mime;
use tokio_util::io::{ReaderStream, StreamReader};
use turbo_tasks::{
    apply_effects, util::SharedError, CollectiblesSource, OperationVc, ReadRef, TransientInstance,
    Vc,
};
use turbo_tasks_bytes::Bytes;
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    asset::AssetContent,
    issue::{handle_issues, IssueReporter, IssueSeverity},
    version::VersionedContent,
};

use crate::source::{
    request::SourceRequest,
    resolve::{resolve_source_request, ResolveSourceRequestResult},
    Body, ContentSource, ContentSourceSideEffect, HeaderList, ProxyResult,
};

#[turbo_tasks::value(serialization = "none")]
enum GetFromSourceResult {
    Static {
        content: ReadRef<FileContent>,
        status_code: u16,
        headers: ReadRef<HeaderList>,
        header_overwrites: ReadRef<HeaderList>,
    },
    HttpProxy(ReadRef<ProxyResult>),
    NotFound,
}

/// Resolves a [SourceRequest] within a [super::ContentSource], returning the
/// corresponding content as a
#[turbo_tasks::function(operation)]
async fn get_from_source_operation(
    source: OperationVc<Box<dyn ContentSource>>,
    request: TransientInstance<SourceRequest>,
) -> Result<Vc<GetFromSourceResult>> {
    Ok(
        match &*resolve_source_request(source, request).connect().await? {
            ResolveSourceRequestResult::Static(static_content_vc, header_overwrites) => {
                let static_content = static_content_vc.await?;
                if let AssetContent::File(file) = &*static_content.content.content().await? {
                    GetFromSourceResult::Static {
                        content: file.await?,
                        status_code: static_content.status_code,
                        headers: static_content.headers.await?,
                        header_overwrites: header_overwrites.await?,
                    }
                } else {
                    GetFromSourceResult::NotFound
                }
            }
            ResolveSourceRequestResult::HttpProxy(proxy) => {
                GetFromSourceResult::HttpProxy(proxy.connect().await?)
            }
            ResolveSourceRequestResult::NotFound => GetFromSourceResult::NotFound,
        }
        .cell(),
    )
}

/// Processes an HTTP request within a given content source and returns the
/// response.
pub async fn process_request_with_content_source(
    source: OperationVc<Box<dyn ContentSource>>,
    request: Request<hyper::Body>,
    issue_reporter: Vc<Box<dyn IssueReporter>>,
) -> Result<(
    Response<hyper::Body>,
    AutoSet<Vc<Box<dyn ContentSourceSideEffect>>>,
)> {
    let original_path = request.uri().path().to_string();
    let request = http_request_to_source_request(request).await?;
    let result_op = get_from_source_operation(source, TransientInstance::new(request));
    let resolved_result = result_op.resolve_strongly_consistent().await?;
    apply_effects(result_op).await?;
    let side_effects: AutoSet<Vc<Box<dyn ContentSourceSideEffect>>> = result_op.peek_collectibles();
    handle_issues(
        result_op,
        issue_reporter,
        IssueSeverity::Fatal.cell(),
        Some(&original_path),
        Some("get_from_source_operation"),
    )
    .await?;
    match &*resolved_result.await? {
        GetFromSourceResult::Static {
            content,
            status_code,
            headers,
            header_overwrites,
        } => {
            if let FileContent::Content(file) = &**content {
                let mut response = Response::builder().status(*status_code);

                let header_map = response.headers_mut().expect("headers must be defined");

                for (header_name, header_value) in headers {
                    header_map.append(
                        HeaderName::try_from(header_name.as_str())?,
                        hyper::header::HeaderValue::try_from(header_value.as_str())?,
                    );
                }

                for (header_name, header_value) in header_overwrites.iter() {
                    header_map.insert(
                        HeaderName::try_from(header_name.as_str())?,
                        hyper::header::HeaderValue::try_from(header_value.as_str())?,
                    );
                }

                // naively checking if content is `compressible`.
                let mut should_compress = false;
                let should_compress_predicate = |mime: &Mime| {
                    matches!(
                        (mime.type_(), mime.subtype(), mime.suffix()),
                        (_, mime::PLAIN, _)
                            | (_, mime::JSON, _)
                            | (mime::TEXT, _, _)
                            | (mime::APPLICATION, mime::XML, _)
                            | (mime::APPLICATION, mime::JAVASCRIPT, _)
                            | (_, _, Some(mime::XML))
                            | (_, _, Some(mime::JSON))
                            | (_, _, Some(mime::TEXT))
                    )
                };

                if let Some(content_type) = file.content_type() {
                    header_map.append(
                        "content-type",
                        hyper::header::HeaderValue::try_from(content_type.to_string())?,
                    );

                    should_compress = should_compress_predicate(content_type);
                } else if let hyper::header::Entry::Vacant(entry) = header_map.entry("content-type")
                {
                    let guess = mime_guess::from_path(&original_path).first_or_octet_stream();
                    should_compress = should_compress_predicate(&guess);
                    // If a text type, application/javascript, or application/json was
                    // guessed, use a utf-8 charset as we most likely generated it as
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

                if !header_map.contains_key("cache-control") {
                    // The dev server contents might change at any time, we can't cache them.
                    header_map.append(
                        "cache-control",
                        hyper::header::HeaderValue::try_from("must-revalidate")?,
                    );
                }

                let content = file.content();
                let response = if should_compress {
                    header_map.insert(CONTENT_ENCODING, HeaderValue::from_static("gzip"));

                    // Grab ropereader stream, coerce anyhow::Error to std::io::Error
                    let stream_ext = content
                        .read()
                        .into_stream()
                        .map_err(|err| Error::new(ErrorKind::Other, err));

                    let gzipped_stream =
                        ReaderStream::new(async_compression::tokio::bufread::GzipEncoder::new(
                            StreamReader::new(stream_ext),
                        ));

                    response.body(hyper::Body::wrap_stream(gzipped_stream))?
                } else {
                    header_map.insert(
                        CONTENT_LENGTH,
                        hyper::header::HeaderValue::try_from(content.len().to_string())?,
                    );

                    response.body(hyper::Body::wrap_stream(content.read()))?
                };

                return Ok((response, side_effects));
            }
        }
        GetFromSourceResult::HttpProxy(proxy_result) => {
            let mut response = Response::builder().status(proxy_result.status);
            let headers = response.headers_mut().expect("headers must be defined");

            for (name, value) in &proxy_result.headers {
                headers.append(
                    HeaderName::from_bytes(name.as_bytes())?,
                    hyper::header::HeaderValue::from_str(value)?,
                );
            }

            return Ok((
                response.body(hyper::Body::wrap_stream(proxy_result.body.read()))?,
                side_effects,
            ));
        }
        GetFromSourceResult::NotFound => {}
    }

    Ok((
        Response::builder().status(404).body(hyper::Body::empty())?,
        side_effects,
    ))
}

async fn http_request_to_source_request(request: Request<hyper::Body>) -> Result<SourceRequest> {
    let (parts, body) = request.into_parts();

    // For simplicity, we fully consume the body now and early return if there were
    // any errors.
    let bytes: Vec<_> = body
        .map(|bytes| {
            bytes.map_or_else(
                |e| Err(SharedError::new(anyhow!(e))),
                // The outer Ok is consumed by try_collect, but the Body type requires a Result, so
                // we need to double wrap.
                |b| Ok(Ok(Bytes::from(b))),
            )
        })
        .try_collect::<Vec<_>>()
        .await?;

    Ok(SourceRequest {
        method: parts.method.to_string(),
        uri: parts.uri,
        headers: parts.headers,
        body: Body::new(bytes),
    })
}
