use std::{
    collections::{hash_map::Entry, HashMap, VecDeque},
    future::Future,
    net::SocketAddr,
    pin::Pin,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, Result};
use hyper::{
    service::{make_service_fn, service_fn},
    Body, Request, Response, Server,
};
use turbo_tasks::{get_invalidator, trace::TraceRawVcs, Invalidator, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPathVc};
use turbopack_core::{asset::AssetVc, reference::all_referenced_assets};

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
enum FindAssetResult {
    NotFound,
    Found(AssetVc),
}

#[turbo_tasks::value(slot: new, serialization: none)]
pub struct DevServer {
    root_path: FileSystemPathVc,
    root_asset: AssetVc,
    #[trace_ignore]
    served_assets: Arc<Mutex<HashMap<String, Option<Invalidator>>>>,
}

#[turbo_tasks::value_impl]
impl DevServerVc {
    #[turbo_tasks::function]
    pub fn new(root_path: FileSystemPathVc, root_asset: AssetVc) -> Self {
        Self::slot(DevServer {
            root_path,
            root_asset,
            served_assets: Default::default(),
        })
    }
}

#[turbo_tasks::value_impl]
impl DevServerVc {
    #[turbo_tasks::function]
    async fn has_served(self, path: &str) -> Result<Vc<bool>> {
        let this = self.await?;
        let mut served_assets = this.served_assets.lock().unwrap();
        Ok(Vc::slot(match served_assets.entry(path.to_string()) {
            Entry::Occupied(e) => {
                let v = e.get();
                println!("has_served {path}, occupied {}", v.is_some());
                v.is_none()
            }
            Entry::Vacant(e) => {
                e.insert(Some(get_invalidator()));
                println!("has_served {path}, vacant");
                false
            }
        }))
    }

    #[turbo_tasks::function]
    async fn find_asset(self, root_asset: AssetVc, path: &str) -> Result<FindAssetResultVc> {
        let root_path = &*self.await?.root_path.await?;
        let p = &*root_asset.path().await?;
        let mut queue = VecDeque::new();
        if let Some(sub_path) = root_path.get_path_to(p) {
            println!("finding {path}: checking {sub_path}");
            if sub_path == path {
                return Ok(FindAssetResult::Found(root_asset).into());
            }
            if *self.has_served(sub_path).await? {
                println!("finding {path}: expanding {sub_path}");
                queue.push_back(root_asset);
                while let Some(asset) = queue.pop_front() {
                    let references = all_referenced_assets(asset).await?;
                    for inner in references.assets.iter() {
                        let p = &*inner.path().await?;
                        if let Some(sub_path) = root_path.get_path_to(p) {
                            if sub_path == path {
                                return Ok(FindAssetResult::Found(*inner).into());
                            }
                            if *self.has_served(sub_path).await? {
                                queue.push_back(*inner);
                            }
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
        let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
        let tt = turbo_tasks::turbo_tasks();
        let this = self.await?;
        let root_asset = this.root_asset;
        let served_assets: Arc<Mutex<HashMap<String, Option<Invalidator>>>> =
            this.served_assets.clone();
        let make_svc = make_service_fn(move |conn| {
            let served_assets = served_assets.clone();
            let tt = tt.clone();
            async move {
                let handler = move |request: Request<Body>| {
                    let served_assets = served_assets.clone();
                    let tt = tt.clone();
                    async move {
                        let (tx, rx) = tokio::sync::oneshot::channel();
                        let task_id = tt.run_once(Box::pin(async move {
                            let method = request.method();
                            let uri = request.uri();
                            let path = uri.path();
                            let asset_path = &path[1..];
                            {
                                let mut served_assets = served_assets.lock().unwrap();
                                if let Some(Some(invalidator)) =
                                    served_assets.insert(asset_path.to_string(), None)
                                {
                                    invalidator.invalidate();
                                    println!("invalidated");
                                }
                                println!("{:#?}", served_assets.keys());
                            }
                            println!("request {asset_path}");
                            if let FindAssetResult::Found(asset) =
                                &*self.find_asset(root_asset, asset_path).await?
                            {
                                if let FileContent::Content(content) = &*asset.content().await? {
                                    tx.send(
                                        Response::builder()
                                            .status(200)
                                            .body(Body::from(content.content().to_vec()))?,
                                    )
                                    .map_err(|_| anyhow!("receiver dropped"))?;
                                    return Ok(());
                                }
                            }
                            tx.send(Response::builder().status(404).body(Body::empty())?)
                                .map_err(|_| anyhow!("receiver dropped"))?;
                            Ok(())
                        }));
                        loop {
                            match unsafe { tt.try_read_task_output_untracked(task_id)? } {
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
        let server = Server::bind(&addr).serve(make_svc);
        Ok(DevServerListening::new(async move {
            server.await?;
            Ok(())
        }))
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
