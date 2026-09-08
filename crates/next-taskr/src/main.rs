#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

mod artifacts;
mod materialize;

use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc, OnceLock,
        atomic::{AtomicU64, Ordering},
    },
};

use anyhow::{Context, Result, bail};
use base64::{Engine, engine::general_purpose::STANDARD};
use clap::Parser;
use futures::future::try_join_all;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{Mutex, mpsc},
};
use turbo_rcstr::RcStr;
use turbo_tasks::{TransientValue, TurboTasks, Vc};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, GitVersionInfo, StorageMode, TurboTasksBackend,
    noop_backing_storage, turbo_backing_storage,
};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, DiskFileSystem, FileContent, FileSystem, FileSystemEntryType,
    FileSystemPath, RealPathErrorType,
};

use crate::{
    artifacts::Artifacts,
    materialize::{Output, write_files},
};

static BRIDGE: OnceLock<Arc<Bridge>> = OnceLock::new();
static INVOCATION: AtomicU64 = AtomicU64::new(1);
static TRANSFORMS: AtomicU64 = AtomicU64::new(0);

#[derive(Parser)]
#[command(about = "Run Next.js build recipes with turbo-tasks")]
struct Arguments {
    #[arg(default_value = "default")]
    task: String,
    #[arg(long, default_value = ".")]
    cwd: PathBuf,
    #[arg(long)]
    no_cache: bool,
    #[arg(long)]
    list: bool,
    #[arg(long)]
    stats: bool,
    /// Override the recipe worker (also useful for testing build recipes).
    #[arg(long)]
    worker: Option<PathBuf>,
}

struct Bridge {
    stdin: Mutex<ChildStdin>,
    child: Mutex<Child>,
    pending: Mutex<HashMap<u64, mpsc::UnboundedSender<Value>>>,
    next_id: AtomicU64,
    watches: Mutex<Vec<Value>>,
    materializing: Mutex<()>,
    failure: OnceLock<String>,
}

