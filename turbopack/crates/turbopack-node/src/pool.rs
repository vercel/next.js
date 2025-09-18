use std::{
    borrow::Cow,
    cmp::max,
    fmt::{Debug, Display},
    future::Future,
    mem::take,
    path::{Path, PathBuf},
    process::{ExitStatus, Stdio},
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, bail};
use futures::join;
use once_cell::sync::Lazy;
use owo_colors::{OwoColorize, Style};
use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use serde::{Serialize, de::DeserializeOwned};
use tokio::{
    io::{
        AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader, Stderr,
        Stdout, stderr, stdout,
    },
    net::{TcpListener, TcpStream},
    process::{Child, ChildStderr, ChildStdout, Command},
    select,
    sync::{OwnedSemaphorePermit, Semaphore},
    time::{sleep, timeout},
};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, Vc, duration_span};
use turbo_tasks_fs::{FileSystemPath, json::parse_json_with_source_context};
use turbopack_ecmascript::magic_identifier::unmangle_identifiers;

use crate::{AssetsForSourceMapping, heap_queue::HeapQueue, source_map::apply_source_mapping};

#[derive(Clone, Copy)]
pub enum FormattingMode {
    /// No formatting, just print the output
    Plain,
    /// Use ansi colors to format the output
    AnsiColors,
}

impl FormattingMode {
    pub fn magic_identifier<'a>(&self, content: impl Display + 'a) -> impl Display + 'a {
        match self {
            FormattingMode::Plain => format!("{{{content}}}"),
            FormattingMode::AnsiColors => format!("{{{content}}}").italic().to_string(),
        }
    }

    pub fn lowlight<'a>(&self, content: impl Display + 'a) -> impl Display + 'a {
        match self {
            FormattingMode::Plain => Style::new(),
            FormattingMode::AnsiColors => Style::new().dimmed(),
        }
        .style(content)
    }

    pub fn highlight<'a>(&self, content: impl Display + 'a) -> impl Display + 'a {
        match self {
            FormattingMode::Plain => Style::new(),
            FormattingMode::AnsiColors => Style::new().bold().underline(),
        }
        .style(content)
    }
}

struct NodeJsPoolProcess {
    child: Option<Child>,
    connection: TcpStream,
    assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    assets_root: FileSystemPath,
    project_dir: FileSystemPath,
    stdout_handler: OutputStreamHandler<ChildStdout, Stdout>,
    stderr_handler: OutputStreamHandler<ChildStderr, Stderr>,
    debug: bool,
    cpu_time_invested: Duration,
}

impl Ord for NodeJsPoolProcess {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.cpu_time_invested
            .cmp(&other.cpu_time_invested)
            .then_with(|| {
                self.child
                    .as_ref()
                    .map(|c| c.id())
                    .cmp(&other.child.as_ref().map(|c| c.id()))
            })
    }
}

impl PartialOrd for NodeJsPoolProcess {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Eq for NodeJsPoolProcess {}

impl PartialEq for NodeJsPoolProcess {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == std::cmp::Ordering::Equal
    }
}

impl NodeJsPoolProcess {
    pub async fn apply_source_mapping<'a>(
        &self,
        text: &'a str,
        formatting_mode: FormattingMode,
    ) -> Result<Cow<'a, str>> {
        let text = unmangle_identifiers(text, |content| formatting_mode.magic_identifier(content));
        match text {
            Cow::Borrowed(text) => {
                apply_source_mapping(
                    text,
                    *self.assets_for_source_mapping,
                    self.assets_root.clone(),
                    self.project_dir.clone(),
                    formatting_mode,
                )
                .await
            }
            Cow::Owned(ref text) => {
                let cow = apply_source_mapping(
                    text,
                    *self.assets_for_source_mapping,
                    self.assets_root.clone(),
                    self.project_dir.clone(),
                    formatting_mode,
                )
                .await?;
                Ok(Cow::Owned(cow.into_owned()))
            }
        }
    }
}

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, PartialEq, Eq, Hash)]
struct OutputEntry {
    data: Arc<[u8]>,
    stack_trace: Option<Arc<[u8]>>,
}

type SharedOutputSet = Arc<Mutex<FxIndexSet<(OutputEntry, u32)>>>;

