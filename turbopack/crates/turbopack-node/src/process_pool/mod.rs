use std::{
    collections::VecDeque,
    future::Future,
    mem::take,
    path::{Path, PathBuf},
    process::{ExitStatus, Stdio},
    sync::{Arc, LazyLock},
    time::{Duration, Instant},
};

use anyhow::{Context, Result, bail};
use bytes::Bytes;
use futures::join;
use owo_colors::OwoColorize;
use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use tokio::{
    io::{
        AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader, Stderr,
        Stdout, stderr, stdout,
    },
    net::{TcpListener, TcpStream},
    process::{Child, ChildStderr, ChildStdout, Command},
    select,
    sync::Semaphore,
    time::{sleep, timeout},
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexSet, ResolvedVc, Vc, duration_span};
use turbo_tasks_fs::FileSystemPath;
use turbopack_ecmascript::magic_identifier::unmangle_identifiers;

use crate::{
    AssetsForSourceMapping,
    backend::{CreatePoolFuture, CreatePoolOptions, NodeBackend},
    evaluate::{EvaluateOperation, EvaluatePool, Operation},
    format::FormattingMode,
    pool_stats::{AcquiredPermits, NodeJsPoolStats, PoolStatsSnapshot},
    source_map::apply_source_mapping,
};

mod heap_queue;
use heap_queue::HeapQueue;

