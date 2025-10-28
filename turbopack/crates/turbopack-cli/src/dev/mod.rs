use std::{
    env::current_dir,
    future::{Future, join},
    io::{Write, stdout},
    net::{IpAddr, SocketAddr},
    path::{MAIN_SEPARATOR, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use owo_colors::OwoColorize;
use rustc_hash::FxHashSet;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, OperationVc, ResolvedVc, TransientInstance, TurboTasks, UpdateInfo, Vc,
    trace::TraceRawVcs,
    util::{FormatBytes, FormatDuration},
};
use turbo_tasks_backend::{
    BackendOptions, NoopBackingStorage, TurboTasksBackend, noop_backing_storage,
};
use turbo_tasks_fs::FileSystem;
use turbo_tasks_malloc::TurboMalloc;
use turbo_unix_path::join_path;
use turbopack::evaluate_context::node_build_environment;
use turbopack_cli_utils::issue::{ConsoleUi, LogOptions};
use turbopack_core::{
    issue::{IssueReporter, IssueSeverity},
    resolve::parse::Request,
    server_fs::ServerFileSystem,
};
use turbopack_dev_server::{
    DevServer, DevServerBuilder, SourceProvider,
    introspect::IntrospectionSource,
    source::{
        ContentSource, combined::CombinedContentSource, router::PrefixedRouterContentSource,
        static_assets::StaticAssetsContentSource,
    },
};
use turbopack_ecmascript_runtime::RuntimeType;
use turbopack_env::dotenv::load_env;
use turbopack_node::execution_context::ExecutionContext;
use turbopack_nodejs::NodeJsChunkingContext;

use self::web_entry_source::create_web_entry_source;
use crate::{
    arguments::DevArguments,
    contexts::NodeEnv,
    util::{
        EntryRequest, NormalizedDirs, normalize_dirs, normalize_entries, output_fs, project_fs,
    },
};

pub(crate) mod web_entry_source;

type Backend = TurboTasksBackend<NoopBackingStorage>;

pub struct TurbopackDevServerBuilder {
    turbo_tasks: Arc<TurboTasks<Backend>>,
    project_dir: RcStr,
    root_dir: RcStr,
    entry_requests: Vec<EntryRequest>,
    eager_compile: bool,
    hostname: Option<IpAddr>,
    issue_reporter: Option<Box<dyn IssueReporterProvider>>,
    port: Option<u16>,
    browserslist_query: RcStr,
    log_level: IssueSeverity,
    show_all: bool,
    log_detail: bool,
    allow_retry: bool,
}

impl TurbopackDevServerBuilder {
    pub fn new(
        turbo_tasks: Arc<TurboTasks<Backend>>,
        project_dir: RcStr,
        root_dir: RcStr,
    ) -> TurbopackDevServerBuilder {
        TurbopackDevServerBuilder {
            turbo_tasks,
            project_dir,
            root_dir,
            entry_requests: vec![],
            eager_compile: false,
            hostname: None,
            issue_reporter: None,
            port: None,
            browserslist_query: "last 1 Chrome versions, last 1 Firefox versions, last 1 Safari \
                                 versions, last 1 Edge versions"
                .into(),
            log_level: IssueSeverity::Warning,
            show_all: false,
            log_detail: false,
            allow_retry: false,
        }
    }

    pub fn entry_request(mut self, entry_asset_path: EntryRequest) -> TurbopackDevServerBuilder {
        self.entry_requests.push(entry_asset_path);
        self
    }

    pub fn eager_compile(mut self, eager_compile: bool) -> TurbopackDevServerBuilder {
        self.eager_compile = eager_compile;
        self
    }

    pub fn hostname(mut self, hostname: IpAddr) -> TurbopackDevServerBuilder {
        self.hostname = Some(hostname);
        self
    }

    pub fn port(mut self, port: u16) -> TurbopackDevServerBuilder {
        self.port = Some(port);
        self
    }

    pub fn browserslist_query(mut self, browserslist_query: RcStr) -> TurbopackDevServerBuilder {
        self.browserslist_query = browserslist_query;
        self
    }

    pub fn log_level(mut self, log_level: IssueSeverity) -> TurbopackDevServerBuilder {
        self.log_level = log_level;
        self
    }

    pub fn show_all(mut self, show_all: bool) -> TurbopackDevServerBuilder {
        self.show_all = show_all;
        self
    }

    pub fn allow_retry(mut self, allow_retry: bool) -> TurbopackDevServerBuilder {
        self.allow_retry = allow_retry;
        self
    }

    pub fn log_detail(mut self, log_detail: bool) -> TurbopackDevServerBuilder {
        self.log_detail = log_detail;
        self
    }

    pub fn issue_reporter(
        mut self,
        issue_reporter: Box<dyn IssueReporterProvider>,
    ) -> TurbopackDevServerBuilder {
        self.issue_reporter = Some(issue_reporter);
        self
    }

    /// Attempts to find an open port to bind.
    fn find_port(&self, host: IpAddr, port: u16, max_attempts: u16) -> Result<DevServerBuilder> {
        // max_attempts of 1 means we loop 0 times.
        let max_attempts = max_attempts - 1;
        let mut attempts = 0;
        loop {
            let current_port = port + attempts;
            let addr = SocketAddr::new(host, current_port);
            let listen_result = DevServer::listen(addr);

            if let Err(e) = &listen_result
                && self.allow_retry
                && attempts < max_attempts
            {
                // Returned error from `listen` is not `std::io::Error` but `anyhow::Error`,
                // so we need to access its source to check if it is
                // `std::io::ErrorKind::AddrInUse`.
                let should_retry = e
                    .source()
                    .and_then(|e| {
                        e.downcast_ref::<std::io::Error>()
                            .map(|e| e.kind() == std::io::ErrorKind::AddrInUse)
                    })
                    .unwrap_or(false);

                if should_retry {
                    println!(
                        "{} - Port {} is in use, trying {} instead",
                        "warn ".yellow(),
                        current_port,
                        current_port + 1
                    );
                    attempts += 1;
                    continue;
                }
            }

            return listen_result;
        }
    }

    pub async fn build(self) -> Result<DevServer> {
        let port = self.port.context("port must be set")?;
        let host = self.hostname.context("hostname must be set")?;

        let server = self.find_port(host, port, 10)?;

        let turbo_tasks = self.turbo_tasks;
        let project_dir: RcStr = self.project_dir;
        let root_dir: RcStr = self.root_dir;
        let eager_compile = self.eager_compile;
        let show_all = self.show_all;
        let log_detail: bool = self.log_detail;
        let browserslist_query: RcStr = self.browserslist_query;
        let log_args = TransientInstance::new(LogOptions {
            current_dir: current_dir().unwrap(),
            project_dir: PathBuf::from(project_dir.clone()),
            show_all,
            log_detail,
            log_level: self.log_level,
        });
        let entry_requests = Arc::new(self.entry_requests);
        let tasks = turbo_tasks.clone();
        let issue_provider = self.issue_reporter.unwrap_or_else(|| {
            // Initialize a ConsoleUi reporter if no custom reporter was provided
            Box::new(move || Vc::upcast(ConsoleUi::new(log_args.clone())))
        });

        #[derive(Clone, TraceRawVcs, NonLocalValue)]
        struct ServerSourceProvider {
            root_dir: RcStr,
            project_dir: RcStr,
            entry_requests: Arc<Vec<EntryRequest>>,
            eager_compile: bool,
            browserslist_query: RcStr,
        }
        impl SourceProvider for ServerSourceProvider {
            fn get_source(&self) -> OperationVc<Box<dyn ContentSource>> {
                source(
                    self.root_dir.clone(),
                    self.project_dir.clone(),
                    self.entry_requests.clone(),
                    self.eager_compile,
                    self.browserslist_query.clone(),
                )
            }
        }
        let source = ServerSourceProvider {
            root_dir,
            project_dir,
            entry_requests,
            eager_compile,
            browserslist_query,
        };

        let issue_reporter_arc = Arc::new(move || issue_provider.get_issue_reporter());
        Ok(server.serve(tasks, source, issue_reporter_arc))
    }
}

#[turbo_tasks::function(operation)]
async fn source(
    root_dir: RcStr,
    project_dir: RcStr,
    entry_requests: Arc<Vec<EntryRequest>>,
    eager_compile: bool,
    browserslist_query: RcStr,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let project_relative = project_dir.strip_prefix(&*root_dir).unwrap();
    let project_relative: RcStr = project_relative
        .strip_prefix(MAIN_SEPARATOR)
        .unwrap_or(project_relative)
        .replace(MAIN_SEPARATOR, "/")
        .into();

    let output_fs = output_fs(project_dir);
    const OUTPUT_DIR: &str = ".turbopack/build";
    let fs: Vc<Box<dyn FileSystem>> = project_fs(
        root_dir,
        /* watch= */ true,
        join_path(project_relative.as_str(), OUTPUT_DIR)
            .unwrap()
            .into(),
    );
    let root_path = fs.root().owned().await?;
    let project_path = root_path.join(&project_relative)?;

    let env = load_env(root_path.clone());
    let build_output_root = output_fs.root().await?.join(OUTPUT_DIR)?;

    let build_output_root_to_root_path = project_path
        .join(OUTPUT_DIR)?
        .get_relative_path_to(&root_path)
        .context("Project path is in root path")?;
    let build_output_root_to_root_path = build_output_root_to_root_path;

    let build_chunking_context = NodeJsChunkingContext::builder(
        root_path.clone(),
        build_output_root.clone(),
        build_output_root_to_root_path,
        build_output_root.clone(),
        build_output_root.join("chunks")?,
        build_output_root.join("assets")?,
        node_build_environment().to_resolved().await?,
        RuntimeType::Development,
    )
    .build();

    let execution_context =
        ExecutionContext::new(root_path.clone(), Vc::upcast(build_chunking_context), env);

    let server_fs = Vc::upcast::<Box<dyn FileSystem>>(ServerFileSystem::new());
    let server_root = server_fs.root().owned().await?;
    let entry_requests = entry_requests
        .iter()
        .map(|r| match r {
            EntryRequest::Relative(p) => Request::relative(
                p.clone().into(),
                Default::default(),
                Default::default(),
                false,
            ),
            EntryRequest::Module(m, p) => Request::module(
                m.clone().into(),
                p.clone().into(),
                Default::default(),
                Default::default(),
            ),
        })
        .collect();

    let web_source: ResolvedVc<Box<dyn ContentSource>> = create_web_entry_source(
        root_path.clone(),
        execution_context,
        entry_requests,
        server_root,
        rcstr!("/ROOT"),
        env,
        eager_compile,
        NodeEnv::Development.cell(),
        Default::default(),
        browserslist_query,
    )
    .to_resolved()
    .await?;
    let static_source = ResolvedVc::upcast(
        StaticAssetsContentSource::new(Default::default(), project_path.join("public")?)
            .to_resolved()
            .await?,
    );
    let main_source = CombinedContentSource::new(vec![static_source, web_source])
        .to_resolved()
        .await?;
    let introspect = ResolvedVc::upcast(
        IntrospectionSource {
            roots: FxHashSet::from_iter([ResolvedVc::upcast(main_source)]),
        }
        .resolved_cell(),
    );
    let main_source = ResolvedVc::upcast(main_source);
    Ok(Vc::upcast(PrefixedRouterContentSource::new(
        Default::default(),
        vec![(rcstr!("__turbopack__"), introspect)],
        *main_source,
    )))
}

/// Start a devserver with the given args.
pub async fn start_server(args: &DevArguments) -> Result<()> {
    let start = Instant::now();

    #[cfg(feature = "tokio_console")]
    console_subscriber::init();

    let NormalizedDirs {
        project_dir,
        root_dir,
    } = normalize_dirs(&args.common.dir, &args.common.root)?;

    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ));

    let tt_clone = tt.clone();

    let mut server = TurbopackDevServerBuilder::new(tt, project_dir, root_dir)
        .eager_compile(args.eager_compile)
        .hostname(args.hostname)
        .port(args.port)
        .log_detail(args.common.log_detail)
        .show_all(args.common.show_all)
        .log_level(
            args.common
                .log_level
                .map_or_else(|| IssueSeverity::Warning, |l| l.0),
        );

    for entry in normalize_entries(&args.common.entries) {
        server = server.entry_request(EntryRequest::Relative(entry))
    }

    #[cfg(feature = "serializable")]
    {
        server = server.allow_retry(args.allow_retry);
    }

    let server = server.build().await?;

    {
        let addr = &server.addr;
        let hostname = if addr.ip().is_loopback() || addr.ip().is_unspecified() {
            "localhost".to_string()
        } else if addr.is_ipv6() {
            // When using an IPv6 address, we need to surround the IP in brackets to
            // distinguish it from the port's `:`.
            format!("[{}]", addr.ip())
        } else {
            addr.ip().to_string()
        };
        let index_uri = match addr.port() {
            443 => format!("https://{hostname}"),
            80 => format!("http://{hostname}"),
            port => format!("http://{hostname}:{port}"),
        };
        println!(
            "{} - started server on {}, url: {}",
            "ready".green(),
            server.addr,
            index_uri
        );
        if !args.no_open {
            let _ = webbrowser::open(&index_uri);
        }
    }

    let stats_future = async move {
        if args.common.log_detail {
            println!(
                "{event_type} - initial compilation {start} ({memory})",
                event_type = "event".purple(),
                start = FormatDuration(start.elapsed()),
                memory = FormatBytes(TurboMalloc::memory_usage())
            );
        }

        let mut progress_counter = 0;
        loop {
            let update_future = profile_timeout(
                tt_clone.as_ref(),
                tt_clone.aggregated_update_info(Duration::from_millis(100), Duration::MAX),
            );

            if let Some(UpdateInfo {
                duration,
                tasks,
                reasons,
                ..
            }) = update_future.await
            {
                progress_counter = 0;
                match (args.common.log_detail, !reasons.is_empty()) {
                    (true, true) => {
                        println!(
                            "\x1b[2K{event_type} - {reasons} {duration} ({tasks} tasks, {memory})",
                            event_type = "event".purple(),
                            duration = FormatDuration(duration),
                            tasks = tasks,
                            memory = FormatBytes(TurboMalloc::memory_usage())
                        );
                    }
                    (true, false) => {
                        println!(
                            "\x1b[2K{event_type} - compilation {duration} ({tasks} tasks, \
                             {memory})",
                            event_type = "event".purple(),
                            duration = FormatDuration(duration),
                            tasks = tasks,
                            memory = FormatBytes(TurboMalloc::memory_usage())
                        );
                    }
                    (false, true) => {
                        println!(
                            "\x1b[2K{event_type} - {reasons} {duration}",
                            event_type = "event".purple(),
                            duration = FormatDuration(duration),
                        );
                    }
                    (false, false) => {
                        if duration > Duration::from_secs(1) {
                            println!(
                                "\x1b[2K{event_type} - compilation {duration}",
                                event_type = "event".purple(),
                                duration = FormatDuration(duration),
                            );
                        }
                    }
                }
            } else {
                progress_counter += 1;
                if args.common.log_detail {
                    print!(
                        "\x1b[2K{event_type} - updating for {progress_counter}s... ({memory})\r",
                        event_type = "event".purple(),
                        memory = FormatBytes(TurboMalloc::memory_usage())
                    );
                } else {
                    print!(
                        "\x1b[2K{event_type} - updating for {progress_counter}s...\r",
                        event_type = "event".purple(),
                    );
                }
                let _ = stdout().lock().flush();
            }
        }
    };

    join!(stats_future, async { server.future.await.unwrap() }).await;

    Ok(())
}