static GLOBAL_OUTPUT_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static MARKER: &[u8] = b"TURBOPACK_OUTPUT_";
static MARKER_STR: &str = "TURBOPACK_OUTPUT_";

struct OutputStreamHandler<R: AsyncRead + Unpin, W: AsyncWrite + Unpin> {
    stream: BufReader<R>,
    shared: SharedOutputSet,
    assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    root: FileSystemPath,
    project_dir: FileSystemPath,
    final_stream: W,
}

impl<R: AsyncRead + Unpin, W: AsyncWrite + Unpin> OutputStreamHandler<R, W> {
    /// Pipes the `stream` from `final_stream`, but uses `shared` to deduplicate
    /// lines that has beem emitted by other [OutputStreamHandler] instances
    /// with the same `shared` before.
    /// Returns when one operation is done.
    pub async fn handle_operation(&mut self) -> Result<()> {
        let Self {
            stream,
            shared,
            assets_for_source_mapping,
            root,
            project_dir,
            final_stream,
        } = self;

        async fn write_final<W: AsyncWrite + Unpin>(
            mut bytes: &[u8],
            final_stream: &mut W,
        ) -> Result<()> {
            let _lock = GLOBAL_OUTPUT_LOCK.lock().await;
            while !bytes.is_empty() {
                let count = final_stream.write(bytes).await?;
                if count == 0 {
                    bail!("Failed to write to final stream as it was closed");
                }
                bytes = &bytes[count..];
            }
            Ok(())
        }

        async fn write_source_mapped_final<W: AsyncWrite + Unpin>(
            bytes: &[u8],
            assets_for_source_mapping: Vc<AssetsForSourceMapping>,
            root: FileSystemPath,
            project_dir: FileSystemPath,
            final_stream: &mut W,
        ) -> Result<()> {
            if let Ok(text) = std::str::from_utf8(bytes) {
                let text = unmangle_identifiers(text, |content| {
                    format!("{{{content}}}").italic().to_string()
                });
                match apply_source_mapping(
                    text.as_ref(),
                    assets_for_source_mapping,
                    root,
                    project_dir,
                    FormattingMode::AnsiColors,
                )
                .await
                {
                    Err(e) => {
                        write_final(
                            format!("Error applying source mapping: {e}\n").as_bytes(),
                            final_stream,
                        )
                        .await?;
                        write_final(text.as_bytes(), final_stream).await?;
                    }
                    Ok(text) => {
                        write_final(text.as_bytes(), final_stream).await?;
                    }
                }
            } else {
                write_final(bytes, final_stream).await?;
            }
            Ok(())
        }

        let mut buffer = Vec::new();
        let mut own_output = FxHashMap::default();
        let mut nesting: u32 = 0;
        let mut in_stack = None;
        let mut stack_trace_buffer = Vec::new();
        loop {
            let start = buffer.len();
            if stream
                .read_until(b'\n', &mut buffer)
                .await
                .context("error reading from stream")?
                == 0
            {
                bail!("stream closed unexpectedly")
            }
            if buffer.len() - start == MARKER.len() + 2
                && &buffer[start..buffer.len() - 2] == MARKER
            {
                // This is new line
                buffer.pop();
                // This is the type
                match buffer.pop() {
                    Some(b'B') => {
                        stack_trace_buffer.clear();
                        buffer.truncate(start);
                        nesting += 1;
                        in_stack = None;
                        continue;
                    }
                    Some(b'E') => {
                        buffer.truncate(start);
                        if let Some(in_stack) = in_stack {
                            if nesting != 0 {
                                stack_trace_buffer = buffer[in_stack..].to_vec();
                            }
                            buffer.truncate(in_stack);
                        }
                        nesting = nesting.saturating_sub(1);
                        in_stack = None;
                        if nesting == 0 {
                            let line = Arc::from(take(&mut buffer).into_boxed_slice());
                            let stack_trace = if stack_trace_buffer.is_empty() {
                                None
                            } else {
                                Some(Arc::from(take(&mut stack_trace_buffer).into_boxed_slice()))
                            };
                            let entry = OutputEntry {
                                data: line,
                                stack_trace,
                            };
                            let occurrence_number = *own_output
                                .entry(entry.clone())
                                .and_modify(|c| *c += 1)
                                .or_insert(0);
                            let new_entry = {
                                let mut shared = shared.lock();
                                shared.insert((entry.clone(), occurrence_number))
                            };
                            if !new_entry {
                                // This line has been printed by another process, so we don't need
                                // to print it again.
                                continue;
                            }
                            write_source_mapped_final(
                                &entry.data,
                                **assets_for_source_mapping,
                                root.clone(),
                                project_dir.clone(),
                                final_stream,
                            )
                            .await?;
                        }
                    }
                    Some(b'S') => {
                        buffer.truncate(start);
                        in_stack = Some(start);
                        continue;
                    }
                    Some(b'D') => {
                        // operation done
                        break;
                    }
                    _ => {}
                }
            }
            if nesting != 0 {
                // When inside of a marked output we want to aggregate until the end marker
                continue;
            }

            write_source_mapped_final(
                &buffer,
                **assets_for_source_mapping,
                root.clone(),
                project_dir.clone(),
                final_stream,
            )
            .await?;
            buffer.clear();
        }
        Ok(())
    }
}

