#![feature(min_specialization)]
#![feature(trait_alias)]
#![feature(array_chunks)]

pub mod fs;
pub mod html;
pub mod introspect;
pub mod source;
pub mod update;

use std::{
    borrow::Cow,
    collections::{btree_map::Entry, BTreeMap},
    future::Future,
    net::{SocketAddr, TcpListener},
    pin::Pin,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use anyhow::{bail, Context, Result};
use futures::{StreamExt, TryStreamExt};
use hyper::{
    header::HeaderName,
    server::{conn::AddrIncoming, Builder},
    service::{make_service_fn, service_fn},
    Request, Response, Server,
};
use mime_guess::mime;
use source::{Body, Bytes};
use turbo_tasks::{
    run_once, trace::TraceRawVcs, util::FormatDuration, RawVc, TransientValue, TurboTasksApi, Value,
};
use turbo_tasks_fs::{FileContent, FileContentReadRef};
use turbopack_cli_utils::issue::{ConsoleUi, ConsoleUiVc};
use turbopack_core::asset::AssetContent;

use self::{
    source::{
        query::Query, ContentSourceContent, ContentSourceDataVary, ContentSourceResultVc,
        ContentSourceVc, ProxyResultReadRef,
    },
    update::{protocol::ResourceIdentifier, UpdateServer},
};
use crate::source::{ContentSourceData, HeaderValue};

pub trait SourceProvider: Send + Clone + 'static {
    /// must call a turbo-tasks function internally
    fn get_source(&self) -> ContentSourceVc;
}

pub trait ContentProvider: Send + Clone + 'static {
    fn get_content(&self) -> ContentSourceResultVc;
}

impl<T> SourceProvider for T
where
    T: Fn() -> ContentSourceVc + Send + Clone + 'static,
{
    fn get_source(&self) -> ContentSourceVc {
        self()
    }
}

#[derive(TraceRawVcs, Debug)]
pub struct DevServerBuilder {
    #[turbo_tasks(trace_ignore)]
    pub addr: SocketAddr,
    #[turbo_tasks(trace_ignore)]
    server: Builder<AddrIncoming>,
}

#[derive(TraceRawVcs)]
pub struct DevServer {
    #[turbo_tasks(trace_ignore)]
    pub addr: SocketAddr,
    #[turbo_tasks(trace_ignore)]
    pub future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
}

// Just print issues to console for now...
async fn handle_issues<T: Into<RawVc>>(
    source: T,
    path: &str,
    operation: &str,
    console_ui: ConsoleUiVc,
) -> Result<()> {
    let state = console_ui
        .group_and_display_issues(TransientValue::new(source.into()))
        .await?;
    if state.has_fatal {
        bail!("Fatal issue(s) occurred in {path} ({operation}")
    }

    Ok(())
}

#[turbo_tasks::value(serialization = "none")]
enum GetFromSourceResult {
    Static(FileContentReadRef),
    HttpProxy(ProxyResultReadRef),
    NeedData {
        source: ContentSourceVc,
        path: String,
        vary: ContentSourceDataVary,
    },
    NotFound,
}

#[turbo_tasks::function]
async fn get_from_source(
    source: ContentSourceVc,
    path: &str,
    data: Value<ContentSourceData>,
) -> Result<GetFromSourceResultVc> {
    let content = source.get(path, data).await?.content.await?;
    Ok(match &*content {
        ContentSourceContent::Static(content_vc) => {
            if let AssetContent::File(file) = &*content_vc.content().await? {
                GetFromSourceResult::Static(file.await?)
            } else {
                GetFromSourceResult::NotFound
            }
        }
        ContentSourceContent::HttpProxy(proxy) => GetFromSourceResult::HttpProxy(proxy.await?),
        ContentSourceContent::NeedData(data) => GetFromSourceResult::NeedData {
            source: data.source.resolve().await?,
            path: data.path.clone(),
            vary: data.vary.clone(),
        },
        ContentSourceContent::NotFound => GetFromSourceResult::NotFound,
    }
    .cell())
}

