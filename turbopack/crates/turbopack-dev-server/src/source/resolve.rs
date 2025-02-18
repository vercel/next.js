use std::{
    collections::btree_map::Entry,
    sync::atomic::{AtomicU64, Ordering},
};

use anyhow::Result;
use hyper::{
    header::{HeaderName as HyperHeaderName, HeaderValue as HyperHeaderValue},
    Uri,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{OperationVc, ResolvedVc, TransientInstance, Value, Vc};

use super::{
    headers::{HeaderValue, Headers},
    query::Query,
    request::SourceRequest,
    route_tree::RouteTree,
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataVary,
    GetContentSourceContent, GetContentSourceContents, HeaderList, ProxyResult, RewriteType,
    StaticContent,
};

/// The result of [`resolve_source_request`]. Similar to a
/// `ContentSourceContent`, but without the `Rewrite` variant as this is taken
/// care in the function.
#[turbo_tasks::value(serialization = "none")]
pub enum ResolveSourceRequestResult {
    NotFound,
    Static(ResolvedVc<StaticContent>, ResolvedVc<HeaderList>),
    HttpProxy(OperationVc<ProxyResult>),
}

#[turbo_tasks::function(operation)]
fn content_source_get_routes_operation(
    source: OperationVc<Box<dyn ContentSource>>,
) -> Vc<RouteTree> {
    source.connect().get_routes()
}

#[turbo_tasks::function(operation)]
fn route_tree_get_operation(
    route_tree: ResolvedVc<RouteTree>,
    asset_path: RcStr,
) -> Vc<GetContentSourceContents> {
    route_tree.get(asset_path)
}

#[turbo_tasks::function(operation)]
fn get_content_source_content_vary_operation(
    get_content: ResolvedVc<Box<dyn GetContentSourceContent>>,
) -> Vc<ContentSourceDataVary> {
    get_content.vary()
}

#[turbo_tasks::function(operation)]
fn get_content_source_content_get_operation(
    get_content: ResolvedVc<Box<dyn GetContentSourceContent>>,
    path: RcStr,
    data: Value<ContentSourceData>,
) -> Vc<ContentSourceContent> {
    get_content.get(path, data)
}

/// Resolves a [SourceRequest] within a [super::ContentSource], returning the
/// corresponding content.
///
/// This function is the boundary of consistency. All invoked methods should be
/// invoked strongly consistent. This ensures that all requests serve the latest
/// version of the content. We don't make resolve_source_request strongly
/// consistent as we want get_routes and get to be independent consistent and
/// any side effect in get should not wait for recomputing of get_routes.
#[turbo_tasks::function(operation)]
pub async fn resolve_source_request(
    source: OperationVc<Box<dyn ContentSource>>,
    request: TransientInstance<SourceRequest>,
) -> Result<Vc<ResolveSourceRequestResult>> {
    let original_path = request.uri.path().to_string();
    // Remove leading slash.
    let mut current_asset_path: RcStr = urlencoding::decode(&original_path[1..])?.into();
    let mut request_overwrites = (*request).clone();
    let mut response_header_overwrites = Vec::new();
    let mut route_tree = content_source_get_routes_operation(source)
        .resolve_strongly_consistent()
        .await?;
    'routes: loop {
        let mut sources_op = route_tree_get_operation(route_tree, current_asset_path.clone());
        'sources: loop {
            for &get_content in sources_op.read_strongly_consistent().await?.iter() {
                let content_vary = get_content_source_content_vary_operation(get_content)
                    .read_strongly_consistent()
                    .await?;
                let content_data =
                    request_to_data(&request_overwrites, &request, &content_vary).await?;
                let content_op = get_content_source_content_get_operation(
                    get_content,
                    current_asset_path.clone(),
                    Value::new(content_data),
                );
                match &*content_op.read_strongly_consistent().await? {
                    ContentSourceContent::Rewrite(rewrite) => {
                        let rewrite = rewrite.await?;
                        // apply rewrite extras
                        if let Some(headers) = &rewrite.response_headers {
                            response_header_overwrites.extend(headers.await?.iter().cloned());
                        }
                        if let Some(headers) = &rewrite.request_headers {
                            request_overwrites.headers.clear();
                            for (name, value) in &*headers.await? {
                                request_overwrites.headers.insert(
                                    HyperHeaderName::try_from(name.as_str())?,
                                    HyperHeaderValue::try_from(value.as_str())?,
                                );
                            }
                        }
                        // do the rewrite
                        match &rewrite.ty {
                            RewriteType::Location { path_and_query } => {
                                let new_uri = Uri::try_from(path_and_query.as_str())?;
                                let new_asset_path =
                                    urlencoding::decode(&new_uri.path()[1..])?.into_owned();
                                request_overwrites.uri = new_uri;
                                current_asset_path = new_asset_path.into();
                                continue 'routes;
                            }
                            RewriteType::ContentSource {
                                source,
                                path_and_query,
                            } => {
                                let new_uri = Uri::try_from(path_and_query.as_str())?;
                                let new_asset_path =
                                    urlencoding::decode(&new_uri.path()[1..])?.into_owned();
                                request_overwrites.uri = new_uri;
                                current_asset_path = new_asset_path.into();
                                route_tree = content_source_get_routes_operation(*source)
                                    .resolve_strongly_consistent()
                                    .await?;
                                continue 'routes;
                            }
                            RewriteType::Sources {
                                sources: new_sources,
                            } => {
                                sources_op = *new_sources;
                                continue 'sources;
                            }
                        }
                    }
                    ContentSourceContent::NotFound => {
                        return Ok(ResolveSourceRequestResult::NotFound.cell());
                    }
                    ContentSourceContent::Static(static_content) => {
                        return Ok(ResolveSourceRequestResult::Static(
                            *static_content,
                            HeaderList::new(response_header_overwrites)
                                .to_resolved()
                                .await?,
                        )
                        .cell());
                    }
                    ContentSourceContent::HttpProxy(proxy_result) => {
                        return Ok(ResolveSourceRequestResult::HttpProxy(*proxy_result).cell());
                    }
                    ContentSourceContent::Next => continue,
                }
            }
            break;
        }
        break;
    }
    Ok(ResolveSourceRequestResult::NotFound.cell())
}