impl NodeJsPoolProcess {
    async fn new(
        cwd: &Path,
        env: &FxHashMap<RcStr, RcStr>,
        entrypoint: &Path,
        assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
        assets_root: FileSystemPath,
        project_dir: FileSystemPath,
        shared_stdout: SharedOutputSet,
        shared_stderr: SharedOutputSet,
        debug: bool,
    ) -> Result<Self> {
        let guard = duration_span!("Node.js process startup");
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .context("binding to a port")?;
        let port = listener.local_addr().context("getting port")?.port();
        let mut cmd = Command::new("node");
        cmd.current_dir(cwd);
        if debug {
            cmd.arg("--inspect-brk");
        }
        cmd.arg(entrypoint);
        cmd.arg(port.to_string());
        cmd.env_clear();
        cmd.env(
            "PATH",
            std::env::var("PATH").expect("the PATH environment variable should always be set"),
        );
        #[cfg(target_family = "windows")]
        cmd.env(
            "SystemRoot",
            std::env::var("SystemRoot")
                .expect("the SystemRoot environment variable should always be set"),
        );
        cmd.envs(env);
        cmd.stderr(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.kill_on_drop(true);

        let mut child = cmd.spawn().context("spawning node pooled process")?;

        let timeout = if debug {
            Duration::MAX
        } else {
            CONNECT_TIMEOUT
        };

        async fn get_output(child: &mut Child) -> Result<(String, String)> {
            let mut stdout = Vec::new();
            let mut stderr = Vec::new();
            child
                .stdout
                .take()
                .unwrap()
                .read_to_end(&mut stdout)
                .await?;
            child
                .stderr
                .take()
                .unwrap()
                .read_to_end(&mut stderr)
                .await?;
            fn clean(buffer: Vec<u8>) -> Result<String> {
                Ok(String::from_utf8(buffer)?
                    .lines()
                    .filter(|line| {
                        line.len() != MARKER_STR.len() + 1 && !line.starts_with(MARKER_STR)
                    })
                    .collect::<Vec<_>>()
                    .join("\n"))
            }
            Ok((clean(stdout)?, clean(stderr)?))
        }

        let (connection, _) = select! {
            connection = listener.accept() => connection.context("accepting connection")?,
            status = child.wait() => {
                match status {
                    Ok(status) => {
                        let (stdout, stderr) = get_output(&mut child).await?;
                        bail!("node process exited before we could connect to it with {status}\nProcess output:\n{stdout}\nProcess error output:\n{stderr}");
                    }
                    Err(err) => {
                        let _ = child.start_kill();
                        let (stdout, stderr) = get_output(&mut child).await?;
                        bail!("node process exited before we could connect to it: {err:?}\nProcess output:\n{stdout}\nProcess error output:\n{stderr}");
                    },
                }
            },
            _ = sleep(timeout) => {
                let _ = child.start_kill();
                let (stdout, stderr) = get_output(&mut child).await?;
                bail!("timed out waiting for the Node.js process to connect ({timeout:?} timeout)\nProcess output:\n{stdout}\nProcess error output:\n{stderr}");
            },
        };
        connection.set_nodelay(true)?;

        let child_stdout = BufReader::new(child.stdout.take().unwrap());
        let child_stderr = BufReader::new(child.stderr.take().unwrap());

        let stdout_handler = OutputStreamHandler {
            stream: child_stdout,
            shared: shared_stdout,
            assets_for_source_mapping,
            root: assets_root.clone(),
            project_dir: project_dir.clone(),
            final_stream: stdout(),
        };
        let stderr_handler = OutputStreamHandler {
            stream: child_stderr,
            shared: shared_stderr,
            assets_for_source_mapping,
            root: assets_root.clone(),
            project_dir: project_dir.clone(),
            final_stream: stderr(),
        };

        let mut process = Self {
            child: Some(child),
            connection,
            assets_for_source_mapping,
            assets_root: assets_root.clone(),
            project_dir: project_dir.clone(),
            stdout_handler,
            stderr_handler,
            debug,
            cpu_time_invested: Duration::ZERO,
        };

        drop(guard);

        let guard = duration_span!("Node.js initialization");
        let ready_signal = process.recv().await?;

        if !ready_signal.is_empty() {
            bail!(
                "Node.js process didn't send the expected ready signal\nOutput:\n{}",
                String::from_utf8_lossy(&ready_signal)
            );
        }

        drop(guard);

        Ok(process)
    }

    async fn recv(&mut self) -> Result<Vec<u8>> {
        let connection = &mut self.connection;
        async fn with_timeout<T, E: Into<anyhow::Error>>(
            debug: bool,
            fast: bool,
            future: impl Future<Output = Result<T, E>> + Send,
        ) -> Result<T> {
            if debug {
                future.await.map_err(Into::into)
            } else {
                let time = if fast {
                    Duration::from_secs(20)
                } else {
                    Duration::from_secs(5 * 60)
                };
                timeout(time, future)
                    .await
                    .context("timeout while receiving message from process")?
                    .map_err(Into::into)
            }
        }
        let debug = self.debug;
        let recv_future = async move {
            let packet_len = with_timeout(debug, false, connection.read_u32())
                .await
                .context("reading packet length")?
                .try_into()
                .context("storing packet length")?;
            let mut packet_data = vec![0; packet_len];
            with_timeout(debug, true, connection.read_exact(&mut packet_data))
                .await
                .context("reading packet data")?;
            Ok::<_, anyhow::Error>(packet_data)
        };
        let (result, stdout, stderr) = join!(
            recv_future,
            self.stdout_handler.handle_operation(),
            self.stderr_handler.handle_operation(),
        );
        let result = result?;
        stdout.context("unable to handle stdout from the Node.js process in a structured way")?;
        stderr.context("unable to handle stderr from the Node.js process in a structured way")?;
        Ok(result)
    }

    async fn send(&mut self, packet_data: Vec<u8>) -> Result<()> {
        self.connection
            .write_u32(
                packet_data
                    .len()
                    .try_into()
                    .context("packet length does not fit into u32")?,
            )
            .await
            .context("writing packet length")?;
        self.connection
            .write_all(&packet_data)
            .await
            .context("writing packet data")?;
        self.connection
            .flush()
            .await
            .context("flushing packet data")?;
        Ok(())
    }
}

#[derive(Default)]
struct NodeJsPoolStats {
    pub total_bootup_time: Duration,
    pub bootup_count: u32,
    pub total_cold_process_time: Duration,
    pub cold_process_count: u32,
    pub total_warm_process_time: Duration,
    pub warm_process_count: u32,
    pub workers: u32,
    pub booting_workers: u32,
    pub queued_tasks: u32,
}

impl NodeJsPoolStats {
    fn add_bootup_time(&mut self, time: Duration) {
        self.total_bootup_time += time;
        self.bootup_count += 1;
    }