async fn process_request_with_content_source(
    path: &str,
    mut resolved_source: ContentSourceVc,
    mut asset_path: Cow<'_, str>,
    mut request: Request<hyper::Body>,
    console_ui: ConsoleUiVc,
) -> Result<Response<hyper::Body>> {
    let mut data = ContentSourceData::default();
    loop {
        let content_source_result = get_from_source(resolved_source, &asset_path, Value::new(data));
        handle_issues(
            content_source_result,
            path,
            "get content from source",
            console_ui,
        )
        .await?;
        match &*content_source_result.strongly_consistent().await? {
            GetFromSourceResult::Static(file) => {
                if let FileContent::Content(content) = &**file {
                    let content_type = content.content_type().map_or_else(
                        || {
                            let guess =
                                mime_guess::from_path(asset_path.as_ref()).first_or_octet_stream();
                            // If a text type, application/javascript, or application/json was
                            // guessed, use a utf-8 charset as  we most likely generated it as
                            // such.
                            if (guess.type_() == mime::TEXT
                                || guess.subtype() == mime::JAVASCRIPT
                                || guess.subtype() == mime::JSON)
                                && guess.get_param("charset").is_none()
                            {
                                guess.to_string() + "; charset=utf-8"
                            } else {
                                guess.to_string()
                            }
                        },
                        |m| m.to_string(),
                    );

                    let content = content.content();
                    let bytes = content.read();
                    return Ok(Response::builder()
                        .status(200)
                        .header("Content-Type", content_type)
                        .header("Content-Length", content.len().to_string())
                        .body(hyper::Body::wrap_stream(bytes))?);
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
            GetFromSourceResult::NeedData { source, path, vary } => {
                resolved_source = *source;
                asset_path = Cow::Owned(path.to_string());
                data = request_to_data(&mut request, vary).await?;
                continue;
            }
            GetFromSourceResult::NotFound => {}
        }
        return Ok(Response::builder().status(404).body(hyper::Body::empty())?);
    }
}

impl DevServer {
    pub fn listen(addr: SocketAddr) -> Result<DevServerBuilder, anyhow::Error> {
        // This is annoying. The hyper::Server doesn't allow us to know which port was
        // bound (until we build it with a request handler) when using the standard
        // `server::try_bind` approach. This is important when binding the `0` port,
        // because the OS will remap that to an actual free port, and we need to know
        // that port before we build the request handler. So we need to construct a
        // real TCP listener, see if it bound, and get its bound address.
        let listener = TcpListener::bind(addr).context("not able to bind address")?;
        let addr = listener
            .local_addr()
            .context("not able to get bound address")?;

        let server = Server::from_tcp(listener).context("Not able to start server")?;
        Ok(DevServerBuilder { addr, server })
    }
}

impl DevServerBuilder {
    pub fn serve(
        self,
        turbo_tasks: Arc<dyn TurboTasksApi>,
        source_provider: impl SourceProvider + Clone + Send + Sync,
        console_ui: Arc<ConsoleUi>,
    ) -> DevServer {
        let make_svc = make_service_fn(move |_| {
            let tt = turbo_tasks.clone();
            let source_provider = source_provider.clone();
            let console_ui = console_ui.clone();
            async move {
                let handler = move |request: Request<hyper::Body>| {
                    let console_ui = console_ui.clone();
                    let start = Instant::now();
                    let tt = tt.clone();
                    let source_provider = source_provider.clone();
                    let future = async move {
                        if hyper_tungstenite::is_upgrade_request(&request) {
                            let uri = request.uri();
                            let path = uri.path();

                            if path == "/turbopack-hmr" {
                                let (response, websocket) =
                                    hyper_tungstenite::upgrade(request, None)?;
                                let update_server = UpdateServer::new(source_provider);
                                update_server.run(&*tt, websocket);
                                return Ok(response);
                            }

                            println!("[404] {} (WebSocket)", path);
                            if path == "/_next/webpack-hmr" {
                                // Special-case requests to webpack-hmr as these are made by Next.js
                                // clients built without turbopack, which may be making requests in
                                // development.
                                println!("A non-turbopack next.js client is trying to connect.");
                                println!(
                                    "Make sure to reload/close any browser window which has been \
                                     opened without --turbo."
                                );
                            }

                            return Ok(Response::builder()
                                .status(404)
                                .body(hyper::Body::empty())?);
                        }

                        run_once(tt, async move {
                            let console_ui = (*console_ui).clone().cell();
                            let uri = request.uri();
                            let path = uri.path();
                            // Remove leading slash.
                            let path = &path[1..].to_string();
                            let asset_path = urlencoding::decode(path)?;
                            let source = source_provider.get_source();
                            handle_issues(source, path, "get source", console_ui).await?;
                            let resolved_source = source.resolve_strongly_consistent().await?;
                            let response = process_request_with_content_source(
                                path,
                                resolved_source,
                                asset_path,
                                request,
                                console_ui,
                            )
                            .await?;
                            let status = response.status().as_u16();
                            let success = response.status().is_success();
                            let elapsed = start.elapsed();
                            if !success
                                || (cfg!(feature = "log_request_stats")
                                    && elapsed > Duration::from_secs(1))
                            {
                                println!(
                                    "[{status}] /{path} ({duration})",
                                    duration = FormatDuration(elapsed)
                                );
                            }
                            Ok(response)
                        })
                        .await
                    };
                    async move {
                        match future.await {
                            Ok(r) => Ok::<_, hyper::http::Error>(r),
                            Err(e) => {
                                println!(
                                    "[500] error: {:?} ({})",
                                    e,
                                    FormatDuration(start.elapsed())
                                );
                                Ok(Response::builder()
                                    .status(500)
                                    .body(hyper::Body::from(format!("{:?}", e,)))?)
                            }
                        }
                    }
                };
                anyhow::Ok(service_fn(handler))
            }
        });
        let server = self.server.serve(make_svc);

        DevServer {
            addr: self.addr,
            future: Box::pin(async move {
                server.await?;
                Ok(())
            }),
        }
    }
}

static CACHE_BUSTER: AtomicU64 = AtomicU64::new(0);

async fn request_to_data(
    request: &mut Request<hyper::Body>,
    vary: &ContentSourceDataVary,
) -> Result<ContentSourceData> {
    let mut data = ContentSourceData::default();
    if vary.method {
        data.method = Some(request.method().to_string());
    }
    if vary.url {
        data.url = Some(request.uri().to_string());
    }
    if vary.body {
        let bytes: Vec<_> = request
            .body_mut()
            .map(|bytes| bytes.map(Bytes::from))
            .try_collect::<Vec<_>>()
            .await?;
        data.body = Some(Body::new(bytes).into());
    }
    if let Some(filter) = vary.query.as_ref() {
        if let Some(query) = request.uri().query() {
            let mut query: Query = serde_qs::from_str(query)?;
            query.filter_with(filter);
            data.query = Some(query);
        } else {
            data.query = Some(Query::default())
        }
    }
    if let Some(filter) = vary.headers.as_ref() {
        let mut headers = BTreeMap::new();
        for (header_name, header_value) in request.headers().iter() {
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

pub(crate) fn resource_to_data(
    resource: ResourceIdentifier,
    vary: &ContentSourceDataVary,
) -> ContentSourceData {
    let mut data = ContentSourceData::default();
    if vary.method {
        data.method = Some("GET".to_string());
    }
    if vary.url {
        data.url = Some(resource.path);
    }
    if vary.body {
        data.body = Some(Body::new(Vec::new()).into());
    }
    if vary.query.is_some() {
        data.query = Some(Query::default())
    }
    if let Some(filter) = vary.headers.as_ref() {
        let mut headers = BTreeMap::new();
        if let Some(resource_headers) = resource.headers {
            for (header_name, header_value) in resource_headers {
                if !filter.contains(header_name.as_str()) {
                    continue;
                }
                match headers.entry(header_name) {
                    Entry::Vacant(e) => {
                        e.insert(HeaderValue::SingleString(header_value));
                    }
                    Entry::Occupied(mut e) => {
                        e.get_mut().extend_with_string(header_value);
                    }
                }
            }
        }
        data.headers = Some(headers);
    }
    if vary.cache_buster {
        data.cache_buster = CACHE_BUSTER.fetch_add(1, Ordering::SeqCst);
    }
    data
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_cli_utils::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