#[cfg(feature = "profile")]
// When profiling, exits the process when no new updates have been received for
// a given timeout and there are no more tasks in progress.
async fn profile_timeout<T>(tt: &TurboTasks<Backend>, future: impl Future<Output = T>) -> T {
    /// How long to wait in between updates before force-exiting the process
    /// during profiling.
    const PROFILE_EXIT_TIMEOUT: Duration = Duration::from_secs(5);

    futures::pin_mut!(future);
    loop {
        match tokio::time::timeout(PROFILE_EXIT_TIMEOUT, &mut future).await {
            Ok(res) => return res,
            Err(_) => {
                if tt.get_in_progress_count() == 0 {
                    std::process::exit(0)
                }
            }
        }
    }
}

#[cfg(not(feature = "profile"))]
fn profile_timeout<T>(
    _tt: &TurboTasks<Backend>,
    future: impl Future<Output = T>,
) -> impl Future<Output = T> {
    future
}

pub trait IssueReporterProvider: Send + Sync + 'static {
    fn get_issue_reporter(&self) -> Vc<Box<dyn IssueReporter>>;
}

impl<T> IssueReporterProvider for T
where
    T: Fn() -> Vc<Box<dyn IssueReporter>> + Send + Sync + Clone + 'static,
{
    fn get_issue_reporter(&self) -> Vc<Box<dyn IssueReporter>> {
        self()
    }
}