    fn add_booting_worker(&mut self) {
        self.booting_workers += 1;
        self.workers += 1;
    }

    fn finished_booting_worker(&mut self) {
        self.booting_workers -= 1;
    }

    fn remove_worker(&mut self) {
        self.workers -= 1;
    }

    fn add_queued_task(&mut self) {
        self.queued_tasks += 1;
    }

    fn add_cold_process_time(&mut self, time: Duration) {
        self.total_cold_process_time += time;
        self.cold_process_count += 1;
        self.queued_tasks -= 1;
    }

    fn add_warm_process_time(&mut self, time: Duration) {
        self.total_warm_process_time += time;
        self.warm_process_count += 1;
        self.queued_tasks -= 1;
    }

    fn estimated_bootup_time(&self) -> Duration {
        if self.bootup_count == 0 {
            Duration::from_millis(200)
        } else {
            self.total_bootup_time / self.bootup_count
        }
    }

    fn estimated_warm_process_time(&self) -> Duration {
        if self.warm_process_count == 0 {
            self.estimated_cold_process_time()
        } else {
            self.total_warm_process_time / self.warm_process_count
        }
    }

    fn estimated_cold_process_time(&self) -> Duration {
        if self.cold_process_count == 0 {
            // We assume cold processing is half of bootup time
            self.estimated_bootup_time() / 2
        } else {
            self.total_cold_process_time / self.cold_process_count
        }
    }
    fn wait_time_before_bootup(&self) -> Duration {
        if self.workers == 0 {
            return Duration::ZERO;
        }
        let booting_workers = self.booting_workers;
        let workers = self.workers;
        let warm_process_time = self.estimated_warm_process_time();
        let expected_completion = self.expected_completion(workers, booting_workers);

        let new_process_duration =
            self.estimated_bootup_time() + self.estimated_cold_process_time();
        if expected_completion + warm_process_time < new_process_duration {
            // Running the task with the existing warm pool is faster
            return (expected_completion + warm_process_time + new_process_duration) / 2;
        }

        let expected_completion_with_additional_worker = max(
            new_process_duration,
            self.expected_completion(workers + 1, booting_workers + 1),
        );
        if expected_completion > expected_completion_with_additional_worker {
            // Scaling up the pool would help to complete work faster
            return Duration::ZERO;
        }

        // It's expected to be faster if we queue the task
        (expected_completion + expected_completion_with_additional_worker) / 2
    }

