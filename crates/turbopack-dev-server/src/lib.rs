#![feature(min_specialization)]
#![feature(trait_alias)]

pub mod fs;
pub mod html;
pub mod html_runtime_asset;
pub mod source;
pub mod update;

use std::{
    collections::btree_map::Entry,
    future::Future,
    net::SocketAddr,
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{anyhow, bail, Result};
use hyper::{
    service::{make_service_fn, service_fn},
    Body, Request, Response, Server,
};
use mime_guess::mime;
use turbo_tasks::{
    trace::TraceRawVcs, util::FormatDuration, RawVc, TransientValue, TurboTasksApi, Value,
};
use turbo_tasks_fs::FileContent;
use turbopack_cli_utils::issue::{ConsoleUi, ConsoleUiVc};
use turbopack_core::asset::AssetContent;

use self::{
    source::{query::Query, ContentSourceDataVary, ContentSourceVc},
    update::UpdateServer,
};
use crate::source::{ContentSourceData, ContentSourceResult, HeaderValue};

pub trait GetContentSource = Fn() -> ContentSourceVc + Send + Clone + 'static;

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
        bail!("Fatal issue(s) occurred")
    }

    if state.has_new_issues {
        println!("{path} has new issues ({operation}):\n");
    } else if state.has_issues {
        println!("{path} has old issues ({operation}):\n");
    }
    Ok(())
}

impl DevServer {
    /// [get_source] argument must be from a single turbo-tasks function call
    pub fn listen<S: GetContentSource>(
        turbo_tasks: Arc<dyn TurboTasksApi>,
        get_source: S,
        addr: SocketAddr,
        console_ui: Arc<ConsoleUi>,
    ) -> Self {
        let make_svc = make_service_fn(move |_| {
            let tt = turbo_tasks.clone();
            let get_source = get_source.clone();
            let console_ui = console_ui.clone();
            async move {
                let handler = move |request: Request<Body>| {
                    let console_ui = console_ui.clone();
                    let start = Instant::now();
                    let tt = tt.clone();
                    let get_source = get_source.clone();
                    let future = async move {
                        if hyper_tungstenite::is_upgrade_request(&request) {
                            let (response, websocket) = hyper_tungstenite::upgrade(request, None)?;
                            let update_server = UpdateServer::new(websocket, get_source);
                            update_server.run(&*tt);
                            return Ok(response);
                        }
                        let (tx, rx) = tokio::sync::oneshot::channel();
                        let task_id = tt.run_once(Box::pin(async move {
                            let console_ui = (*console_ui).clone().cell();
                            let uri = request.uri();
                            let path = uri.path();
                            let asset_path = path[1..].to_string();
                            let source = get_source();
                            handle_issues(source, path, "get source", console_ui).await?;
                            let resolved_source = source.resolve_strongly_consistent().await?;
                            let content_source_vary = resolved_source.vary(&asset_path);
                            handle_issues(
                                content_source_vary,
                                path,
                                "get vary from source",
                                console_ui,
                            )
                            .await?;
                            let vary = &*content_source_vary.strongly_consistent().await?;
                            let data = request_to_data(&request, vary)?;
                            let content_source_result =
                                resolved_source.get(&asset_path, Value::new(data));
                            handle_issues(
                                content_source_result,
                                path,
                                "get content from source",
                                console_ui,
                            )
                            .await?;
                            if let ContentSourceResult::Static(v_content) =
                                &*content_source_result.strongly_consistent().await?
                            {
                                let resolved_v_content =
                                    v_content.resolve_strongly_consistent().await?;
                                let content_vc = resolved_v_content.content();
                                handle_issues(content_vc, path, "content", console_ui).await?;
                                if let AssetContent::File(file) =
                                    &*content_vc.strongly_consistent().await?
                                {
                                    if let FileContent::Content(content) = &*file.await? {
                                        let content_type = content.content_type().map_or_else(
                                            || {
                                                let guess = mime_guess::from_path(asset_path)
                                                    .first_or_octet_stream();
                                                // If a text type, application/javascript, or
                                                // application/json was guessed, use a utf-8 charset
                                                // as
                                                // we most likely generated it as such.
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
                                        tx.send(
                                            Response::builder()
                                                .status(200)
                                                .header("Content-Type", content_type)
                                                .header("Content-Length", bytes.len().to_string())
                                                .body(Body::from(bytes))?,
                                        )
                                        .map_err(|_| anyhow!("receiver dropped"))?;
                                        let elapsed = start.elapsed();
                                        if elapsed > Duration::from_secs(1) {
                                            println!(
                                                "[200] {} ({})",
                                                path,
                                                FormatDuration(elapsed)
                                            );
                                        }
                                        return Ok(());
                                    }
                                }
                            }
                            tx.send(Response::builder().status(404).body(Body::empty())?)
                                .map_err(|_| anyhow!("receiver dropped"))?;
                            println!("[404] {} ({})", path, FormatDuration(start.elapsed()));
                            Ok(())
                        }));
                        match rx.await {
                            Ok(r) => Ok::<_, anyhow::Error>(r),
                            Err(_) => {
                                // INVALIDATION: this is just for a single http response, we don't
                                // care about invalidation.
                                let _ = tt.try_read_task_output_untracked(task_id, false)?;
                                Err(anyhow!("Task didn't send a reponse"))
                            }
                        }
                    };
                    async move {
                        match future.await {
                            Ok(r) => Ok::<_, hyper::http::Error>(r),
                            Err(e) => {
                                println!("[500] {:#} ({})", e, FormatDuration(start.elapsed()));
                                Ok(Response::builder()
                                    .status(500)
                                    .body(Body::from(format!("{:?}", e,)))?)
                            }
                        }
                    }
                };
                Ok::<_, anyhow::Error>(service_fn(handler))
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
            data.query = query;
        }
    }
    if let Some(filter) = vary.headers.as_ref() {
        for (header_name, header_value) in request.headers().iter() {
            if !filter.contains(header_name.as_str()) {
                continue;
            }
            match data.headers.entry(header_name.to_string()) {
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
