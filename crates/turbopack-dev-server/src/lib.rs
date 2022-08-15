#![feature(min_specialization)]

pub mod fs;
pub mod html;
pub mod source;
pub mod update;

use std::{future::Future, net::SocketAddr, pin::Pin, time::Instant};

use anyhow::{anyhow, Result};
use hyper::{
    service::{make_service_fn, service_fn},
    Body, Request, Response, Server,
};
use mime_guess::mime;
use turbo_tasks::{trace::TraceRawVcs, util::FormatDuration, TransientValue};
use turbo_tasks_fs::FileContent;
use turbopack_cli_utils::issue::issue_to_styled_string;
use turbopack_core::issue::IssueVc;

use self::{source::ContentSourceVc, update::UpdateServer};

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
                            let update_server = UpdateServer::new(websocket, source);
                            update_server.run(&*tt);
                            return Ok(response);
                        }
                        let (tx, rx) = tokio::sync::oneshot::channel();
                        let task_id = tt.run_once(Box::pin(async move {
                            let uri = request.uri();
                            let path = uri.path();
                            let asset_path = path[1..].to_string();
                            let file_content = source.get(&asset_path);
                            if let FileContent::Content(content) =
                                &*file_content.content().strongly_consistent().await?
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
        let server = Server::bind(&this.addr).serve(make_svc);

        Ok(DevServerListening::new(this.addr, async move {
            server.await?;
            Ok(())
        }))
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