static CACHE_BUSTER: AtomicU64 = AtomicU64::new(0);

async fn request_to_data(
    request: &SourceRequest,
    original_request: &SourceRequest,
    vary: &ContentSourceDataVary,
) -> Result<ContentSourceData> {
    let mut data = ContentSourceData::default();
    if vary.method {
        data.method = Some(request.method.clone().into());
    }
    if vary.url {
        data.url = Some(request.uri.to_string().into());
    }
    if vary.original_url {
        data.original_url = Some(original_request.uri.to_string().into());
    }
    if vary.body {
        data.body = Some(request.body.clone().resolved_cell());
    }
    if vary.raw_query {
        data.raw_query = Some(request.uri.query().unwrap_or("").into());
    }
    if vary.raw_headers {
        data.raw_headers = Some(
            request
                .headers
                .iter()
                .map(|(name, value)| {
                    Ok((name.to_string().into(), value.to_str()?.to_string().into()))
                })
                .collect::<Result<Vec<_>>>()?,
        );
    }
    if let Some(filter) = vary.query.as_ref() {
        if let Some(query) = request.uri.query() {
            let mut query: Query = serde_qs::from_str(query)?;
            query.filter_with(filter);
            data.query = Some(query);
        } else {
            data.query = Some(Query::default())
        }
    }
    if let Some(filter) = vary.headers.as_ref() {
        let mut headers = Headers::default();
        for (header_name, header_value) in request.headers.iter() {
            if !filter.contains(header_name.as_str()) {
                continue;
            }
            match headers.entry(header_name.to_string()) {
                Entry::Vacant(e) => {
                    if let Ok(s) = header_value.to_str() {
                        e.insert(HeaderValue::SingleString(s.to_string()));
                    } else {
                        e.insert(HeaderValue::SingleBytes(header_value.as_bytes().to_vec()));
                    }
                }
                Entry::Occupied(mut e) => {
                    if let Ok(s) = header_value.to_str() {
                        e.get_mut().extend_with_string(s.to_string());
                    } else {
                        e.get_mut()
                            .extend_with_bytes(header_value.as_bytes().to_vec());
                    }
                }
            }
        }
        data.headers = Some(headers);
    }
    if vary.cache_buster {
        data.cache_buster = CACHE_BUSTER.fetch_add(1, Ordering::SeqCst);
    }
    Ok(data)
}