struct NodeJsPoolProcess {
    child: Option<Child>,
    connection: TcpStream,
    stdout_handler: OutputStreamHandler<ChildStdout, Stdout>,
    stderr_handler: OutputStreamHandler<ChildStderr, Stderr>,
    /// Shared ring buffer of recent stdout lines; lives independently of
    /// `stdout_handler` so the post-mortem on a recv failure can still read
    /// it after the handler future has returned an error.
    recent_stdout: RecentLines,
    recent_stderr: RecentLines,
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

/// Maximum number of recent output lines retained per stream for diagnostic
/// purposes — included in the error message when the subprocess crashes
/// before completing a recv.
const RECENT_OUTPUT_LINES: usize = 100;

/// A bounded ring buffer of recent lines from a child stream. Shared with the
/// owning [`NodeJsPoolProcess`] so that the post-mortem code on a recv failure
/// can read what the child wrote even if the handler future has already
/// returned an error (and dropped its local state).
type RecentLines = Arc<Mutex<VecDeque<Vec<u8>>>>;

struct OutputStreamHandler<R: AsyncRead + Unpin, W: AsyncWrite + Unpin> {
    stream: BufReader<R>,
    shared: SharedOutputSet,
    assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    root: FileSystemPath,
    project_dir: FileSystemPath,
    final_stream: W,
    recent_lines: RecentLines,
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
            recent_lines,
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
            // Mirror the just-read line into the recent-lines ring buffer for
            // diagnostic capture on subprocess crash. Skip protocol markers.
            let line_is_marker = buffer.len() - start == MARKER.len() + 2
                && &buffer[start..buffer.len() - 2] == MARKER;
            if !line_is_marker {
                let mut lines = recent_lines.lock();
                if lines.len() >= RECENT_OUTPUT_LINES {
                    lines.pop_front();
                }
                lines.push_back(buffer[start..].to_vec());
            } else {
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

        let recent_stdout: RecentLines =
            Arc::new(Mutex::new(VecDeque::with_capacity(RECENT_OUTPUT_LINES)));
        let recent_stderr: RecentLines =
            Arc::new(Mutex::new(VecDeque::with_capacity(RECENT_OUTPUT_LINES)));

        let stdout_handler = OutputStreamHandler {
            stream: child_stdout,
            shared: shared_stdout,
            assets_for_source_mapping,
            root: assets_root.clone(),
            project_dir: project_dir.clone(),
            final_stream: stdout(),
            recent_lines: recent_stdout.clone(),
        };
        let stderr_handler = OutputStreamHandler {
            stream: child_stderr,
            shared: shared_stderr,
            assets_for_source_mapping,
            root: assets_root.clone(),
            project_dir: project_dir.clone(),
            final_stream: stderr(),
            recent_lines: recent_stderr.clone(),
        };

        let mut process = Self {
            child: Some(child),
            connection,
            stdout_handler,
            stderr_handler,
            recent_stdout,
            recent_stderr,
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

    async fn recv(&mut self) -> Result<Bytes> {
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
            Ok::<_, anyhow::Error>(packet_data.into())
        };
        let (result, stdout, stderr) = join!(
            recv_future,
            self.stdout_handler.handle_operation(),
            self.stderr_handler.handle_operation(),
        );
        let result = match result {
            Err(err) => {
                // The IPC read failed — the most common cause is the child
                // process crashing or exiting before sending a response.
                // Attach whatever output the child wrote (recent lines from
                // both stream handlers + the child's exit status, if
                // available) so the user sees something diagnostic instead
                // of an opaque "unexpected end of file" cascade.
                return Err(self.diagnostic_recv_error(err).await);
            }
            Ok(result) => result,
        };
        stdout.context("unable to handle stdout from the Node.js process in a structured way")?;
        stderr.context("unable to handle stderr from the Node.js process in a structured way")?;
        Ok(result)
    }

    /// Build a contextualized error for a failed [`Self::recv`]. Includes
    /// the captured stdout/stderr ring buffers and, if the child has
    /// terminated, its exit status.
    async fn diagnostic_recv_error(&mut self, err: anyhow::Error) -> anyhow::Error {
        let exit_status = match self.child.as_mut() {
            Some(child) => match timeout(Duration::from_secs(2), child.wait()).await {
                Ok(Ok(status)) => Some(status),
                _ => None,
            },
            None => None,
        };
        let mut output = String::new();
        let stdout_lines: Vec<Vec<u8>> = self.recent_stdout.lock().iter().cloned().collect();
        let stderr_lines: Vec<Vec<u8>> = self.recent_stderr.lock().iter().cloned().collect();
        if !stdout_lines.is_empty() {
            output.push_str("\nRecent process stdout:\n");
            for line in stdout_lines {
                output.push_str(&String::from_utf8_lossy(&line));
            }
        }
        if !stderr_lines.is_empty() {
            output.push_str("\nRecent process stderr:\n");
            for line in stderr_lines {
                output.push_str(&String::from_utf8_lossy(&line));
            }
        }
        let exit_note = match exit_status {
            Some(status) => format!("Node.js process exited with {status}"),
            None => "Node.js process is still running or its exit status is unavailable".into(),
        };
        // ast-grep-ignore: no-context-format
        err.context(format!("{exit_note}{output}"))
    }
    async fn send(&mut self, packet_data: Bytes) -> Result<()> {
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

type IdleProcessQueues = Mutex<Vec<Arc<HeapQueue<NodeJsPoolProcess>>>>;

/// All non-empty `IdleProcessQueues`s of the whole application.
/// This is used to scale down processes globally.
static ACTIVE_POOLS: LazyLock<IdleProcessQueues> = LazyLock::new(Default::default);

/// Arguments needed to spawn a new Node.js process. Extracted so that
/// `pre_warm` can clone them once instead of cloning each pool field
/// individually.
struct ProcessArgs {
    cwd: PathBuf,
    env: FxHashMap<RcStr, RcStr>,
    entrypoint: PathBuf,
    assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    assets_root: FileSystemPath,
    project_dir: FileSystemPath,
    shared_stdout: SharedOutputSet,
    shared_stderr: SharedOutputSet,
    debug: bool,
}

impl ProcessArgs {
    async fn create_process(self) -> Result<(NodeJsPoolProcess, Duration)> {
        let start = Instant::now();
        let process = NodeJsPoolProcess::new(
            &self.cwd,
            &self.env,
            &self.entrypoint,
            self.assets_for_source_mapping,
            self.assets_root,
            self.project_dir,
            self.shared_stdout,
            self.shared_stderr,
            self.debug,
        )
        .await?;
        Ok((process, start.elapsed()))
    }
}

/// A pool of Node.js workers operating on an `entrypoint` with specific `cwd` and `env`.
///
/// The pool will spawn processes when needed and reuses old ones. It will never spawn more then a
/// certain number of concurrent processes. This is specified with the `concurrency` argument in the
/// constructor.
///
/// The worker will *not* use the `env` of the parent process by default. All environment variables
/// need to be provided to make the execution as pure as possible.
#[turbo_tasks::value(
    cell = "new",
    serialization = "skip",
    evict = "last",
    eq = "manual",
    shared
)]
pub struct ChildProcessPool {
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

impl ChildProcessPool {
    /// * debug: Whether to automatically enable Node's `--inspect-brk` when spawning it. Note:
    ///   automatically overrides concurrency to 1.
    pub fn create(
        cwd: PathBuf,
        entrypoint: PathBuf,
        env: FxHashMap<RcStr, RcStr>,
        assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
        assets_root: FileSystemPath,
        project_dir: FileSystemPath,
        concurrency: usize,
        debug: bool,
    ) -> EvaluatePool {
        EvaluatePool::new(
            Box::new(Self {
                cwd,
                entrypoint,
                env,
                assets_for_source_mapping,
                assets_root: assets_root.clone(),
                project_dir: project_dir.clone(),
                concurrency_semaphore: Arc::new(Semaphore::new(if debug {
                    1
                } else {
                    concurrency
                })),
                bootup_semaphore: Arc::new(Semaphore::new(1)),
                idle_processes: Arc::new(HeapQueue::new()),
                shared_stdout: Arc::new(Mutex::new(FxIndexSet::default())),
                shared_stderr: Arc::new(Mutex::new(FxIndexSet::default())),
                debug,
                stats: Default::default(),
            }),
            assets_for_source_mapping,
            assets_root,
            project_dir,
        )
    }
}

#[turbo_tasks::value(shared)]
pub(crate) struct ChildProcessesBackend;

#[turbo_tasks::value_impl]
impl NodeBackend for ChildProcessesBackend {
    fn runtime_module_path(&self) -> RcStr {
        rcstr!("child_process/evaluate.ts")
    }

