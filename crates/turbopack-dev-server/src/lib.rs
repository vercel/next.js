#![feature(min_specialization)]

pub mod fs;
pub mod html;

use std::{
    collections::{HashMap, HashSet, VecDeque},
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
use tokio::select;
use turbo_tasks::{trace::TraceRawVcs, util::FormatDuration, RawVcReadResult, TransientValue};
use turbo_tasks_fs::{FileContent, FileSystemPathVc};
use turbopack_core::{
    asset::AssetVc,
    reference::{all_assets, all_referenced_assets},
};

#[turbo_tasks::value(shared)]
enum FindAssetResult {
    NotFound,
    Found(AssetVc),
}

type FallbackHandler = Arc<dyn Fn(&str) -> Option<String> + Send + Sync>;

#[turbo_tasks::value(cell: new, serialization: none, eq: manual)]
pub struct DevServer {
    root_path: FileSystemPathVc,
    root_asset: AssetVc,
    #[trace_ignore]
    addr: SocketAddr,
    #[trace_ignore]
    fallback_handler: FallbackHandler,
}

#[turbo_tasks::value_impl]
impl DevServerVc {
    #[turbo_tasks::function]
    pub fn new(
        root_path: FileSystemPathVc,
        root_asset: AssetVc,
        addr: TransientValue<SocketAddr>,
        fallback_handler: TransientValue<FallbackHandler>,
    ) -> Self {
        Self::cell(DevServer {
            root_path,
            root_asset,
            addr: addr.into_value(),
            fallback_handler: fallback_handler.into_value(),
        })
    }
}

#[turbo_tasks::value(transparent)]
struct AssetsMap(HashMap<String, AssetVc>);

#[turbo_tasks::function]
async fn all_assets_map(root_path: FileSystemPathVc, root_asset: AssetVc) -> Result<AssetsMapVc> {
    let mut map = HashMap::new();
    let root_path = root_path.await?;
    let assets = all_assets(root_asset).strongly_consistent();
    for (p, asset) in assets
        .await?
        .iter()
        .map(|asset| (asset.path(), *asset))
        .collect::<Vec<_>>()
    {
        if let Some(sub_path) = root_path.get_path_to(&*p.await?) {
            map.insert(sub_path.to_string(), asset);
        }
    }
    Ok(AssetsMapVc::cell(map))
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
        root_asset: AssetVc,
        asset_path: &str,
        state: TransientValue<Arc<Mutex<State>>>,
    ) -> Result<()> {
        if let FindAssetResult::Found(asset) = &*self
            .find_asset(root_asset, &asset_path)
            .strongly_consistent()
            .await?
        {
            let file_content = asset.content().strongly_consistent().await?;
            {
                let state = state.into_value();
                let mut state = state.lock().unwrap();
                state.set_value(Some(file_content));
            }
            return Ok(());
        }

        {
            let state = state.into_value();
            let mut state = state.lock().unwrap();
            state.set_value(None);
        }

        Ok(())
    }

    #[turbo_tasks::function]
    async fn find_asset(self, root_asset: AssetVc, path: &str) -> Result<FindAssetResultVc> {
        let assets = all_assets_map(self.await?.root_path, root_asset)
            .strongly_consistent()
            .await?;
        if let Some(asset) = assets.get(path) {
            return Ok(FindAssetResult::Found(*asset).into());
        }
        Ok(FindAssetResult::NotFound.into())
    }

    #[turbo_tasks::function]
    async fn find_asset_2(self, root_asset: AssetVc, path: &str) -> Result<FindAssetResultVc> {
        let root_path = &*self.await?.root_path.await?;
        let p = &*root_asset.path().await?;
        let mut visited = HashSet::new();
        visited.insert(root_asset);
        let mut queue = VecDeque::new();
        if let Some(sub_path) = root_path.get_path_to(p) {
            if sub_path == path {
                return Ok(FindAssetResult::Found(root_asset).into());
            }
            queue.push_back(root_asset);
            while let Some(asset) = queue.pop_front() {
                let references = all_referenced_assets(asset).await?;
                for inner in references.iter() {
                    if visited.insert(*inner) {
                        let p = &*inner.path().await?;
                        if let Some(sub_path) = root_path.get_path_to(p) {
                            if sub_path == path {
                                return Ok(FindAssetResult::Found(*inner).into());
                            }
                            queue.push_back(*inner);
                        }
                    }
                }
            }
        }
        Ok(FindAssetResult::NotFound.into())
    }
}

