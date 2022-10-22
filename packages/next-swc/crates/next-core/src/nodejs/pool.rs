use std::{
    collections::HashMap,
    io::{BufRead, BufReader, ErrorKind, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{Arc, Mutex},
};

use anyhow::{bail, Context, Result};
use rand::Rng;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use turbo_tasks::spawn_blocking;
use turbo_tasks_hash::encode_hex_string;

struct NodeJsPoolProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    marker: Arc<OperationMarker>,
}

impl Drop for NodeJsPoolProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// A marker used to detect the limits of a single operation without the output
/// of a Node.js process.
struct OperationMarker {
    marker: String,
}

impl OperationMarker {
    const STEP: &str = "OPERATION_STEP";
    const SUCCESS: &str = "OPERATION_END";
    const ERROR: &str = "OPERATION_ERROR";

    fn new() -> Self {
        Self {
            marker: encode_hex_string(&rand::thread_rng().gen::<[u8; 16]>()),
        }
    }

    fn read_event(&self, orig_buffer: &[u8]) -> Option<(usize, OperationEvent)> {
        let buffer = orig_buffer;
        let buffer = buffer.strip_suffix(&[b'\n'])?;
        let buffer = buffer.strip_suffix(self.marker.as_bytes())?;
        let buffer = buffer.strip_suffix(&[b' '])?;

        if let Some(buffer) = buffer
            .strip_suffix(Self::STEP.as_bytes())
            .and_then(|buffer| buffer.strip_suffix(&[b'\n']))
        {
            Some((orig_buffer.len() - buffer.len(), OperationEvent::Step))
        } else if let Some(buffer) = buffer
            .strip_suffix(Self::SUCCESS.as_bytes())
            .and_then(|buffer| buffer.strip_suffix(&[b'\n']))
        {
            Some((orig_buffer.len() - buffer.len(), OperationEvent::Success))
        } else if let Some(buffer) = buffer
            .strip_suffix(Self::ERROR.as_bytes())
            .and_then(|buffer| buffer.strip_suffix(&[b'\n']))
        {
            Some((orig_buffer.len() - buffer.len(), OperationEvent::Error))
        } else {
            None
        }
    }

    fn write<W>(&self, mut writer: W, kind: &str) -> std::io::Result<()>
    where
        W: Write,
    {
        writer.write_all(&[b'\n'])?;
        writer.write_all(kind.as_bytes())?;
        writer.write_all(&[b' '])?;
        writer.write_all(self.marker.as_bytes())?;
        writer.write_all(&[b'\n'])?;
        Ok(())
    }

    fn write_step<W>(&self, writer: W) -> std::io::Result<()>
    where
        W: Write,
    {
        self.write(writer, Self::STEP)
    }
}

impl Default for OperationMarker {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub(super) enum OperationEvent {
    Step,
    Success,
    Error,
}

impl NodeJsPoolProcess {
    fn prepare(
        cwd: &Path,
        env: &HashMap<String, String>,
        entrypoint: &Path,
        marker: &OperationMarker,
    ) -> Command {
        let mut cmd = Command::new("node");
        cmd.current_dir(cwd);
        cmd.arg(entrypoint);
        cmd.arg(&marker.marker);
        cmd.arg(&OperationMarker::STEP);
        cmd.arg(&OperationMarker::SUCCESS);
        cmd.arg(&OperationMarker::ERROR);
        cmd.env_clear();
        cmd.env(
            "PATH",
            std::env::var("PATH").expect("PATH should always be set"),
        );
        #[cfg(target_family = "windows")]
        cmd.env(
            "SystemRoot",
            std::env::var("SystemRoot").expect("SystemRoot should always be set"),
        );
        cmd.envs(env);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd
    }

    fn start(mut cmd: Command, marker: Arc<OperationMarker>) -> Result<Self> {
        let mut child = cmd.spawn().context("spawning node pool")?;
        let stdin = child.stdin.take().unwrap();
        let mut stdout = BufReader::new(child.stdout.take().unwrap());
        let mut bootstrap_log = Vec::new();
        loop {
            let mut buf = String::new();
            if stdout.read_line(&mut buf)? == 0 {
                bail!("process closed unexpectedly\n{}", bootstrap_log.join("\n"));
            }
            if buf == "READY\n" {
                break;
            }
            bootstrap_log.push(buf);
        }
        Ok(NodeJsPoolProcess {
            child,
            stdin,
            stdout,
            marker,
        })
    }