    fn expected_completion(&self, workers: u32, booting_workers: u32) -> Duration {
        if workers == 0 {
            return Duration::MAX;
        }
        let bootup_time = self.estimated_bootup_time();
        let cold_process_time = self.estimated_cold_process_time();
        let warm_process_time = self.estimated_warm_process_time();
        let expected_full_workers_in = booting_workers * (bootup_time / 2 + cold_process_time);
        let expected_completed_task_until_full_workers = {
            let millis = max(1, warm_process_time.as_millis());
            let ready_workers = workers - booting_workers;
            (expected_full_workers_in.as_millis() / millis) as u32 * ready_workers
        };
        let remaining_tasks = self
            .queued_tasks
            .saturating_sub(expected_completed_task_until_full_workers);
        if remaining_tasks > 0 {
            expected_full_workers_in + warm_process_time * remaining_tasks / workers
        } else {
            warm_process_time * self.queued_tasks / workers
        }
    }
}

impl Debug for NodeJsPoolStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NodeJsPoolStats")
            .field("queued_tasks", &self.queued_tasks)
            .field("workers", &self.workers)
            .field("booting_workers", &self.booting_workers)
            .field(
                "expected_completion",
                &self.expected_completion(self.workers, self.booting_workers),
            )
            .field("bootup_time", &self.estimated_bootup_time())
            .field("cold_process_time", &self.estimated_cold_process_time())
            .field("warm_process_time", &self.estimated_warm_process_time())
            .field("bootup_count", &self.bootup_count)
            .field("cold_process_count", &self.cold_process_count)
            .field("warm_process_count", &self.warm_process_count)
            .finish()
    }
}

enum AcquiredPermits {
    Idle {
        // This is used for drop
        #[allow(dead_code)]
        concurrency_permit: OwnedSemaphorePermit,
    },
    Fresh {
        // This is used for drop
        #[allow(dead_code)]
        concurrency_permit: OwnedSemaphorePermit,
        // This is used for drop
        #[allow(dead_code)]
        bootup_permit: OwnedSemaphorePermit,
    },
}

type IdleProcessQueues = Mutex<Vec<Arc<HeapQueue<NodeJsPoolProcess>>>>;

/// All non-empty `IdleProcessQueues`s of the whole application.
/// This is used to scale down processes globally.
static ACTIVE_POOLS: Lazy<IdleProcessQueues> = Lazy::new(Default::default);

