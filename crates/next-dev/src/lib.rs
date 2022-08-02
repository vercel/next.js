#![feature(future_join)]
#![feature(future_poll_fn)]
#![feature(min_specialization)]

use std::{net::IpAddr, sync::Arc};

use anyhow::{anyhow, Context, Result};
use turbo_tasks::{TransientValue, TurboTasks, Value};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{ecmascript::ModuleAssetVc as EcmascriptModuleAssetVc, ModuleAssetContextVc};
use turbopack_core::{
    chunk::{
        dev::{DevChunkingContext, DevChunkingContextVc},
        ChunkGroupVc, ChunkableAssetVc,
    },
    context::AssetContextVc,
    environment::{BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment},
    source_asset::SourceAssetVc,
};
use turbopack_dev_server::{
    fs::DevServerFileSystemVc,
    html::DevHtmlAsset,
    source::{asset_graph::AssetGraphContentSourceVc, router::RouterContentSource},
    DevServerListening, DevServerVc,
};

mod turbo_tasks_viz;

pub struct NextDevServerBuilder {
    turbo_tasks: Option<Arc<TurboTasks<MemoryBackend>>>,
    project_dir: Option<String>,
    entry_asset_path: Option<String>,
    eager_compile: bool,
    hostname: Option<IpAddr>,
    port: Option<u16>,
}

impl Default for NextDevServerBuilder {
    fn default() -> Self {
        NextDevServerBuilder::new()
    }
}

impl NextDevServerBuilder {
    pub fn new() -> NextDevServerBuilder {
        NextDevServerBuilder {
            turbo_tasks: None,
            project_dir: None,
            entry_asset_path: None,
            eager_compile: false,
            hostname: None,
            port: None,
        }
    }

    pub fn turbo_tasks(mut self, tt: Arc<TurboTasks<MemoryBackend>>) -> NextDevServerBuilder {
        self.turbo_tasks = Some(tt);
        self
    }

    pub fn project_dir(mut self, project_dir: String) -> NextDevServerBuilder {
        self.project_dir = Some(project_dir);
        self
    }

    pub fn entry_asset_path(mut self, entry_asset_path: String) -> NextDevServerBuilder {
        self.entry_asset_path = Some(entry_asset_path);
        self
    }

    pub fn eager_compile(mut self, eager_compile: bool) -> NextDevServerBuilder {
        self.eager_compile = eager_compile;
        self
    }

    pub fn hostname(mut self, hostname: IpAddr) -> NextDevServerBuilder {
        self.hostname = Some(hostname);
        self
    }

    pub fn port(mut self, port: u16) -> NextDevServerBuilder {
        self.port = Some(port);
        self
    }

    pub async fn build(self) -> Result<DevServerListening> {
        let turbo_tasks = self.turbo_tasks.context("turbo_tasks must be set")?;

        turbo_tasks
            .clone()
            .run_once(async move {
                let disk_fs = DiskFileSystemVc::new(
                    "project".to_string(),
                    self.project_dir.context("project_dir must be set")?,
                );
                let fs = disk_fs.into();
                let root = FileSystemPathVc::new(fs, "");
                let source_asset = SourceAssetVc::new(FileSystemPathVc::new(
                    fs,
                    &self
                        .entry_asset_path
                        .context("entry_asset_path must be set")?,
                ))
                .into();
                let context: AssetContextVc = ModuleAssetContextVc::new(
                    root,
                    EnvironmentVc::new(
                        Value::new(ExecutionEnvironment::Browser(
                            BrowserEnvironment {
                                dom: true,
                                web_worker: false,
                                service_worker: false,
                                browser_version: 0,
                            }
                            .into(),
                        )),
                        Value::new(EnvironmentIntention::Client),
                    ),
                )
                .into();
                let module = context.process(source_asset);
                let dev_server_fs = DevServerFileSystemVc::new().as_file_system();
                let chunking_context: DevChunkingContextVc = DevChunkingContext {
                    context_path: root,
                    chunk_root_path: FileSystemPathVc::new(dev_server_fs, "/_next/chunks"),
                    asset_root_path: FileSystemPathVc::new(dev_server_fs, "/_next/static"),
                }
                .into();
                let entry_asset = if let Some(ecmascript) =
                    EcmascriptModuleAssetVc::resolve_from(module).await?
                {
                    let chunk = ecmascript.as_evaluated_chunk(chunking_context.into());
                    let chunk_group = ChunkGroupVc::from_chunk(chunk);
                    DevHtmlAsset {
                        path: FileSystemPathVc::new(dev_server_fs, "index.html"),
                        chunk_group,
                    }
                    .into()
                } else if let Some(chunkable) = ChunkableAssetVc::resolve_from(module).await? {
                    let chunk = chunkable.as_chunk(chunking_context.into());
                    let chunk_group = ChunkGroupVc::from_chunk(chunk);
                    DevHtmlAsset {
                        path: FileSystemPathVc::new(dev_server_fs, "index.html"),
                        chunk_group,
                    }
                    .into()
                } else {
                    // TODO convert into a serve-able asset
                    return Err(anyhow!(
                        "Entry module is not chunkable, so it can't be used to bootstrap the \
                         application"
                    ));
                };

                let root_path = FileSystemPathVc::new(dev_server_fs, "");
                let graph = if self.eager_compile {
                    AssetGraphContentSourceVc::new_eager(root_path, entry_asset)
                } else {
                    AssetGraphContentSourceVc::new_lazy(root_path, entry_asset)
                }
                .into();
                let viz = turbo_tasks_viz::TurboTasksSource {
                    turbo_tasks: turbo_tasks.clone(),
                }
                .into();
                let source = RouterContentSource {
                    routes: vec![("__turbo_tasks__/".to_string(), viz)],
                    fallback: graph,
                }
                .into();

                let server = DevServerVc::new(
                    source,
                    TransientValue::new(
                        (
                            self.hostname.context("hostname must be set")?,
                            self.port.context("port must be set")?,
                        )
                            .into(),
                    ),
                );
                disk_fs.await?.start_watching()?;
                server.listen().await
            })
            .await
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_dev_server::register();
    turbopack::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