    fn read_until(&mut self, byte: u8, buf: &mut Vec<u8>) -> std::io::Result<usize> {
        self.stdout.read_until(byte, buf)
    }

    fn write_step(&mut self) -> std::io::Result<()> {
        self.marker.write_step(&mut self.stdin)
    }
}

impl Write for NodeJsPoolProcess {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.stdin.write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.stdin.flush()
    }
}

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
pub(super) struct NodeJsPool {
    cwd: PathBuf,
    entrypoint: PathBuf,
    env: HashMap<String, String>,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    processes: Arc<Mutex<Vec<NodeJsPoolProcess>>>,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    semaphore: Arc<Semaphore>,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    marker: Arc<OperationMarker>,
}

impl NodeJsPool {
    pub(super) fn new(
        cwd: PathBuf,
        entrypoint: PathBuf,
        env: HashMap<String, String>,
        concurrency: usize,
    ) -> Self {
        Self {
            cwd,
            entrypoint,
            env,
            processes: Arc::new(Mutex::new(Vec::new())),
            semaphore: Arc::new(Semaphore::new(concurrency)),
            marker: Arc::new(OperationMarker::default()),
        }
    }

    async fn acquire_child(&self) -> Result<(NodeJsPoolProcess, OwnedSemaphorePermit)> {
        let permit = self.semaphore.clone().acquire_owned().await?;
        let popped = {
            let mut processes = self.processes.lock().unwrap();
            processes.pop()
        };
        Ok(if let Some(child) = popped {
            (child, permit)
        } else {
            let marker = Arc::clone(&self.marker);
            let cmd = NodeJsPoolProcess::prepare(
                self.cwd.as_path(),
                &self.env,
                self.entrypoint.as_path(),
                &*marker,
            );
            let fresh = spawn_blocking(move || NodeJsPoolProcess::start(cmd, marker)).await?;
            (fresh, permit)
        })
    }

    pub(super) async fn operation(&self) -> Result<NodeJsOperation> {
        let (child, permit) = self.acquire_child().await?;

        Ok(NodeJsOperation {
            child: Some(child),
            permit,
            processes: self.processes.clone(),
        })
    }
}

pub(super) struct NodeJsOperation {
    child: Option<NodeJsPoolProcess>,
    // This is used for drop
    #[allow(dead_code)]
    permit: OwnedSemaphorePermit,
    processes: Arc<Mutex<Vec<NodeJsPoolProcess>>>,
}

impl NodeJsOperation {
    fn expect_child_mut(&mut self) -> &mut NodeJsPoolProcess {
        self.child
            .as_mut()
            .expect("child must be present while operation is live")
    }

    fn take_child(&mut self) -> NodeJsPoolProcess {
        self.child
            .take()
            .expect("child must be present while operation is live")
    }

    /// Writes the step event end marker to the child process.
    pub(super) fn write_step(&mut self) -> std::io::Result<()> {
        self.expect_child_mut().write_step()
    }

    /// Reads a completed event in the child process output. Blocks while
    /// waiting for more output.
    pub(super) fn read_event(
        &mut self,
        buf: &mut Vec<u8>,
    ) -> std::io::Result<(usize, OperationEvent)> {
        let child = self.expect_child_mut();
        let mut total_read = 0;
        loop {
            let read = child.read_until(b'\n', buf)?;
            total_read += read;

            match child.marker.read_event(&buf) {
                Some((read, event)) => {
                    buf.truncate(buf.len() - read);
                    break Ok((total_read - read, event));
                }
                None => {
                    if read == 0 {
                        // we need to stop reading in this case otherwise this loop infinitely
                        return Err(std::io::Error::new(
                            ErrorKind::UnexpectedEof,
                            "process closed unexpectedly while waiting for an operation result",
                        ));
                    }
                }
            }
        }
    }
}

impl Write for NodeJsOperation {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let child = self.expect_child_mut();
        child.write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        let child = self.expect_child_mut();
        child.flush()
    }
}

impl Drop for NodeJsOperation {
    fn drop(&mut self) {
        let child = self.take_child();
        self.processes.lock().unwrap().push(child);
    }
}