/// A pool of Node.js workers operating on [entrypoint] with specific [cwd] and
/// [env].
///
/// The pool will spawn processes when needed and reuses old ones. It will never
/// spawn more then a certain number of concurrent processes. This is specified
/// with the `concurrency` argument in the constructor.
///
/// The worker will *not* use the env of the parent process by default. All env
/// vars need to be provided to make the execution as pure as possible.
#[turbo_tasks::value(into = "new", cell = "new", serialization = "none", eq = "manual")]
pub struct NodeJsPool {
    cwd: PathBuf,
    entrypoint: PathBuf,
    env: FxHashMap<RcStr, RcStr>,
    pub assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub assets_root: FileSystemPath,
    pub project_dir: FileSystemPath,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    idle_processes: Arc<HeapQueue<NodeJsPoolProcess>>,
    /// Semaphore to limit the number of concurrent operations in general
    #[turbo_tasks(trace_ignore, debug_ignore)]
    concurrency_semaphore: Arc<Semaphore>,
    /// Semaphore to limit the number of concurrently booting up processes
    /// (excludes one-off processes)
    #[turbo_tasks(trace_ignore, debug_ignore)]
    bootup_semaphore: Arc<Semaphore>,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    shared_stdout: SharedOutputSet,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    shared_stderr: SharedOutputSet,
    debug: bool,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    stats: Arc<Mutex<NodeJsPoolStats>>,
}

impl NodeJsPool {
    /// * debug: Whether to automatically enable Node's `--inspect-brk` when spawning it. Note:
    ///   automatically overrides concurrency to 1.
    pub(super) fn new(
        cwd: PathBuf,
        entrypoint: PathBuf,
        env: FxHashMap<RcStr, RcStr>,
        assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
        assets_root: FileSystemPath,
        project_dir: FileSystemPath,
        concurrency: usize,
        debug: bool,
    ) -> Self {
        Self {
            cwd,
            entrypoint,
            env,
            assets_for_source_mapping,
            assets_root,
            project_dir,
            concurrency_semaphore: Arc::new(Semaphore::new(if debug { 1 } else { concurrency })),
            bootup_semaphore: Arc::new(Semaphore::new(1)),
            idle_processes: Arc::new(HeapQueue::new()),
            shared_stdout: Arc::new(Mutex::new(FxIndexSet::default())),
            shared_stderr: Arc::new(Mutex::new(FxIndexSet::default())),
            debug,
            stats: Default::default(),
        }
    }

    async fn acquire_process(&self) -> Result<(NodeJsPoolProcess, AcquiredPermits)> {
        {
            self.stats.lock().add_queued_task();
        }

        let concurrency_permit = self.concurrency_semaphore.clone().acquire_owned().await?;

        let bootup = async {
            let permit = self.bootup_semaphore.clone().acquire_owned().await;
            let wait_time = self.stats.lock().wait_time_before_bootup();
            tokio::time::sleep(wait_time).await;
            permit
        };

        select! {
            idle_process_result = self.idle_processes.pop(&ACTIVE_POOLS) => {
                let process = idle_process_result.context("acquiring idle process permit")?;
                Ok((process, AcquiredPermits::Idle { concurrency_permit }))
            },
            bootup_permit = bootup => {
                let bootup_permit = bootup_permit.context("acquiring bootup permit")?;
                {
                    self.stats.lock().add_booting_worker();
                }
                let (process, bootup_time) = self.create_process().await?;
                // Update the worker count
                {
                    let mut stats = self.stats.lock();
                    stats.add_bootup_time(bootup_time);
                    stats.finished_booting_worker();
                }
                // Increase the allowed booting up processes
                self.bootup_semaphore.add_permits(1);
                Ok((process, AcquiredPermits::Fresh { concurrency_permit, bootup_permit }))
            }
        }
    }

    async fn create_process(&self) -> Result<(NodeJsPoolProcess, Duration), anyhow::Error> {
        let start = Instant::now();
        let process = NodeJsPoolProcess::new(
            self.cwd.as_path(),
            &self.env,
            self.entrypoint.as_path(),
            self.assets_for_source_mapping,
            self.assets_root.clone(),
            self.project_dir.clone(),
            self.shared_stdout.clone(),
            self.shared_stderr.clone(),
            self.debug,
        )
        .await
        .context("creating new process")?;
        Ok((process, start.elapsed()))
    }

