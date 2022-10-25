#![feature(future_join)]
#![feature(min_specialization)]

mod turbo_tasks_viz;

use std::{collections::HashSet, env::current_dir, net::IpAddr, path::MAIN_SEPARATOR, sync::Arc};

use anyhow::{anyhow, Context, Result};
use next_core::{
    create_app_source, create_server_rendered_source, create_web_entry_source, env::load_env,
    source_map::NextSourceMapTraceContentSourceVc,
};
use turbo_tasks::{
    primitives::StringsVc, RawVc, TransientInstance, TransientValue, TurboTasks, Value,
};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack_cli_utils::issue::{ConsoleUi, ConsoleUiVc, LogOptions};
use turbopack_core::{issue::IssueSeverity, resolve::parse::RequestVc};
use turbopack_dev_server::{
    fs::DevServerFileSystemVc,
    introspect::IntrospectionSource,
    source::{
        combined::CombinedContentSource, router::RouterContentSource,
        static_assets::StaticAssetsContentSourceVc, ContentSourceVc,
    },
    DevServer,
};

pub struct NextDevServerBuilder {
    turbo_tasks: Arc<TurboTasks<MemoryBackend>>,
    project_dir: String,
    root_dir: String,
    entry_requests: Vec<String>,
    server_component_externals: Vec<String>,
    eager_compile: bool,
    hostname: Option<IpAddr>,
    port: Option<u16>,
    browserslist_query: String,
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
            server_component_externals: vec![],
            eager_compile: false,
            hostname: None,
            port: None,
            browserslist_query: "last 1 Chrome versions, last 1 Firefox versions, last 1 Safari \
                                 versions, last 1 Edge versions"
                .to_owned(),
            log_level: IssueSeverity::Warning,
            show_all: false,
            log_detail: false,
        }
    }

    pub fn entry_request(mut self, entry_asset_path: String) -> NextDevServerBuilder {
        self.entry_requests.push(entry_asset_path);
        self
    }

    pub fn server_component_external(mut self, external: String) -> NextDevServerBuilder {
        self.server_component_externals.push(external);
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

    pub fn browserslist_query(mut self, browserslist_query: String) -> NextDevServerBuilder {
        self.browserslist_query = browserslist_query;
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
        let server_component_externals = self.server_component_externals;
        let eager_compile = self.eager_compile;
        let show_all = self.show_all;
        let log_detail = self.log_detail;
        let browserslist_query = self.browserslist_query;
        let log_options = LogOptions {
            current_dir: current_dir().unwrap(),
            show_all,
            log_detail,
            log_level: self.log_level,
        };
        let console_ui = Arc::new(ConsoleUi::new(log_options));
        let console_ui_to_dev_server = console_ui.clone();

        let server = DevServer::listen(
            turbo_tasks.clone(),
            move || {
                source(
                    root_dir.clone(),
                    project_dir.clone(),
                    entry_requests.clone(),
                    eager_compile,
                    turbo_tasks.clone().into(),
                    console_ui.clone().into(),
                    browserslist_query.clone(),
                    server_component_externals.clone(),
                )
            },
            (
                self.hostname.context("hostname must be set")?,
                self.port.context("port must be set")?,
            )
                .into(),
            console_ui_to_dev_server,
        );

        server
    }
}

async fn handle_issues<T: Into<RawVc>>(source: T, console_ui: ConsoleUiVc) -> Result<()> {
    let state = console_ui
        .group_and_display_issues(TransientValue::new(source.into()))
        .await?;

    if state.has_fatal {
        Err(anyhow!("Fatal issue(s) occurred"))
    } else {
        Ok(())
    }
}

#[turbo_tasks::function]
async fn project_fs(project_dir: &str, console_ui: ConsoleUiVc) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new("project".to_string(), project_dir.to_string());
    handle_issues(disk_fs, console_ui).await?;
    disk_fs.await?.start_watching()?;
    Ok(disk_fs.into())
}

#[turbo_tasks::function]
async fn output_fs(project_dir: &str, console_ui: ConsoleUiVc) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new("output".to_string(), project_dir.to_string());
    handle_issues(disk_fs, console_ui).await?;
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
    console_ui: TransientInstance<ConsoleUi>,
    browserslist_query: String,
    server_component_externals: Vec<String>,
) -> Result<ContentSourceVc> {
    let console_ui = (*console_ui).clone().cell();
    let output_fs = output_fs(&project_dir, console_ui);
    let fs = project_fs(&root_dir, console_ui);
    let project_relative = project_dir.strip_prefix(&root_dir).unwrap();
    let project_relative = project_relative
        .strip_prefix(MAIN_SEPARATOR)
        .unwrap_or(project_relative);
    let project_path = fs.root().join(project_relative);

    let env = load_env(project_path);

    let output_root = output_fs.root().join("/.next/server");

    let dev_server_fs = DevServerFileSystemVc::new().as_file_system();
    let dev_server_root = dev_server_fs.root();

    let web_source = create_web_entry_source(
        project_path,
        entry_requests
            .iter()
            .map(|a| RequestVc::relative(Value::new(a.to_string().into()), false))
            .collect(),
        dev_server_root,
        env,
        eager_compile,
        &browserslist_query,
    );
    let rendered_source = create_server_rendered_source(
        project_path,
        output_root.join("pages"),
        dev_server_root,
        env,
        &browserslist_query,
    );
    let app_source = create_app_source(
        project_path,
        output_root.join("app"),
        dev_server_root,
        env,
        &browserslist_query,
        StringsVc::cell(server_component_externals),
    );
    let viz = turbo_tasks_viz::TurboTasksSource {
        turbo_tasks: turbo_tasks.into(),
    }
    .cell()
    .into();
    let static_source =
        StaticAssetsContentSourceVc::new(String::new(), project_path.join("public")).into();
    let main_source = CombinedContentSource {
        sources: vec![static_source, app_source, rendered_source, web_source],
    }
    .cell();
    let introspect = IntrospectionSource {
        roots: HashSet::from([main_source.into()]),
    }
    .cell()
    .into();
    let source_map_trace = NextSourceMapTraceContentSourceVc::new(rendered_source).into();
    let source = RouterContentSource {
        routes: vec![
            ("__turbopack__/".to_string(), introspect),
            ("__turbo_tasks__/".to_string(), viz),
            (
                "__nextjs_original-stack-frame".to_string(),
                source_map_trace,
            ),
        ],
        fallback: main_source.into(),
    }
    .cell()
    .into();

    handle_issues(dev_server_fs, console_ui).await?;
    handle_issues(web_source, console_ui).await?;
    handle_issues(rendered_source, console_ui).await?;

    Ok(source)
}

pub fn register() {
    next_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
