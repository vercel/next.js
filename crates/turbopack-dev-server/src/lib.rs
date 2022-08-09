#![feature(min_specialization)]

pub mod fs;
pub mod html;
pub mod source;

use std::{
    future::Future,
    net::SocketAddr,
    pin::Pin,
    sync::{Arc, Mutex},
    time::Instant,
};

use anyhow::{anyhow, Result};
use event_listener::Event;
use futures::{
    stream::{unfold, FuturesUnordered, StreamExt},
    SinkExt, Stream,
};
use hyper::{
    service::{make_service_fn, service_fn},
    Body, Request, Response, Server,
};
use hyper_tungstenite::tungstenite::Message;
use mime_guess::mime;
use tokio::select;
use turbo_tasks::{trace::TraceRawVcs, util::FormatDuration, RawVcReadResult, TransientValue};
use turbo_tasks_fs::FileContent;
use turbopack_cli_utils::issue::issue_to_styled_string;
use turbopack_core::{asset::AssetVc, issue::IssueVc};

use self::source::ContentSourceVc;

#[turbo_tasks::value(shared)]
enum FindAssetResult {
    NotFound,
    Found(AssetVc),
}

#[turbo_tasks::value(cell = "new", serialization = "none", eq = "manual")]
pub struct DevServer {
    source: ContentSourceVc,
    #[turbo_tasks(trace_ignore)]
    addr: SocketAddr,
}

#[turbo_tasks::value_impl]
impl DevServerVc {
    #[turbo_tasks::function]
    pub fn new(source: ContentSourceVc, addr: TransientValue<SocketAddr>) -> Self {
        Self::cell(DevServer {
            source,
            addr: addr.into_value(),
        })
    }
}

struct State {
    event: Event,
    prev_value: Option<Option<RawVcReadResult<FileContent>>>,
}

impl State {
    fn set_value(&mut self, value: Option<RawVcReadResult<FileContent>>) {
        if let Some(ref prev_value) = self.prev_value {
            match (prev_value, &value) {
                (None, None) => return,
                (Some(a), Some(b)) if **a == **b => return,
                _ => {}
            }
        }
        self.prev_value = Some(value);
        self.event.notify(usize::MAX);
    }
    fn take(&mut self) -> Option<Option<RawVcReadResult<FileContent>>> {
        self.prev_value.take()
    }
}

#[turbo_tasks::value_impl]
impl DevServerVc {
    #[turbo_tasks::function]
    async fn content_with_state(
        self,
        id: &str,
        state: TransientValue<Arc<Mutex<State>>>,
    ) -> Result<()> {
        let content = self
            .await?
            .source
            .get_by_id(id)
            .strongly_consistent()
            .await?;
        {
            let state = state.into_value();
            let mut state = state.lock().unwrap();
            state.set_value(Some(content));
        }
        Ok(())
    }
}

impl DevServerVc {
    pub async fn listen(self) -> Result<DevServerListening> {
        let tt = turbo_tasks::turbo_tasks();
        let this = self.await?;
        let source = this.source;
        let make_svc = make_service_fn(move |_| {
            let tt = tt.clone();
            async move {
                let handler = move |request: Request<Body>| {
                    let start = Instant::now();
                    let tt = tt.clone();
                    let future = async move {
                        if hyper_tungstenite::is_upgrade_request(&request) {
                            let (response, websocket) = hyper_tungstenite::upgrade(request, None)?;

                            tt.run_once_process(Box::pin(async move {
                                if let Err(err) = (async move {
                                    let mut websocket = websocket.await?;
                                    let mut change_stream_futures = FuturesUnordered::new();
                                    loop {
                                        select! {
                                            Some(message) = websocket.next() => {
                                                if let Message::Text(msg) = message? {
                                                    let data = json::parse(&msg)?;
                                                    if let Some(id) = data.as_str() {
                                                            let stream = self.change_stream(id).skip(1);
                                                            change_stream_futures.push(stream.into_future());
                                                    }
                                                }
                                            }
                                            Some((_change, stream)) = change_stream_futures.next() => {
                                                websocket.send(Message::text("refresh")).await?;
                                                change_stream_futures.push(stream.into_future());
                                            }
                                            else => break
                                        }
                                    }

                                    Ok::<(), anyhow::Error>(())
                                })
                                .await
                                {
                                    println!("[WS]: error {}", err);
                                }
                                Ok::<(), anyhow::Error>(())
                            }));

                            return Ok(response);
                        }
                        let (tx, rx) = tokio::sync::oneshot::channel();
                        let task_id = tt.run_once(Box::pin(async move {
                            let uri = request.uri();
                            let path = uri.path();
                            let mut asset_path = path[1..].to_string();
                            if asset_path.is_empty() || asset_path.ends_with('/') {
                                asset_path += "index.html";
                            }
                            let file_content = source.get(&asset_path);
                            if let FileContent::Content(content) =
                                &*file_content.strongly_consistent().await?
                            {
                                let content_type = content.content_type().map_or_else(
                                    || {
                                        let guess = mime_guess::from_path(asset_path)
                                            .first_or_octet_stream();
                                        // If a text type, application/javascript, or
                                        // application/json was guessed, use a utf-8 charset as we
                                        // most likely generated it as such.
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

                                // Just print issues to console for now...
                                let issues = IssueVc::peek_issues_with_path(file_content).await?;
                                let issues = issues.await?;
                                if !issues.is_empty() {
                                    println!(
                                        "[200] {} ({}) has some issues:\n",
                                        path,
                                        FormatDuration(elapsed)
                                    );
                                    for (issue, path) in issues.iter_with_shortest_path() {
                                        println!(
                                            "{}\n",
                                            &*issue_to_styled_string(issue, path)
                                                .strongly_consistent()
                                                .await?
                                        );
                                    }
                                }

                                return Ok(());
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
                                println!("[500] {:?} ({})", e, FormatDuration(start.elapsed()));
                                Ok(Response::builder().status(500).body(Body::from(format!(
                                    "{:?}\n{}",
                                    e,
                                    e.backtrace()
                                )))?)
                            }
                        }
                    }
                };
                Ok::<_, anyhow::Error>(service_fn(handler))
            }
        });
        let server = Server::bind(&this.addr).serve(make_svc);

        Ok(DevServerListening::new(this.addr, async move {
            server.await?;
            Ok(())
        }))
    }

    fn change_stream(
        self,
        id: &str,
    ) -> Pin<Box<dyn Stream<Item = Option<RawVcReadResult<FileContent>>> + Send + Sync>> {
        let state = State {
            event: Event::new(),
            prev_value: None,
        };
        let listener = state.event.listen();
        let state = Arc::new(Mutex::new(state));
        self.content_with_state(id, TransientValue::new(state.clone()));
        Box::pin(unfold(
            (state, listener),
            |(state, mut listener)| async move {
                loop {
                    listener.await;
                    let mut s = state.lock().unwrap();
                    listener = s.event.listen();
                    if let Some(value) = s.take() {
                        drop(s);
                        return Some((value, (state, listener)));
                    }
                }
            },
        ))
    }
}

#[derive(TraceRawVcs)]
pub struct DevServerListening {
    #[turbo_tasks(trace_ignore)]
    pub addr: SocketAddr,
    #[turbo_tasks(trace_ignore)]
    pub future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
}

impl DevServerListening {
    fn new(addr: SocketAddr, future: impl Future<Output = Result<()>> + Send + 'static) -> Self {
        Self {
            addr,
            future: Box::pin(future),
        }
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_cli_utils::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