impl DevServerVc {
    pub async fn listen(self) -> Result<DevServerListening> {
        let tt = turbo_tasks::turbo_tasks();
        let this = self.await?;
        let root_path_str = this.root_path.to_string();
        let root_asset = this.root_asset;
        let fallback_handler = this.fallback_handler.clone();
        let make_svc = make_service_fn(move |_| {
            let tt = tt.clone();
            let fallback_handler = fallback_handler.clone();
            async move {
                let handler = move |request: Request<Body>| {
                    let start = Instant::now();
                    let tt = tt.clone();
                    let fallback_handler = fallback_handler.clone();
                    async move {
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
                                                    if let Some(chunk) = data.as_str() {
                                                        let root_path_str = root_path_str.await?;
                                                        if chunk.starts_with(&*root_path_str) {
                                                            let asset_path = &chunk[root_path_str.len()..];
                                                            let stream = self.change_stream(root_asset, asset_path).skip(1);
                                                            change_stream_futures.push(stream.into_future());
                                                        }
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
                            if let FindAssetResult::Found(asset) = &*self
                                .find_asset(root_asset, &asset_path)
                                .strongly_consistent()
                                .await?
                            {
                                if let FileContent::Content(content) =
                                    &*asset.content().strongly_consistent().await?
                                {
                                    let mime =
                                        mime_guess::from_path(asset_path).first_or_octet_stream();
                                    let bytes = content.content().to_vec();
                                    tx.send(
                                        Response::builder()
                                            .status(200)
                                            .header("Content-Type", mime.to_string())
                                            .header("Content-Length", bytes.len().to_string())
                                            .body(Body::from(bytes))?,
                                    )
                                    .map_err(|_| anyhow!("receiver dropped"))?;
                                    // println!(
                                    //     "[200] {} ({})",
                                    //     path,
                                    //     FormatDuration(start.elapsed())
                                    // );
                                    return Ok(());
                                }
                            }
                            if let Some(content) = fallback_handler(path) {
                                tx.send(Response::builder().status(200).body(Body::from(content))?)
                                    .map_err(|_| anyhow!("receiver dropped"))?;
                                println!("[200] {} ({})", path, FormatDuration(start.elapsed()));
                                return Ok(());
                            }
                            tx.send(Response::builder().status(404).body(Body::empty())?)
                                .map_err(|_| anyhow!("receiver dropped"))?;
                            println!("[404] {} ({})", path, FormatDuration(start.elapsed()));
                            Ok(())
                        }));
                        loop {
                            // INVALIDATION: this is just for a single http response, we don't care
                            // about invalidation.
                            match tt.try_read_task_output_untracked(task_id, false)? {
                                Ok(_) => break,
                                Err(listener) => listener.await,
                            }
                        }
                        Ok::<_, anyhow::Error>(rx.await?)
                    }
                };
                Ok::<_, anyhow::Error>(service_fn(handler))
            }
        });
        let server = Server::bind(&this.addr).serve(make_svc);

        {
            let index_uri = if this.addr.ip().is_loopback() {
                format!("http://localhost:{}", this.addr.port())
            } else {
                format!("http://{}", this.addr)
            };
            println!("server listening on: {uri}", uri = index_uri);
            let _ = webbrowser::open(&index_uri);
        }

        Ok(DevServerListening::new(async move {
            server.await?;
            Ok(())
        }))
    }

    fn change_stream(
        self,
        root_asset: AssetVc,
        asset_path: &str,
    ) -> Pin<Box<dyn Stream<Item = Option<RawVcReadResult<FileContent>>> + Send + Sync>> {
        let state = State {
            event: Event::new(),
            prev_value: None,
        };
        let listener = state.event.listen();
        let state = Arc::new(Mutex::new(state));
        self.content_with_state(root_asset, asset_path, TransientValue::new(state.clone()));
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
    #[trace_ignore]
    pub future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
}

impl DevServerListening {
    fn new(future: impl Future<Output = Result<()>> + Send + 'static) -> Self {
        Self {
            future: Box::pin(future),
        }
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