    fn globals_module_path(&self) -> RcStr {
        rcstr!("child_process/globals.ts")
    }

    fn create_pool(&self, options: CreatePoolOptions) -> CreatePoolFuture {
        Box::pin(async move {
            let CreatePoolOptions {
                cwd,
                entrypoint,
                env,
                assets_for_source_mapping,
                assets_root,
                project_dir,
                concurrency,
                debug,
            } = options;

            Ok(ChildProcessPool::create(
                cwd,
                entrypoint,
                env,
                assets_for_source_mapping,
                assets_root,
                project_dir,
                concurrency,
                debug,
            ))
        })
    }

    fn scale_down(&self) -> Result<()> {
        ChildProcessPool::scale_down();
        Ok(())
    }

    fn scale_zero(&self) -> Result<()> {
        ChildProcessPool::scale_zero();
        Ok(())
    }
}

#[async_trait::async_trait]
impl EvaluateOperation for ChildProcessPool {
    async fn operation(&self) -> Result<Box<dyn Operation>> {
        // Acquire a running process (handles concurrency limits, boots up the process)

        let operation = {
            let _guard = duration_span!("Node.js operation");
            let (process, permits) = self.acquire_process().await?;
            ChildProcessOperation {
                process: Some(process),
                permits,
                idle_processes: self.idle_processes.clone(),
                start: Instant::now(),
                stats: self.stats.clone(),
                allow_process_reuse: true,
            }
        };

        Ok(Box::new(operation))
    }

    /// Returns a snapshot of the pool's internal statistics.
    fn stats(&self) -> PoolStatsSnapshot {
        self.stats.lock().snapshot()
    }

    /// Eagerly spawn a Node.js process so it's ready when the first
    /// `operation()` is called. The process goes into the idle queue.
    /// If a node request comes in while this is still initializing, it waits
    /// on the bootup semaphore and will resume when the process is ready.
    fn pre_warm(&self) {
        let args = self.process_args();
        let bootup_semaphore = self.bootup_semaphore.clone();
        let idle_processes = self.idle_processes.clone();
        let stats = self.stats.clone();

        tokio::spawn(async move {
            let Ok(bootup_permit) = bootup_semaphore.clone().acquire_owned().await else {
                return;
            };
            {
                stats.lock().add_booting_worker();
            }
            match args.create_process().await {
                Ok((process, bootup_time)) => {
                    {
                        let mut s = stats.lock();
                        s.add_bootup_time(bootup_time);
                        s.finished_booting_worker();
                    }
                    drop(bootup_permit);
                    idle_processes.push(process, &ACTIVE_POOLS);
                }
                Err(_e) => {
                    let mut s = stats.lock();
                    s.finished_booting_worker();
                    s.remove_worker();
                }
            }
        });
    }
}

impl ChildProcessPool {
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
                Ok((process, AcquiredPermits::Idle { _concurrency_permit: concurrency_permit }))
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
                Ok((process, AcquiredPermits::Fresh { _concurrency_permit: concurrency_permit, _bootup_permit: bootup_permit }))
            }
        }
    }

    fn process_args(&self) -> ProcessArgs {
        ProcessArgs {
            cwd: self.cwd.clone(),
            env: self.env.clone(),
            entrypoint: self.entrypoint.clone(),
            assets_for_source_mapping: self.assets_for_source_mapping,
            assets_root: self.assets_root.clone(),
            project_dir: self.project_dir.clone(),
            shared_stdout: self.shared_stdout.clone(),
            shared_stderr: self.shared_stderr.clone(),
            debug: self.debug,
        }
    }

    async fn create_process(&self) -> Result<(NodeJsPoolProcess, Duration), anyhow::Error> {
        self.process_args()
            .create_process()
            .await
            .context("creating new process")
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

pub struct ChildProcessOperation {
    process: Option<NodeJsPoolProcess>,
    // This is used for drop
    #[allow(dead_code)]
    permits: AcquiredPermits,
    idle_processes: Arc<HeapQueue<NodeJsPoolProcess>>,
    start: Instant,
    stats: Arc<Mutex<NodeJsPoolStats>>,
    allow_process_reuse: bool,
}

#[async_trait::async_trait]
impl Operation for ChildProcessOperation {
    async fn recv(&mut self) -> Result<Bytes> {
        let bytes = self
            .with_process(|process| async move {
                process.recv().await.context("failed to receive message")
            })
            .await?;
        Ok(bytes)
    }

    async fn send(&mut self, message: Bytes) -> Result<()> {
        self.with_process(|process| async move {
            timeout(Duration::from_secs(30), process.send(message))
                .await
                .context("timeout while sending message")?
                .context("failed to send message")?;
            Ok(())
        })
        .await
    }

    async fn wait_or_kill(&mut self) -> Result<ExitStatus> {
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

    fn disallow_reuse(&mut self) {
        if self.allow_process_reuse {
            self.stats.lock().remove_worker();
            self.allow_process_reuse = false;
        }
    }
}

impl ChildProcessOperation {
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
}

impl Drop for ChildProcessOperation {
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
