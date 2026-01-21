#![cfg_attr(windows, feature(junction_point))]

use std::{
    fs::OpenOptions,
    io::Write,
    iter,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use clap::{Args, Parser, Subcommand, ValueEnum};
use rand::{Rng, RngCore, SeedableRng};
use rustc_hash::FxHashSet;
use tokio::time::sleep;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, TransientInstance, Vc, trace::TraceRawVcs};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
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
    #[arg(long)]
    print_missing_invalidations: bool,
    /// Call `start_watching` after the initial read of files instead of before (the default).
    #[arg(long)]
    start_watching_late: bool,
    /// Enable symlink testing. The mode controls what kind of targets the symlinks point to.
    #[arg(long, value_enum)]
    symlinks: Option<SymlinkMode>,
    /// Total number of symlinks to create.
    #[arg(long, default_value_t = 80, requires = "symlinks")]
    symlink_count: u32,
    /// Number of symlink modifications per iteration (only used when --symlinks is set).
    #[arg(long, default_value_t = 20, requires = "symlinks")]
    symlink_modifications: u32,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum SymlinkMode {
    /// Test file symlinks
    #[cfg_attr(windows, doc = "(requires developer mode or admin)")]
    File,
    /// Test directory symlinks
    #[cfg_attr(windows, doc = "(requires developer mode or admin)")]
    Directory,
    /// Test junction points (Windows-only)
    #[cfg(windows)]
    Junction,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
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
            .await?
            .owned()
            .await?;

        create_directory_tree(&mut FxHashSet::default(), &fs_root, args.depth, args.width)?;

        let mut symlink_targets = if let Some(mode) = args.symlinks {
            create_initial_symlinks(&fs_root, mode, args.symlink_count, args.depth)?
        } else {
            Vec::new()
        };

        if !args.start_watching_late {
            project_fs.await?.start_watching(None).await?;
        }

        let read_all_paths_op = read_all_paths_operation(
            invalidations.clone(),
            project_root.clone(),
            args.depth,
            args.width,
            if args.symlinks.is_some() {
                args.symlink_count
            } else {
                0
            },
        );
        read_all_paths_op.read_strongly_consistent().await?;
        {
            let mut invalidations = invalidations.0.lock().unwrap();
            println!("read all {} files", invalidations.len());
            invalidations.clear();
        }

        if args.start_watching_late {
            project_fs.await?.start_watching(None).await?;
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

            if let Some(mode) = args.symlinks
                && !symlink_targets.is_empty()
            {
                for _ in 0..args.symlink_modifications {
                    let symlink_idx = rng.random_range(0..symlink_targets.len());
                    let old_target = &symlink_targets[symlink_idx];

                    let new_target_relative = pick_random_link_target(args.depth, args.width, mode);

                    if new_target_relative != *old_target {
                        let symlink_path = fs_root.join("_symlinks").join(symlink_idx.to_string());
                        let relative_target = Path::new("..").join(&new_target_relative);

                        remove_symlink(&symlink_path, mode)?;
                        create_symlink(&symlink_path, &relative_target, mode)?;

                        modified_file_paths.insert(symlink_path);
                        symlink_targets[symlink_idx] = new_target_relative;
                    }
                }
            }

            // there's no way to know when we've received all the pending events from the operating
            // system, so just sleep and pray
            sleep(Duration::from_millis(args.notify_timeout_ms)).await;
            read_all_paths_op.read_strongly_consistent().await?;
            {
                let mut invalidations = invalidations.0.lock().unwrap();
                let symlink_info = if args.symlinks.is_some() {
                    " and symlinks"
                } else {
                    ""
                };
                println!(
                    "modified {} files{}. found {} invalidations",
                    modified_file_paths.len(),
                    symlink_info,
                    invalidations.len()
                );
                if args.print_missing_invalidations {
                    let absolute_path_invalidations = invalidations
                        .iter()
                        .map(|relative_path| fs_root.join(relative_path))
                        .collect::<FxHashSet<PathBuf>>();
                    let mut missing = modified_file_paths
                        .difference(&absolute_path_invalidations)
                        .collect::<Vec<_>>();
                    missing.sort_unstable();
                    for path in &missing {
                        println!("  missing {path:?}");
                    }
                }
                invalidations.clear();
            }
        }
    })
    .await
}

#[turbo_tasks::function(operation)]
fn disk_file_system_operation(fs_root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new(rcstr!("project"), fs_root)
}

#[turbo_tasks::function(operation)]
fn disk_file_system_root_operation(fs: ResolvedVc<DiskFileSystem>) -> Vc<FileSystemPath> {
    fs.root()
}