impl Bridge {
    async fn new(cwd: &Path, worker: &Path) -> Result<Arc<Self>> {
        let mut child =
            Command::new(std::env::var_os("NEXT_TASKR_NODE").unwrap_or_else(|| "node".into()))
                .arg(worker)
                .current_dir(cwd)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit())
                .kill_on_drop(true)
                .spawn()
                .context("Starting the build worker")?;
        let stdout = child.stdout.take().unwrap();
        let bridge = Arc::new(Self {
            stdin: Mutex::new(child.stdin.take().unwrap()),
            child: Mutex::new(child),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            watches: Mutex::new(Vec::new()),
            materializing: Mutex::new(()),
            failure: OnceLock::new(),
        });
        let weak = Arc::downgrade(&bridge);
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Some(bridge) = weak.upgrade() else { break };
                if let Some(message) = line.strip_prefix("__NEXT_TASKR__") {
                    match serde_json::from_str::<Value>(message) {
                        Ok(message) => {
                            if let Some(id) = message["request"].as_u64()
                                && let Some(sender) = bridge.pending.lock().await.get(&id)
                            {
                                let _ = sender.send(message);
                            }
                        }
                        Err(error) => {
                            let _ = bridge
                                .failure
                                .set(format!("Invalid worker response: {error}"));
                            break;
                        }
                    }
                } else if !line.is_empty() {
                    eprintln!("{line}");
                }
            }
            if let Some(bridge) = weak.upgrade() {
                bridge
                    .failure
                    .get_or_init(|| "Build worker exited".to_owned());
                // Dropping every sender wakes requests if the process exits or crashes.
                bridge.pending.lock().await.clear();
            }
        });
        Ok(bridge)
    }

    async fn send(&self, message: Value) -> Result<()> {
        let mut input = self.stdin.lock().await;
        input
            .write_all(serde_json::to_string(&message)?.as_bytes())
            .await?;
        input.write_all(b"\n").await?;
        input.flush().await?;
        Ok(())
    }

    async fn request(&self, kind: &str, args: Value, ancestry: Vec<String>) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (send, mut receive) = mpsc::unbounded_channel();
        {
            let mut pending = self.pending.lock().await;
            if let Some(error) = self.failure.get() {
                bail!("{error} while executing {kind}");
            }
            pending.insert(id, send);
        }
        self.send(json!({"id": id, "kind": kind, "args": args}))
            .await?;
        let result = async {
            let mut artifacts = Artifacts::default();
            while let Some(message) = receive.recv().await {
                if let Some(call) = message["call"].as_u64() {
                    let result = self
                        .dispatch(&message["args"], &ancestry, &mut artifacts)
                        .await;
                    let reply = match result {
                        Ok(value) => json!({"reply": call, "value": value}),
                        Err(error) => json!({"reply": call, "error": format!("{error:#}")}),
                    };
                    self.send(reply).await?;
                } else if let Some(error) = message["error"].as_str() {
                    bail!("{error}");
                } else {
                    return Ok(message["value"].clone());
                }
            }
            bail!(
                "{} while executing {kind}",
                self.failure
                    .get()
                    .map_or("Build worker exited", String::as_str)
            )
        }
        .await;
        self.pending.lock().await.remove(&id);
        result
    }

    async fn dispatch(
        &self,
        args: &Value,
        ancestry: &[String],
        artifacts: &mut Artifacts,
    ) -> Result<Value> {
        match args["kind"].as_str().context("Missing action kind")? {
            "tasks" => {
                let names: Vec<String> = serde_json::from_value(args["names"].clone())?;
                let options: RcStr = serde_json::to_string(&args["options"])?.into();
                for name in &names {
                    if ancestry.contains(name) {
                        bail!("Task dependency cycle: {} -> {name}", ancestry.join(" -> "));
                    }
                }
                let stack: RcStr = serde_json::to_string(ancestry)?.into();
                if args["parallel"].as_bool().unwrap_or(false) {
                    try_join_all(names.into_iter().map(|name| {
                        run_task(
                            name.into(),
                            options.clone(),
                            stack.clone(),
                            next_invocation(),
                        )
                        .owned()
                    }))
                    .await?;
                } else {
                    for name in names {
                        run_task(
                            name.into(),
                            options.clone(),
                            stack.clone(),
                            next_invocation(),
                        )
                        .await?;
                    }
                }
                Ok(Value::Null)
            }
            "read" => {
                let paths: Vec<String> = serde_json::from_value(args["paths"].clone())?;
                // Recipes consume a consistent input snapshot. Their imperative
                // effects must only run when explicitly scheduled by the watch
                // loop, never as a reaction to an old input dependency changing.
                let values = try_join_all(paths.into_iter().map(|path| {
                    read_file(path.into())
                        .read_strongly_consistent()
                        .untracked()
                }))
                .await?;
                if args["artifacts"].as_bool().unwrap_or(false) {
                    let handles = values
                        .iter()
                        .map(|value| artifacts.insert(value))
                        .collect::<Result<Vec<_>>>()?;
                    Ok(json!(handles))
                } else {
                    Ok(json!(values.iter().map(|v| v.as_str()).collect::<Vec<_>>()))
                }
            }
            "load" => {
                let handles: Vec<u64> = serde_json::from_value(args["artifacts"].clone())?;
                let contents = handles
                    .into_iter()
                    .map(|handle| Ok(STANDARD.encode(artifacts.get(handle)?)))
                    .collect::<Result<Vec<_>>>()?;
                Ok(json!(contents))
            }
            "transform" => {
                let result = transform(serde_json::to_string(&args["input"])?.into())
                    .owned()
                    .await?;
                Ok(serde_json::from_str(&result)?)
            }
            "transforms" => {
                let mut inputs = args["inputs"]
                    .as_array()
                    .context("Missing transform inputs")?
                    .clone();
                let handles = args["artifacts"].as_bool().unwrap_or(false);
                if handles {
                    for input in &mut inputs {
                        for file in input["files"]
                            .as_array_mut()
                            .context("Missing transform files")?
                        {
                            artifacts.hydrate(file)?;
                        }
                    }
                }
                let mut results = try_join_all(inputs.iter().map(|input| async move {
                    let result = transform(serde_json::to_string(input)?.into())
                        .owned()
                        .await?;
                    anyhow::Ok(serde_json::from_str::<Value>(&result)?)
                }))
                .await?;
                if handles {
                    for result in &mut results {
                        for group in ["files", "errors"] {
                            for file in result[group]
                                .as_array_mut()
                                .context("Missing transform artifacts")?
                            {
                                artifacts.retain(file)?;
                            }
                        }
                    }
                }
                Ok(json!(results))
            }
            "write" => {
                // Materialization is deliberately outside the cached transform. Every
                // invocation restores outputs, including after release clears dist.
                let _guard = self.materializing.lock().await;
                let files = args["files"]
                    .as_array()
                    .context("Missing output files")?
                    .iter()
                    .map(|file| {
                        Ok(Output {
                            path: PathBuf::from(
                                file["path"].as_str().context("Missing output path")?,
                            ),
                            bytes: artifacts.bytes(file)?,
                            mode: file["mode"].as_str().map(str::to_owned),
                        })
                    })
                    .collect::<Result<Vec<_>>>()?;
                let sequence = self
                    .next_id
                    .fetch_add(files.len() as u64, Ordering::Relaxed);
                write_files(files, sequence).await?;
                Ok(Value::Null)
            }
            "clear" => {
                let path = Path::new(args["path"].as_str().context("Missing clear path")?);
                match tokio::fs::remove_dir_all(path).await {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => return Err(error.into()),
                }
                Ok(Value::Null)
            }
            "watch" => {
                self.watches.lock().await.push(args.clone());
                Ok(Value::Null)
            }
            kind => bail!("Unknown action: {kind}"),
        }
    }
}

