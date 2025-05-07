use std::{
    fs::OpenOptions,
    io::Write,
    iter,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use clap::{Args, Parser, Subcommand};
use rand::{Rng, RngCore, SeedableRng};
use rustc_hash::FxHashSet;
use tokio::time::sleep;
use turbo_rcstr::RcStr;
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, ResolvedVc, TransientInstance, Vc};
use turbo_tasks_backend::{noop_backing_storage, BackendOptions, TurboTasksBackend};
use turbo_tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath};

/// A collection of fuzzers for `turbo-tasks`. These are not test cases as they're slow and (in many
/// cases) non-deterministic.
///
/// It's recommend you build this with `--release`.
///
/// This is its own crate to avoid littering other crates with binary-only dependencies
/// <https://github.com/rust-lang/cargo/issues/1982>.
#[derive(Parser)]
#[command()]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Continuously fuzzes the filesystem watcher until ctrl+c'd.
    FsWatcher(FsWatcher),
}

#[derive(Args)]
struct FsWatcher {
    #[arg(long)]
    fs_root: PathBuf,
    #[arg(long, default_value_t = 4)]
    depth: usize,
    #[arg(long, default_value_t = 6)]
    width: usize,
    #[arg(long, default_value_t = 100)]
    notify_timeout_ms: u64,
    #[arg(long, default_value_t = 200)]
    file_modifications: u32,
    #[arg(long, default_value_t = 2)]
    directory_modifications: u32,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    register();
    let cli = Cli::parse();

    match cli.command {
        Commands::FsWatcher(args) => fuzz_fs_watcher(args).await,
    }
}

#[derive(Default, NonLocalValue, TraceRawVcs)]
struct PathInvalidations(#[turbo_tasks(trace_ignore)] Arc<Mutex<FxHashSet<RcStr>>>);

async fn fuzz_fs_watcher(args: FsWatcher) -> anyhow::Result<()> {
    std::fs::create_dir(&args.fs_root)?;
    let fs_root = args.fs_root.canonicalize()?;
    let _guard = FsCleanup {
        path: &fs_root.clone(),
    };

    let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
        BackendOptions::default(),
        noop_backing_storage(),
    ));
    tt.run_once(async move {
        let invalidations = TransientInstance::new(PathInvalidations::default());
        let fs_root_rcstr = RcStr::from(fs_root.to_str().unwrap());
        let project_fs = disk_file_system_operation(fs_root_rcstr.clone())
            .resolve_strongly_consistent()
            .await?;
        let project_root = disk_file_system_root_operation(project_fs)
            .resolve_strongly_consistent()
            .await?;
        create_directory_tree(&mut FxHashSet::default(), &fs_root, args.depth, args.width)?;

        project_fs.await?.start_watching(None).await?;

        let read_all_paths_op =
            read_all_paths_operation(invalidations.clone(), project_root, args.depth, args.width);
        read_all_paths_op.read_strongly_consistent().await?;
        {
            let mut invalidations = invalidations.0.lock().unwrap();
            println!("read all {} files", invalidations.len());
            invalidations.clear();
        }

        let mut rand_buf = [0; 16];
        let mut rng = rand::rngs::SmallRng::from_rng(&mut rand::rng());
        loop {
            let mut modified_file_paths = FxHashSet::default();
            for _ in 0..args.file_modifications {
                let path = fs_root.join(pick_random_file(args.depth, args.width));
                let mut f = OpenOptions::new().write(true).truncate(true).open(&path)?;
                rng.fill_bytes(&mut rand_buf);
                f.write_all(&rand_buf)?;
                f.flush()?;
                modified_file_paths.insert(path);
            }
            for _ in 0..args.directory_modifications {
                let dir = pick_random_directory(args.depth, args.width);
                let path = fs_root.join(dir.path);
                std::fs::remove_dir_all(&path)?;
                std::fs::create_dir(&path)?;
                create_directory_tree(
                    &mut modified_file_paths,
                    &path,
                    args.depth - dir.depth,
                    args.width,
                )?;
            }
            // there's no way to know when we've received all the pending events from the operating
            // system, so just sleep and pray
            sleep(Duration::from_millis(args.notify_timeout_ms)).await;
            read_all_paths_op.read_strongly_consistent().await?;
            {
                let mut invalidations = invalidations.0.lock().unwrap();
                println!(
                    "modified {} files and found {} invalidations",
                    modified_file_paths.len(),
                    invalidations.len()
                );
                invalidations.clear();
            }
        }
    })
    .await
}