#[turbo_tasks::function]
async fn read_path(
    invalidations: TransientInstance<PathInvalidations>,
    path: FileSystemPath,
) -> anyhow::Result<()> {
    let path_str = path.path.clone();
    invalidations.0.lock().unwrap().insert(path_str);
    let _ = path.read().await?;
    Ok(())
}

#[turbo_tasks::function]
async fn read_link(
    invalidations: TransientInstance<PathInvalidations>,
    path: FileSystemPath,
) -> anyhow::Result<()> {
    let path_str = path.path.clone();
    invalidations.0.lock().unwrap().insert(path_str);
    let _ = path.read_link().await?;
    Ok(())
}

#[turbo_tasks::function(operation)]
async fn read_all_paths_operation(
    invalidations: TransientInstance<PathInvalidations>,
    root: FileSystemPath,
    depth: usize,
    width: usize,
    symlink_count: u32,
) -> anyhow::Result<()> {
    async fn read_all_paths_inner(
        invalidations: TransientInstance<PathInvalidations>,
        parent: FileSystemPath,
        depth: usize,
        width: usize,
    ) -> anyhow::Result<()> {
        for child_id in 0..width {
            let child_name = child_id.to_string();
            let child_path = parent.join(&child_name)?;
            if depth == 1 {
                read_path(invalidations.clone(), child_path).await?;
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
    read_all_paths_inner(invalidations.clone(), root.clone(), depth, width).await?;

    let symlinks_dir = root.join("_symlinks")?;
    for i in 0..symlink_count {
        let symlink_path = symlinks_dir.join(&i.to_string())?;
        read_link(invalidations.clone(), symlink_path).await?;
    }

    Ok(())
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

fn create_initial_symlinks(
    fs_root: &Path,
    symlink_mode: SymlinkMode,
    symlink_count: u32,
    depth: usize,
) -> anyhow::Result<Vec<PathBuf>> {
    // Use a dedicated "symlinks" directory to avoid conflicts
    let symlinks_dir = fs_root.join("_symlinks");
    std::fs::create_dir_all(&symlinks_dir)?;

    let initial_target_relative = match symlink_mode {
        SymlinkMode::File => {
            // Point to a file at depth: 0/0/0/.../0
            let mut path = PathBuf::new();
            for _ in 0..depth {
                path.push("0");
            }
            path
        }
        SymlinkMode::Directory => PathBuf::from("0"),
        #[cfg(windows)]
        SymlinkMode::Junction => PathBuf::from("0"),
    };

    let relative_target = Path::new("..").join(&initial_target_relative);

    let mut symlink_targets = Vec::new();
    for i in 0..symlink_count {
        let symlink_path = symlinks_dir.join(i.to_string());
        create_symlink(&symlink_path, &relative_target, symlink_mode)?;
        symlink_targets.push(initial_target_relative.clone());
    }

    Ok(symlink_targets)
}

fn create_symlink(link_path: &Path, target: &Path, mode: SymlinkMode) -> anyhow::Result<()> {
    #[cfg(unix)]
    {
        let _ = mode;
        std::os::unix::fs::symlink(target, link_path)?;
    }
    #[cfg(windows)]
    {
        match mode {
            SymlinkMode::File => {
                std::os::windows::fs::symlink_file(target, link_path)?;
            }
            SymlinkMode::Directory => {
                std::os::windows::fs::symlink_dir(target, link_path)?;
            }
            SymlinkMode::Junction => {
                // Junction points require absolute paths
                let absolute_target = link_path.parent().unwrap_or(link_path).join(target);
                std::os::windows::fs::junction_point(&absolute_target, link_path)?;
            }
        }
    }
    Ok(())
}

fn remove_symlink(link_path: &Path, mode: SymlinkMode) -> anyhow::Result<()> {
    #[cfg(unix)]
    {
        let _ = mode;
        std::fs::remove_file(link_path)?;
    }
    #[cfg(windows)]
    {
        match mode {
            SymlinkMode::File | SymlinkMode::Directory => {
                std::fs::remove_file(link_path)?;
            }
            SymlinkMode::Junction => {
                std::fs::remove_dir(link_path)?;
            }
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

fn pick_random_link_target(depth: usize, width: usize, mode: SymlinkMode) -> PathBuf {
    match mode {
        SymlinkMode::File => pick_random_file(depth, width),
        SymlinkMode::Directory => pick_random_directory(depth, width).path,
        #[cfg(windows)]
        SymlinkMode::Junction => pick_random_directory(depth, width).path,
    }
}

struct FsCleanup<'a> {
    path: &'a Path,
}

impl Drop for FsCleanup<'_> {
    fn drop(&mut self) {
        std::fs::remove_dir_all(self.path).unwrap();
    }
}
