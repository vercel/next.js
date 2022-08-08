#![feature(future_join)]
#![feature(future_poll_fn)]
#![feature(min_specialization)]

use std::{net::IpAddr, sync::Arc};

use anyhow::{anyhow, Context, Result};
use turbo_tasks::{CollectiblesSource, TransientValue, TurboTasks};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack::ecmascript::EcmascriptModuleAssetVc;
use turbopack_cli_utils::issue::issue_to_styled_string;
use turbopack_core::issue::{IssueSeverity, IssueVc};
use turbopack_dev_server::{
    fs::DevServerFileSystemVc, source::router::RouterContentSource, DevServerListening, DevServerVc,
};

use self::web_entry_source::create_web_entry_source;

mod turbo_tasks_viz;
mod web_entry_source;

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

        async fn handle_issues<T: CollectiblesSource + Copy>(source: T) -> Result<()> {
            let issues = IssueVc::peek_issues_with_path(source).await?;
            let issues = issues.await?;
            let mut fatal = false;
            for (issue, path) in issues.iter_with_shortest_path() {
                println!("{}\n", &*issue_to_styled_string(issue, path).await?);
                if *issue.severity().await? >= IssueSeverity::Fatal {
                    fatal = true;
                }
            }

            if fatal {
                Err(anyhow!("Fatal issue(s) occurred"))
            } else {
                Ok(())
            }
        }

        turbo_tasks
            .clone()
            .run_once(async move {
                let disk_fs = DiskFileSystemVc::new(
                    "project".to_string(),
                    self.project_dir.context("project_dir must be set")?,
                );
                let fs = disk_fs.into();
                let dev_server_fs = DevServerFileSystemVc::new().as_file_system();
                let main_source = create_web_entry_source(
                    FileSystemPathVc::new(fs, ""),
                    FileSystemPathVc::new(
                        fs,
                        &self
                            .entry_asset_path
                            .context("entry_asset_path must be set")?,
                    ),
                    dev_server_fs,
                    self.eager_compile,
                );
                let viz = turbo_tasks_viz::TurboTasksSource {
                    turbo_tasks: turbo_tasks.clone(),
                }
                .cell()
                .into();
                let source = RouterContentSource {
                    routes: vec![("__turbo_tasks__/".to_string(), viz)],
                    fallback: main_source,
                }
                .cell()
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

                handle_issues(disk_fs).await?;
                handle_issues(dev_server_fs).await?;
                handle_issues(main_source).await?;
                handle_issues(server).await?;

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
