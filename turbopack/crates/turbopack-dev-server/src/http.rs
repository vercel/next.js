use std::io::Read;

use anyhow::{Result, anyhow};
use auto_hash_map::AutoSet;
use flate2::{Compression, bufread::GzEncoder};
use futures::TryStreamExt;
use http_body_util::BodyExt;
use hyper::{
    Request, Response,
    body::Incoming,
    header::{CONTENT_ENCODING, CONTENT_LENGTH, HeaderName, HeaderValue},
};
use mime::Mime;
use turbo_tasks::{
    CollectiblesSource, OperationVc, ReadRef, ResolvedVc, TransientInstance, Vc, apply_effects,
};
use turbo_tasks_bytes::Bytes;
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    asset::AssetContent,
    issue::{IssueReporter, IssueSeverity, handle_issues},
    version::VersionedContent,
};

use crate::{
    ResponseBody, empty_body, full_body,
    source::{
        Body, ContentSource, ContentSourceSideEffect, HeaderList, ProxyResult,
        request::SourceRequest,
        resolve::{ResolveSourceRequestResult, resolve_source_request},
    },
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
    request: Request<Incoming>,
    issue_reporter: Vc<Box<dyn IssueReporter>>,
) -> Result<(
    Response<ResponseBody>,
    AutoSet<ResolvedVc<Box<dyn ContentSourceSideEffect>>>,
)> {
    let original_path = request.uri().path().to_string();
    let request = http_request_to_source_request(request).await?;
    let result_op = get_from_source_operation(source, TransientInstance::new(request));
    let resolved_result = result_op.resolve_strongly_consistent().await?;
    apply_effects(result_op).await?;
    let side_effects: AutoSet<ResolvedVc<Box<dyn ContentSourceSideEffect>>> =
        result_op.peek_collectibles();
    handle_issues(
        result_op,
        issue_reporter,
        IssueSeverity::Fatal,
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
                        HeaderValue::try_from(header_value.as_str())?,
                    );
                }

                for (header_name, header_value) in header_overwrites.iter() {
                    header_map.insert(
                        HeaderName::try_from(header_name.as_str())?,
                        HeaderValue::try_from(header_value.as_str())?,
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
                        HeaderValue::try_from(content_type.to_string())?,
                    );

                    should_compress = should_compress_predicate(content_type);
                } else if let hyper::header::Entry::Vacant(entry) = header_map.entry("content-type")
                {
                    let guess = mime_guess::from_path(&original_path).first_or_octet_stream();
                    should_compress = should_compress_predicate(&guess);
                    // If a text type, application/javascript, or application/json was
                    // guessed, use a utf-8 charset as we most likely generated it as
                    // such.
                    entry.insert(HeaderValue::try_from(
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
                    header_map.append("cache-control", HeaderValue::try_from("must-revalidate")?);
                }

                let content = file.content();
                let response = if should_compress {
                    header_map.insert(CONTENT_ENCODING, HeaderValue::from_static("gzip"));

                    let mut gz_bytes = Vec::new();
                    GzEncoder::new(content.read(), Compression::fast())
                        .read_to_end(&mut gz_bytes)
                        .expect("read of Rope should never fail");
                    response.body(full_body(gz_bytes))?
                } else {
                    let mut all_bytes = Vec::new();
                    for chunk in content.read() {
                        all_bytes.extend_from_slice(chunk);
                    }
                    header_map.insert(
                        CONTENT_LENGTH,
                        HeaderValue::try_from(all_bytes.len().to_string())?,
                    );
                    response.body(full_body(all_bytes))?
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
                    HeaderValue::from_str(value)?,
                );
            }

            // Collect proxy body from async stream into bytes
            let mut body_bytes = Vec::new();
            let mut body_stream = proxy_result.body.read();
            while let Some(chunk) = body_stream.try_next().await? {
                body_bytes.extend_from_slice(&chunk);
            }

            return Ok((response.body(full_body(body_bytes))?, side_effects));
        }
        GetFromSourceResult::NotFound => {}
    }

    Ok((
        Response::builder().status(404).body(empty_body())?,
        side_effects,
    ))
}

async fn http_request_to_source_request(request: Request<Incoming>) -> Result<SourceRequest> {
    let (parts, body) = request.into_parts();

    // Collect the entire body
    let collected = body
        .collect()
        .await
        .map_err(|e| anyhow!("failed to collect request body: {e}"))?;
    let body_bytes = collected.to_bytes();
    let bytes = if body_bytes.is_empty() {
        vec![]
    } else {
        vec![Ok(Bytes::from(body_bytes))]
    };

    Ok(SourceRequest {
        method: parts.method.to_string(),
        uri: parts.uri,
        headers: parts.headers,
        body: Body::new(bytes),
    })
}