    pub async fn operation(&self) -> Result<NodeJsOperation> {
        // Acquire a running process (handles concurrency limits, boots up the process)
        let (process, permits) = self.acquire_process().await?;

        Ok(NodeJsOperation {
            process: Some(process),
            permits,
            idle_processes: self.idle_processes.clone(),
            start: Instant::now(),
            stats: self.stats.clone(),
            allow_process_reuse: true,
        })
    }

    pub fn scale_down() {
        let pools = ACTIVE_POOLS.lock().clone();
        for pool in pools {
            pool.reduce_to_one();
        }
    }

    pub fn scale_zero() {
        let pools = ACTIVE_POOLS.lock().clone();
        for pool in pools {
            pool.reduce_to_zero(&ACTIVE_POOLS);
        }
    }
}

pub struct NodeJsOperation {
    process: Option<NodeJsPoolProcess>,
    // This is used for drop
    #[allow(dead_code)]
    permits: AcquiredPermits,
    idle_processes: Arc<HeapQueue<NodeJsPoolProcess>>,
    start: Instant,
    stats: Arc<Mutex<NodeJsPoolStats>>,
    allow_process_reuse: bool,
}

impl NodeJsOperation {
    async fn with_process<'a, F: Future<Output = Result<T>> + Send + 'a, T>(
        &'a mut self,
        f: impl FnOnce(&'a mut NodeJsPoolProcess) -> F,
    ) -> Result<T> {
        let process = self
            .process
            .as_mut()
            .context("Node.js operation already finished")?;

        if !self.allow_process_reuse {
            bail!("Node.js process is no longer usable");
        }

        let result = f(process).await;
        if result.is_err() && self.allow_process_reuse {
            self.stats.lock().remove_worker();
            self.allow_process_reuse = false;
        }
        result
    }

    pub async fn recv<M>(&mut self) -> Result<M>
    where
        M: DeserializeOwned,
    {
        let message = self
            .with_process(|process| async move {
                process.recv().await.context("failed to receive message")
            })
            .await?;
        let message = std::str::from_utf8(&message).context("message is not valid UTF-8")?;
        parse_json_with_source_context(message).context("failed to deserialize message")
    }

    pub async fn send<M>(&mut self, message: M) -> Result<()>
    where
        M: Serialize,
    {
        let message = serde_json::to_vec(&message).context("failed to serialize message")?;
        self.with_process(|process| async move {
            timeout(Duration::from_secs(30), process.send(message))
                .await
                .context("timeout while sending message")?
                .context("failed to send message")?;
            Ok(())
        })
        .await
    }

    pub async fn wait_or_kill(mut self) -> Result<ExitStatus> {
        let mut process = self
            .process
            .take()
            .context("Node.js operation already finished")?;

        if self.allow_process_reuse {
            self.stats.lock().remove_worker();
        }

        let mut child = process
            .child
            .take()
            .context("Node.js operation already finished")?;

        // Ignore error since we are not sure if the process is still alive
        let _ = child.start_kill();
        let status = timeout(Duration::from_secs(30), child.wait())
            .await
            .context("timeout while waiting for process end")?
            .context("waiting for process end")?;

        Ok(status)
    }

    pub fn disallow_reuse(&mut self) {
        if self.allow_process_reuse {
            self.stats.lock().remove_worker();
            self.allow_process_reuse = false;
        }
    }

    pub async fn apply_source_mapping<'a>(
        &self,
        text: &'a str,
        formatting_mode: FormattingMode,
    ) -> Result<Cow<'a, str>> {
        if let Some(process) = self.process.as_ref() {
            process.apply_source_mapping(text, formatting_mode).await
        } else {
            Ok(Cow::Borrowed(text))
        }
    }
}

impl Drop for NodeJsOperation {
    fn drop(&mut self) {
        if let Some(mut process) = self.process.take() {
            let elapsed = self.start.elapsed();
            {
                let stats = &mut self.stats.lock();
                match self.permits {
                    AcquiredPermits::Idle { .. } => stats.add_warm_process_time(elapsed),
                    AcquiredPermits::Fresh { .. } => stats.add_cold_process_time(elapsed),
                }
            }
            if self.allow_process_reuse {
                process.cpu_time_invested += elapsed;
                self.idle_processes.push(process, &ACTIVE_POOLS);
            }
        }
    }
}
