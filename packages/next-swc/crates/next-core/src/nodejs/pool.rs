use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::{ExitStatus, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};

use anyhow::{bail, Context, Result};
use serde::{de::DeserializeOwned, Serialize};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    process::{Child, Command},
    select,
    sync::{OwnedSemaphorePermit, Semaphore},
    time::sleep,
};

enum NodeJsPoolProcess {
    Spawned(SpawnedNodeJsPoolProcess),
    Running(RunningNodeJsPoolProcess),
}

struct SpawnedNodeJsPoolProcess {
    child: Option<Child>,
    listener: TcpListener,
}

struct RunningNodeJsPoolProcess {
    child: Option<Child>,
    connection: TcpStream,
}

impl Drop for SpawnedNodeJsPoolProcess {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            tokio::spawn(async move {
                let _ = child.kill().await;
            });
        }
    }
}

impl Drop for RunningNodeJsPoolProcess {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            tokio::spawn(async move {
                let _ = child.kill().await;
            });
        }
    }
}

const CONNECT_TIMEOUT: Duration = Duration::from_secs(1);

impl NodeJsPoolProcess {
    async fn new(cwd: &Path, env: &HashMap<String, String>, entrypoint: &Path) -> Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .context("binding to a port")?;
        let port = listener.local_addr().context("getting port")?.port();
        let mut cmd = Command::new("node");
        cmd.current_dir(cwd);
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
        cmd.stderr(Stdio::inherit());
        cmd.stdout(Stdio::inherit());

        let child = cmd.spawn().context("spawning node pooled process")?;

        Ok(Self::Spawned(SpawnedNodeJsPoolProcess {
            listener,
            child: Some(child),
        }))
    }

    async fn run(self) -> Result<RunningNodeJsPoolProcess> {
        Ok(match self {
            NodeJsPoolProcess::Spawned(mut spawned) => {
                let (connection, _) = select! {
                    connection = spawned.listener.accept() => connection.context("accepting connection")?,
                    _ = sleep(CONNECT_TIMEOUT) => bail!("timed out waiting for the Node.js process to connect"),
                };

                RunningNodeJsPoolProcess {
                    child: spawned.child.take(),
                    connection,
                }
            }
            NodeJsPoolProcess::Running(running) => running,
        })
    }
}

impl RunningNodeJsPoolProcess {
    async fn recv(&mut self) -> Result<Vec<u8>> {
        let packet_len = self
            .connection
            .read_u32()
            .await
            .context("reading packet length")?
            .try_into()
            .context("storing packet length")?;
        let mut packet_data = vec![0; packet_len];
        self.connection
            .read_exact(&mut packet_data)
            .await
            .context("reading packet data")?;
        Ok(packet_data)
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
        Ok(())
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
        }
    }

    async fn acquire_process(&self) -> Result<(NodeJsPoolProcess, OwnedSemaphorePermit)> {
        let permit = self.semaphore.clone().acquire_owned().await?;
        let popped = {
            let mut processes = self.processes.lock().unwrap();
            processes.pop()
        };
        Ok(if let Some(process) = popped {
            (process, permit)
        } else {
            let process =
                NodeJsPoolProcess::new(self.cwd.as_path(), &self.env, self.entrypoint.as_path())
                    .await
                    .context("creating new process")?;
            (process, permit)
        })
    }

    pub(super) async fn operation(&self) -> Result<NodeJsOperation> {
        let (process, permit) = self.acquire_process().await?;

        Ok(NodeJsOperation {
            process: Some(process.run().await?),
            permit,
            processes: self.processes.clone(),
        })
    }
}

pub struct NodeJsOperation {
    process: Option<RunningNodeJsPoolProcess>,
    // This is used for drop
    #[allow(dead_code)]
    permit: OwnedSemaphorePermit,
    processes: Arc<Mutex<Vec<NodeJsPoolProcess>>>,
}

impl NodeJsOperation {
    fn process_mut(&mut self) -> Result<&mut RunningNodeJsPoolProcess> {
        Ok(self
            .process
            .as_mut()
            .context("Node.js operation already finished")?)
    }

    pub(super) async fn recv<M>(&mut self) -> Result<M>
    where
        M: DeserializeOwned,
    {
        let message = self
            .process_mut()?
            .recv()
            .await
            .context("receiving message")?;
        Ok(serde_json::from_slice(&message).context("deserializing message")?)
    }

    pub(super) async fn send<M>(&mut self, message: M) -> Result<()>
    where
        M: Serialize,
    {
        Ok(self
            .process_mut()?
            .send(serde_json::to_vec(&message).context("serializing message")?)
            .await
            .context("sending message")?)
    }

    pub(super) async fn wait_or_kill(mut self) -> Result<ExitStatus> {
        let mut process = self
            .process
            .take()
            .context("Node.js operation already finished")?;

        let mut child = process
            .child
            .take()
            .context("Node.js operation already finished")?;

        // Ignore error since we are not sure if the process is still alive
        let _ = child.start_kill();
        let status = child.wait().await.context("waiting for process end")?;

        Ok(status)
    }
}

impl Drop for NodeJsOperation {
    fn drop(&mut self) {
        if let Some(process) = self.process.take() {
            self.processes
                .lock()
                .unwrap()
                .push(NodeJsPoolProcess::Running(process));
        }
    }
}
