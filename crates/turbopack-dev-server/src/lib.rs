#![feature(min_specialization)]
#![feature(trait_alias)]

pub mod fs;
pub mod html;
pub mod introspect;
pub mod source;
pub mod update;

use std::{
    borrow::Cow,
    collections::{btree_map::Entry, BTreeMap},
    future::Future,
    net::SocketAddr,
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{bail, Result};
use hyper::{
    service::{make_service_fn, service_fn},
    Body, Request, Response, Server,
};
use mime_guess::mime;
use turbo_tasks::{
    run_once, trace::TraceRawVcs, util::FormatDuration, RawVc, TransientValue, TurboTasksApi, Value,
};
use turbo_tasks_fs::FileContent;
use turbopack_cli_utils::issue::{ConsoleUi, ConsoleUiVc};
use turbopack_core::asset::AssetContent;

use self::{
    source::{query::Query, ContentSourceDataVary, ContentSourceVc},
    update::UpdateServer,
};
use crate::source::{ContentSourceData, ContentSourceResult, HeaderValue};

pub trait SourceProvider: Send + Clone + 'static {
    /// must call a turbo-tasks function internally
    fn get_source(&self) -> ContentSourceVc;
}

impl<T> SourceProvider for T
where
    T: Fn() -> ContentSourceVc + Send + Clone + 'static,
{
    fn get_source(&self) -> ContentSourceVc {
        self()
    }
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

async fn process_request_with_content_source(
    path: &str,
    mut resolved_source: ContentSourceVc,
    mut asset_path: Cow<'_, str>,
    request: &Request<Body>,
    console_ui: ConsoleUiVc,
) -> Result<Response<Body>> {
    let mut data = ContentSourceData::default();
    loop {
        let content_source_result = resolved_source.get(&asset_path, Value::new(data));
        handle_issues(
            content_source_result,
            path,
            "get content from source",
            console_ui,
        )
        .await?;
        match &*content_source_result.strongly_consistent().await? {
            ContentSourceResult::Static(v_content) => {
                let resolved_v_content = v_content.resolve_strongly_consistent().await?;
                let content_vc = resolved_v_content.content();
                handle_issues(content_vc, path, "content", console_ui).await?;
                if let AssetContent::File(file) = &*content_vc.strongly_consistent().await? {
                    if let FileContent::Content(content) = &*file.await? {
                        let content_type = content.content_type().map_or_else(
                            || {
                                let guess = mime_guess::from_path(asset_path.as_ref())
                                    .first_or_octet_stream();
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

                        let bytes = content.content().to_vec();
                        return Ok(Response::builder()
                            .status(200)
                            .header("Content-Type", content_type)
                            .header("Content-Length", bytes.len().to_string())
                            .body(Body::from(bytes))?);
                    }
                }
            }
            ContentSourceResult::NeedData { source, path, vary } => {
                resolved_source = source.resolve_strongly_consistent().await?;
                asset_path = Cow::Owned(path.to_string());
                data = request_to_data(request, vary)?;
                continue;
            }
            ContentSourceResult::NotFound => {}
        }
        return Ok(Response::builder().status(404).body(Body::empty())?);
    }
}

impl DevServer {
    pub fn listen(
        turbo_tasks: Arc<dyn TurboTasksApi>,
        source_provider: impl SourceProvider,
        addr: SocketAddr,
        console_ui: Arc<ConsoleUi>,
    ) -> Self {
        let make_svc = make_service_fn(move |_| {
            let tt = turbo_tasks.clone();
            let source_provider = source_provider.clone();
            let console_ui = console_ui.clone();
            async move {
                let handler = move |request: Request<Body>| {
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
                            return Ok(Response::builder().status(404).body(Body::empty())?);
                        }

                        run_once(tt, async move {
                            let console_ui = (*console_ui).clone().cell();
                            let uri = request.uri();
                            let path = uri.path();
                            // Remove leading slash.
                            let path = &path[1..];
                            let asset_path = urlencoding::decode(path)?;
                            let source = source_provider.get_source();
                            handle_issues(source, path, "get source", console_ui).await?;
                            let resolved_source = source.resolve_strongly_consistent().await?;
                            let response = process_request_with_content_source(
                                path,
                                resolved_source,
                                asset_path,
                                &request,
                                console_ui,
                            )
                            .await?;
                            let status = response.status().as_u16();
                            let success = response.status().is_success();
                            let elapsed = start.elapsed();
                            if !success || elapsed > Duration::from_secs(1) {
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
                                    .body(Body::from(format!("{:?}", e,)))?)
                            }
                        }
                    }
                };
                anyhow::Ok(service_fn(handler))
            }
        });
        let server = Server::bind(&addr).serve(make_svc);

        Self {
            addr: server.local_addr(),
            future: Box::pin(async move {
                server.await?;
                Ok(())
            }),
        }
    }
}

fn request_to_data(
    request: &Request<Body>,
    vary: &ContentSourceDataVary,
) -> Result<ContentSourceData> {
    let mut data = ContentSourceData::default();
    if vary.method {
        data.method = Some(request.method().to_string());
    }
    if vary.url {
        data.url = Some(request.uri().to_string());
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
    Ok(data)
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_cli_utils::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