#[turbo_tasks::function(operation)]
fn disk_file_system_operation(fs_root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new("project".into(), fs_root, Vec::new())
}

#[turbo_tasks::function(operation)]
fn disk_file_system_root_operation(fs: ResolvedVc<DiskFileSystem>) -> Vc<FileSystemPath> {
    fs.root()
}

#[turbo_tasks::function]
async fn read_path(
    invalidations: TransientInstance<PathInvalidations>,
    path: ResolvedVc<FileSystemPath>,
) -> anyhow::Result<()> {
    let path_str = path.await?.path.clone();
    invalidations.0.lock().unwrap().insert(path_str);
    let _ = path.read().await?;
    Ok(())
}

#[turbo_tasks::function(operation)]
async fn read_all_paths_operation(
    invalidations: TransientInstance<PathInvalidations>,
    root: ResolvedVc<FileSystemPath>,
    depth: usize,
    width: usize,
) -> anyhow::Result<()> {
    async fn read_all_paths_inner(
        invalidations: TransientInstance<PathInvalidations>,
        parent: ResolvedVc<FileSystemPath>,
        depth: usize,
        width: usize,
    ) -> anyhow::Result<()> {
        for child_id in 0..width {
            let child_name = RcStr::from(child_id.to_string());
            let child_path = parent.join(child_name).to_resolved().await?;
            if depth == 1 {
                read_path(invalidations.clone(), *child_path).await?;
            } else {
                Box::pin(read_all_paths_inner(
                    invalidations.clone(),
                    child_path,
                    depth - 1,
                    width,
                ))
                .await?;
            }
        }
        Ok(())
    }
    read_all_paths_inner(invalidations, root, depth, width).await
}

fn create_directory_tree(
    modified_file_paths: &mut FxHashSet<PathBuf>,
    parent: &Path,
    depth: usize,
    width: usize,
) -> anyhow::Result<()> {
    let mut rng = rand::rng();
    let mut rand_buf = [0; 16];
    for child_id in 0..width {
        let child_name = child_id.to_string();
        let child_path = parent.join(&child_name);
        if depth == 1 {
            let mut f = std::fs::File::create(&child_path)?;
            rng.fill_bytes(&mut rand_buf);
            f.write_all(&rand_buf)?;
            f.flush()?;
            modified_file_paths.insert(child_path);
        } else {
            std::fs::create_dir(&child_path)?;
            create_directory_tree(modified_file_paths, &child_path, depth - 1, width)?;
        }
    }
    Ok(())
}

fn pick_random_file(depth: usize, width: usize) -> PathBuf {
    let mut rng = rand::rng();
    iter::repeat_with(|| rng.random_range(0..width).to_string())
        .take(depth)
        .collect()
}

struct RandomDirectory {
    depth: usize,
    path: PathBuf,
}

fn pick_random_directory(max_depth: usize, width: usize) -> RandomDirectory {
    let mut rng = rand::rng();
    // never use a depth of 0 because that would be the root directory
    let depth = rng.random_range(1..(max_depth - 1));
    let path = iter::repeat_with(|| rng.random_range(0..width).to_string())
        .take(depth)
        .collect();
    RandomDirectory { depth, path }
}

struct FsCleanup<'a> {
    path: &'a Path,
}

impl Drop for FsCleanup<'_> {
    fn drop(&mut self) {
        std::fs::remove_dir_all(self.path).unwrap();
    }
}

fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
