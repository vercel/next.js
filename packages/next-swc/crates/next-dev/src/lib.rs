#![feature(future_join)]
#![feature(min_specialization)]

use std::{net::IpAddr, path::MAIN_SEPARATOR, sync::Arc};

use anyhow::{anyhow, Context, Result};
use next_core::{create_server_rendered_source, create_web_entry_source, env::load_env};
use turbo_tasks::{CollectiblesSource, TransientInstance, TurboTasks, Value};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc, FileSystemVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack_cli_utils::issue::{group_and_display_issues, LogOptions, LogOptionsVc};
use turbopack_core::{
    issue::{IssueSeverity, IssueVc},
    resolve::parse::RequestVc,
};
use turbopack_dev_server::{
    fs::DevServerFileSystemVc,
    source::{combined::CombinedContentSource, router::RouterContentSource, ContentSourceVc},
    DevServer,
};

mod turbo_tasks_viz;

pub struct NextDevServerBuilder {
    turbo_tasks: Arc<TurboTasks<MemoryBackend>>,
    project_dir: String,
    root_dir: String,
    entry_requests: Vec<String>,
    eager_compile: bool,
    hostname: Option<IpAddr>,
    port: Option<u16>,
    log_level: IssueSeverity,
    show_all: bool,
    log_detail: bool,
}

impl NextDevServerBuilder {
    pub fn new(
        turbo_tasks: Arc<TurboTasks<MemoryBackend>>,
        project_dir: String,
        root_dir: String,
    ) -> NextDevServerBuilder {
        NextDevServerBuilder {
            turbo_tasks,
            project_dir,
            root_dir,
            entry_requests: vec![],
            eager_compile: false,
            hostname: None,
            port: None,
            log_level: IssueSeverity::Warning,
            show_all: false,
            log_detail: false,
        }
    }

    pub fn entry_request(mut self, entry_asset_path: String) -> NextDevServerBuilder {
        self.entry_requests.push(entry_asset_path);
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

    pub fn log_level(mut self, log_level: IssueSeverity) -> NextDevServerBuilder {
        self.log_level = log_level;
        self
    }

    pub fn show_all(mut self, show_all: bool) -> NextDevServerBuilder {
        self.show_all = show_all;
        self
    }

    pub fn log_detail(mut self, log_detail: bool) -> NextDevServerBuilder {
        self.log_detail = log_detail;
        self
    }

    pub async fn build(self) -> Result<DevServer> {
        let turbo_tasks = self.turbo_tasks;

        let project_dir = self.project_dir;
        let root_dir = self.root_dir;
        let entry_requests = self.entry_requests;
        let eager_compile = self.eager_compile;
        let show_all = self.show_all;
        let log_detail = self.log_detail;
        let log_options = LogOptions {
            project_dir: project_dir.clone(),
            show_all,
            log_detail,
            log_level: self.log_level,
        };
        let log_options_to_dev_server = log_options.clone();

        let server = DevServer::listen(
            turbo_tasks.clone(),
            move || {
                source(
                    root_dir.clone(),
                    project_dir.clone(),
                    entry_requests.clone(),
                    eager_compile,
                    turbo_tasks.clone().into(),
                    log_options.clone().cell(),
                )
            },
            (
                self.hostname.context("hostname must be set")?,
                self.port.context("port must be set")?,
            )
                .into(),
            log_options_to_dev_server,
        );

        Ok(server)
    }
}

async fn handle_issues<T: CollectiblesSource + Copy>(
    source: T,
    options: LogOptionsVc,
) -> Result<()> {
    let issues = IssueVc::peek_issues_with_path(source).await?;
    let fatal = *group_and_display_issues(options, issues).await?;

    if fatal {
        Err(anyhow!("Fatal issue(s) occurred"))
    } else {
        Ok(())
    }
}

#[turbo_tasks::function]
async fn project_fs(project_dir: &str, log_options: LogOptionsVc) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new("project".to_string(), project_dir.to_string());
    handle_issues(disk_fs, log_options).await?;
    disk_fs.await?.start_watching()?;
    Ok(disk_fs.into())
}

#[turbo_tasks::function]
async fn output_fs(project_dir: &str, log_options: LogOptionsVc) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new(
        "output".to_string(),
        format!("{project_dir}{s}.next{s}server", s = MAIN_SEPARATOR),
    );
    handle_issues(disk_fs, log_options).await?;
    disk_fs.await?.start_watching()?;
    Ok(disk_fs.into())
}

#[turbo_tasks::function]
async fn source(
    root_dir: String,
    project_dir: String,
    entry_requests: Vec<String>,
    eager_compile: bool,
    turbo_tasks: TransientInstance<TurboTasks<MemoryBackend>>,
    log_options: LogOptionsVc,
) -> Result<ContentSourceVc> {
    let output_fs = output_fs(&project_dir, log_options);
    let fs = project_fs(&root_dir, log_options);
    let project_relative = project_dir.strip_prefix(&root_dir).unwrap();
    let project_relative = project_relative
        .strip_prefix(MAIN_SEPARATOR)
        .unwrap_or(project_relative);
    let project_path = FileSystemPathVc::new(fs, project_relative);

    let env = load_env(project_path);

    let dev_server_fs = DevServerFileSystemVc::new().as_file_system();
    let web_source = create_web_entry_source(
        project_path,
        entry_requests
            .iter()
            .map(|a| RequestVc::relative(Value::new(a.to_string().into()), false))
            .collect(),
        dev_server_fs,
        env,
        eager_compile,
    );
    let rendered_source = create_server_rendered_source(
        project_path,
        FileSystemPathVc::new(output_fs, ""),
        FileSystemPathVc::new(dev_server_fs, ""),
        env,
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

    handle_issues(dev_server_fs, log_options).await?;
    handle_issues(web_source, log_options).await?;
    handle_issues(rendered_source, log_options).await?;

    Ok(source)
}

pub fn register() {
    next_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
