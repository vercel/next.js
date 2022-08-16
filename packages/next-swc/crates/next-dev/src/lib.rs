#![feature(future_join)]
#![feature(min_specialization)]

use std::{net::IpAddr, path::MAIN_SEPARATOR, sync::Arc};

use anyhow::{anyhow, Context, Result};
use next_core::{create_server_rendered_source, create_web_entry_source};
use turbo_tasks::{CollectiblesSource, TransientInstance, TurboTasks};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc, FileSystemVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack_cli_utils::issue::issue_to_styled_string;
use turbopack_core::issue::{IssueSeverity, IssueVc};
use turbopack_dev_server::{
    fs::DevServerFileSystemVc,
    source::{combined::CombinedContentSource, router::RouterContentSource, ContentSourceVc},
    DevServer,
};

mod turbo_tasks_viz;

pub struct NextDevServerBuilder {
    turbo_tasks: Option<Arc<TurboTasks<MemoryBackend>>>,
    project_dir: Option<String>,
    entry_assets: Vec<String>,
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
            entry_assets: vec![],
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

    pub fn entry_asset(mut self, entry_asset_path: String) -> NextDevServerBuilder {
        self.entry_assets.push(entry_asset_path);
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

    pub async fn build(self) -> Result<DevServer> {
        let turbo_tasks = self.turbo_tasks.context("turbo_tasks must be set")?;

        let project_dir = self.project_dir.context("project_dir must be set")?;
        let entry_assets = self.entry_assets;
        let eager_compile = self.eager_compile;

        let server = DevServer::listen(
            turbo_tasks.clone(),
            move || {
                source(
                    project_dir.clone(),
                    entry_assets.clone(),
                    eager_compile,
                    turbo_tasks.clone().into(),
                )
            },
            (
                self.hostname.context("hostname must be set")?,
                self.port.context("port must be set")?,
            )
                .into(),
        );

        Ok(server)
    }
}

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

#[turbo_tasks::function]
async fn project_fs(project_dir: &str) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new("project".to_string(), project_dir.to_string());
    handle_issues(disk_fs).await?;
    disk_fs.await?.start_watching()?;
    Ok(disk_fs.into())
}

#[turbo_tasks::function]
async fn output_fs(project_dir: &str) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new(
        "output".to_string(),
        format!("{project_dir}{s}.next{s}server", s = MAIN_SEPARATOR),
    );
    handle_issues(disk_fs).await?;
    disk_fs.await?.start_watching()?;
    Ok(disk_fs.into())
}

#[turbo_tasks::function]
async fn source(
    project_dir: String,
    entry_assets: Vec<String>,
    eager_compile: bool,
    turbo_tasks: TransientInstance<TurboTasks<MemoryBackend>>,
) -> Result<ContentSourceVc> {
    let output_fs = output_fs(&project_dir);
    let fs = project_fs(&project_dir);

    let dev_server_fs = DevServerFileSystemVc::new().as_file_system();
    let web_source = create_web_entry_source(
        FileSystemPathVc::new(fs, ""),
        entry_assets
            .iter()
            .map(|a| FileSystemPathVc::new(fs, a))
            .collect(),
        dev_server_fs,
        eager_compile,
    );
    let rendered_source = create_server_rendered_source(
        FileSystemPathVc::new(fs, ""),
        FileSystemPathVc::new(output_fs, ""),
        FileSystemPathVc::new(dev_server_fs, ""),
    );
    let viz = turbo_tasks_viz::TurboTasksSource {
        turbo_tasks: turbo_tasks.into(),
    }
    .cell()
    .into();
    let source = RouterContentSource {
        routes: vec![("__turbo_tasks__/".to_string(), viz)],
        fallback: CombinedContentSource {
            sources: vec![rendered_source, web_source],
        }
        .cell()
        .into(),
    }
    .cell()
    .into();

    handle_issues(dev_server_fs).await?;
    handle_issues(web_source).await?;
    handle_issues(rendered_source).await?;

    Ok(source)
}

pub fn register() {
    next_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