fn next_invocation() -> TransientValue<u64> {
    TransientValue::new(INVOCATION.fetch_add(1, Ordering::Relaxed))
}

// The transient input prevents action graphs from being persisted. A merely
// session-dependent recipe would replay its old children eagerly on a warm
// build, bypassing imperative serial barriers such as clearing dist first.
#[turbo_tasks::function]
async fn run_task(
    name: RcStr,
    options: RcStr,
    ancestry: RcStr,
    invocation: TransientValue<u64>,
) -> Result<Vc<()>> {
    let _ = invocation;
    let mut ancestry: Vec<String> = serde_json::from_str(&ancestry)?;
    ancestry.push(name.to_string());
    eprintln!("Starting {name}");
    BRIDGE
        .get()
        .context("Worker is not initialized")?
        .request(
            "task",
            json!({"name": name.as_str(), "options": serde_json::from_str::<Value>(&options)?}),
            ancestry,
        )
        .await
        .with_context(|| format!("Task {name}"))?;
    eprintln!("Finished {name}");
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
async fn transform(input: RcStr) -> Result<Vc<RcStr>> {
    let input: Value = serde_json::from_str(&input)?;
    TRANSFORMS.fetch_add(
        input["files"].as_array().map_or(1, Vec::len) as u64,
        Ordering::Relaxed,
    );
    let result = BRIDGE
        .get()
        .context("Worker is not initialized")?
        .request("transform", input, Vec::new())
        .await?;
    Ok(Vc::cell(serde_json::to_string(&result)?.into()))
}

#[turbo_tasks::function]
fn input_filesystem(root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new(root.clone(), Vc::cell(root))
}

#[turbo_tasks::function(operation, root)]
async fn read_file(path: RcStr) -> Result<Vc<RcStr>> {
    let path = Path::new(path.as_str());
    let root = path.ancestors().last().context("File path has no root")?;
    let root: RcStr = root.to_str().context("Non-UTF8 filesystem root")?.into();
    let fs = input_filesystem(root).to_resolved().await?;
    let fs_path = fs
        .await?
        .try_from_sys_path(fs, path, None)
        .context("File outside filesystem")?;
    let fs_path = match fs_path.realpath().await? {
        Ok(path) => path,
        Err(error) if matches!(error.kind(), RealPathErrorType::NotFound) => {
            bail!("Input does not exist: {}", path.display())
        }
        Err(error) => bail!(error),
    };
    let content = fs_path.read().await?;
    let data = match &*content {
        FileContent::Content(file) => {
            let mut bytes = Vec::new();
            file.read().read_to_end(&mut bytes)?;
            STANDARD.encode(bytes)
        }
        FileContent::NotFound => bail!("Input does not exist: {}", path.display()),
    };
    Ok(Vc::cell(data.into()))
}

#[turbo_tasks::function(operation, root)]
async fn build(task: RcStr, invocation: TransientValue<u64>) -> Result<Vc<()>> {
    run_task(task, "{}".into(), "[]".into(), invocation).await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
fn watched_filesystem(root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new(format!("next-taskr-watch:{root}").into(), Vc::cell(root))
}

#[turbo_tasks::function]
async fn directory_snapshot(
    directory: FileSystemPath,
    root: RcStr,
    mut ancestors: Vec<RcStr>,
) -> Result<Vc<RcStr>> {
    let mut hash = Sha256::new();
    let absolute: RcStr = watched_filesystem(root.clone())
        .await?
        .to_sys_path(&directory)
        .to_str()
        .context("Non-UTF8 watched directory")?
        .into();
    if ancestors.contains(&absolute) {
        return Ok(Vc::cell("symlink cycle".into()));
    }
    ancestors.push(absolute);
    if let DirectoryContent::Entries(entries) = &*directory.read_dir().await? {
        let mut entries = entries.iter().collect::<Vec<_>>();
        entries.sort_by_key(|(name, _)| *name);
        for (name, entry) in entries {
            if name == ".git" || name.contains(".test.") || name.contains(".stories.") {
                continue;
            }
            hash.update(name.len().to_le_bytes());
            hash.update(name.as_bytes());
            match entry {
                DirectoryEntry::Directory(path) => hash.update(
                    directory_snapshot(path.clone(), root.clone(), ancestors.clone())
                        .await?
                        .as_bytes(),
                ),
                DirectoryEntry::Symlink(path) => {
                    hash.update(
                        link_snapshot(path.clone(), root.clone(), ancestors.clone())
                            .await?
                            .as_bytes(),
                    );
                }
                DirectoryEntry::File(path) => {
                    if let FileContent::Content(file) = &*path.read().await? {
                        let mut bytes = Vec::new();
                        file.read().read_to_end(&mut bytes)?;
                        hash.update(Sha256::digest(bytes));
                    }
                }
                DirectoryEntry::Error(error) => bail!("Reading watched input: {error}"),
                DirectoryEntry::Other(_) => {}
            }
        }
    }
    Ok(Vc::cell(format!("{:x}", hash.finalize()).into()))
}

#[turbo_tasks::function(session_dependent)]
async fn link_snapshot(
    path: FileSystemPath,
    root: RcStr,
    ancestors: Vec<RcStr>,
) -> Result<Vc<RcStr>> {
    // Track the link itself, including links that leave this filesystem root.
    let link = path.read_link().await?;
    let absolute = watched_filesystem(root).await?.to_sys_path(&path);
    let target = match tokio::fs::canonicalize(&absolute).await {
        Ok(target) => target,
        Err(_) => {
            // Watch the parent of a dangling target so creating it repairs the
            // link without requiring a change to the link itself.
            let Ok(raw) = tokio::fs::read_link(&absolute).await else {
                return Ok(Vc::cell(format!("{link:?}").into()));
            };
            let target = absolute.parent().context("Link has no parent")?.join(raw);
            let Some(parent) = target.parent() else {
                return Ok(Vc::cell(format!("{link:?}").into()));
            };
            let Ok(parent) = tokio::fs::canonicalize(parent).await else {
                return Ok(Vc::cell(format!("{link:?}").into()));
            };
            parent.join(target.file_name().context("Link target has no filename")?)
        }
    };
    let root: RcStr = target
        .parent()
        .context("Symlink target has no parent")?
        .to_str()
        .context("Non-UTF8 symlink target")?
        .into();
    let fs = watched_filesystem(root.clone()).to_resolved().await?;
    fs.await?.start_watching().await?;
    let target = fs
        .await?
        .try_from_sys_path(fs, &target, None)
        .context("Symlink target outside filesystem")?;
    let value = match *target.get_type().await? {
        FileSystemEntryType::Directory => {
            (*directory_snapshot(target, root, ancestors).await?).clone()
        }
        FileSystemEntryType::File => {
            if let FileContent::Content(file) = &*target.read().await? {
                let mut bytes = Vec::new();
                file.read().read_to_end(&mut bytes)?;
                format!("{:x}", Sha256::digest(bytes)).into()
            } else {
                "missing".into()
            }
        }
        _ => "missing".into(),
    };
    Ok(Vc::cell(value))
}

#[turbo_tasks::function(operation, root)]
async fn watch_snapshot(root: RcStr) -> Result<Vc<RcStr>> {
    let fs = watched_filesystem(root.clone()).to_resolved().await?;
    directory_snapshot(fs.root().owned().await?, root, Vec::new())
        .await
        .map(|value| Vc::cell((*value).clone()))
}

#[turbo_tasks::function(operation, root, session_dependent)]
async fn start_watch(root: RcStr) -> Result<Vc<()>> {
    watched_filesystem(root).await?.start_watching().await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn rebuild_watch(watch: RcStr, invocation: TransientValue<u64>) -> Result<Vc<()>> {
    let args: Value = serde_json::from_str(&watch)?;
    // Source reads can include pnpm symlinks outside the package. Refresh the
    // read filesystem before rerunning the recipes; unchanged transform inputs
    // still reuse their cached results.
    let path = Path::new(args["path"].as_str().context("Missing watch path")?);
    let root: RcStr = path.ancestors().last().unwrap().to_str().unwrap().into();
    input_filesystem(root).await?.invalidate();
    for name in args["names"].as_array().context("Missing watched tasks")? {
        run_task(
            name.as_str().context("Invalid task name")?.into(),
            serde_json::to_string(&args["options"])?.into(),
            "[]".into(),
            invocation.clone(),
        )
        .await?;
    }
    Ok(Vc::cell(()))
}

async fn watch(tt: &Arc<TurboTasks<TurboTasksBackend>>, bridge: &Bridge) -> Result<()> {
    let registrations = bridge.watches.lock().await.clone();
    let mut snapshots = Vec::new();
    for registration in registrations {
        let root: RcStr = registration["path"]
            .as_str()
            .context("Missing watch path")?
            .into();
        let hash = tt
            .run_once(async move {
                start_watch(root.clone()).read_strongly_consistent().await?;
                Ok((*watch_snapshot(root).read_strongly_consistent().await?).clone())
            })
            .await?;
        snapshots.push((registration, hash));
    }
    // Recipes register their watches after the initial build. Reconcile once
    // with all watchers active so edits made during that build cannot be lost.
    for (registration, _) in &snapshots {
        rebuild_registration(tt, registration).await;
    }
    eprintln!("Watching {} source groups", snapshots.len());
    let mut interval = tokio::time::interval(std::time::Duration::from_millis(50));
    loop {
        interval.tick().await;
        for (registration, previous) in &mut snapshots {
            let root: RcStr = registration["path"].as_str().unwrap().into();
            let current = tt
                .run_once(async move {
                    Ok((*watch_snapshot(root).read_strongly_consistent().await?).clone())
                })
                .await?;
            if &current == previous {
                continue;
            }
            *previous = current;
            rebuild_registration(tt, registration).await;
        }
    }
}

async fn rebuild_registration(tt: &Arc<TurboTasks<TurboTasksBackend>>, registration: &Value) {
    let registration: RcStr = registration.to_string().into();
    let result = tt
        .run_once(async move {
            rebuild_watch(registration, next_invocation())
                .read_strongly_consistent()
                .await?;
            anyhow::Ok(())
        })
        .await;
    if let Err(error) = result {
        eprintln!("{error:#}");
    }
}

async fn interrupted() -> Result<()> {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
        tokio::select! {
            result = tokio::signal::ctrl_c() => result?,
            _ = terminate.recv() => {},
        }
    }
    #[cfg(not(unix))]
    tokio::signal::ctrl_c().await?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Arguments::parse();
    let cwd = std::fs::canonicalize(&args.cwd)?;
    let worker = args
        .worker
        .unwrap_or_else(|| cwd.join("build-tools/worker.js"));
    let bridge = Bridge::new(&cwd, &worker).await?;
    BRIDGE
        .set(bridge.clone())
        .map_err(|_| anyhow::anyhow!("Worker already initialized"))?;
    if args.list {
        println!("{}", bridge.request("list", Value::Null, Vec::new()).await?);
        bridge.child.lock().await.kill().await?;
        return Ok(());
    }
    let backend = if args.no_cache {
        TurboTasksBackend::new(
            BackendOptions {
                storage_mode: None,
                ..Default::default()
            },
            noop_backing_storage(),
        )
    } else {
        let version = format!(
            "{:x}",
            Sha256::digest(std::fs::read(std::env::current_exe()?)?)
        );
        let cache = cwd.join(".cache/next-taskr");
        let (storage, _) = turbo_backing_storage(
            &cache,
            &GitVersionInfo {
                describe: &version,
                dirty: false,
            },
            BackingStorageOptions {
                is_ci: false,
                is_short_session: true,
                skip_compaction: false,
            },
        )?;
        TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(StorageMode::ReadWriteOnShutdown),
                ..Default::default()
            },
            storage,
        )
    };
    let tt = TurboTasks::new(backend);
    let task: RcStr = args.task.into();
    let result = tokio::select! {
        result = async {
            tt.run_once(async move {
                build(task, next_invocation()).read_strongly_consistent().await?;
                anyhow::Ok(())
            }).await?;
            if !bridge.watches.lock().await.is_empty() { watch(&tt, &bridge).await?; }
            anyhow::Ok(())
        } => result,
        result = interrupted() => result,
    };
    let _ = bridge.request("shutdown", Value::Null, Vec::new()).await;
    tt.stop_and_wait().await;
    if args.stats {
        eprintln!(
            "Transforms executed: {}",
            TRANSFORMS.load(Ordering::Relaxed)
        );
    }
    let _ = bridge.child.lock().await.kill().await;
    result
}
