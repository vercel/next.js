use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    mem::transmute,
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{Arc, Mutex},
};

use anyhow::{bail, Result};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use turbo_tasks::spawn_blocking;

const END_OF_OPERATION: &str =
    "END_OF_OPERATION 4329g8b57hnz349bo58tzuasgnhv9o8e4zo6gvj END_OF_OPERATION\n";

struct NodeJsPoolProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl Drop for NodeJsPoolProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl NodeJsPoolProcess {
    fn prepare(cwd: &Path, env: &HashMap<String, String>, entrypoint: &Path) -> Command {
        let mut cmd = Command::new("node");
        cmd.current_dir(cwd);
        cmd.arg(entrypoint);
        cmd.arg(&END_OF_OPERATION[..END_OF_OPERATION.len() - 1]);
        cmd.env_clear();
        cmd.envs(env);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd
    }

    fn start(mut cmd: Command) -> Result<Self> {
        let mut child = cmd.spawn()?;
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
        })
    }

    fn read_line(&mut self, buf: &mut String) -> std::io::Result<usize> {
        self.stdout.read_line(buf)
    }

    pub fn write(&mut self, buf: &[u8]) -> std::io::Result<()> {
        self.stdin.write_all(buf)
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
pub struct NodeJsPool {
    cwd: PathBuf,
    entrypoint: PathBuf,
    env: HashMap<String, String>,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    processes: Arc<Mutex<Vec<NodeJsPoolProcess>>>,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    semaphore: Arc<Semaphore>,
}

impl NodeJsPool {
    pub fn new(
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
            let cmd = NodeJsPoolProcess::prepare(
                self.cwd.as_path(),
                &self.env,
                self.entrypoint.as_path(),
            );
            let fresh = spawn_blocking(move || NodeJsPoolProcess::start(cmd)).await?;
            (fresh, permit)
        })
    }

    pub async fn run(&self, input: &[u8]) -> Result<NodeJsOperationResult> {
        let (mut child, permit) = self.acquire_child().await?;
        // SAFETY we await spawn blocking so we stay within the lifetime of input
        let static_input: &'static [u8] = unsafe { transmute(input) };
        let child = spawn_blocking(move || {
            child.write(static_input)?;
            Ok::<_, anyhow::Error>(child)
        })
        .await?;

        Ok(NodeJsOperationResult {
            child: Some(child),
            child_ended: false,
            permit,
            processes: self.processes.clone(),
        })
    }
}

pub struct NodeJsOperationResult {
    child_ended: bool,
    child: Option<NodeJsPoolProcess>,
    // This is used for drop
    #[allow(dead_code)]
    permit: OwnedSemaphorePermit,
    processes: Arc<Mutex<Vec<NodeJsPoolProcess>>>,
}

impl NodeJsOperationResult {
    pub fn stdin(&mut self) -> Option<&mut ChildStdin> {
        self.child.as_mut().map(|c| &mut c.stdin)
    }

    pub fn read_line(&mut self, buf: &mut String) -> Result<usize, std::io::Error> {
        if let Some(ref mut child) = self.child {
            if self.child_ended {
                return Ok(0);
            }
            let len = child.read_line(buf)?;
            if len == 0 {
                self.child = None;
                return Ok(0);
            }
            if buf.ends_with(END_OF_OPERATION) {
                buf.truncate(buf.len() - END_OF_OPERATION.len());
                self.child_ended = true;
                Ok(0)
            } else {
                Ok(len)
            }
        } else {
            Ok(0)
        }
    }

    pub fn read_lines(&mut self) -> Result<Vec<String>, std::io::Error> {
        let mut lines = Vec::new();
        loop {
            let mut line = String::new();
            if self.read_line(&mut line)? == 0 {
                return Ok(lines);
            }
            line.pop();
            lines.push(line);
        }
    }
}

impl Drop for NodeJsOperationResult {
    fn drop(&mut self) {
        if let Some(child) = self.child.take() {
            self.processes.lock().unwrap().push(child)
        }
    }
}
