use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

const PROGRESS_INTERVAL: Duration = Duration::from_secs(1);

use clap::Args;
use rand::{Rng, SeedableRng};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc, apply_effects};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath, LinkContent, LinkType};

#[derive(Args)]
pub struct SymlinkStress {
    #[arg(long)]
    fs_root: PathBuf,
    /// Number of target directories symlinks can point to.
    #[arg(long, default_value_t = 20)]
    target_count: usize,
    /// Number of symlinks to create and update.
    #[arg(long, default_value_t = 50)]
    symlink_count: usize,
    /// Number of symlink writes to perform in parallel.
    #[arg(long, default_value_t = 16)]
    parallelism: usize,
    /// How long to run the stress test for.
    #[arg(long, default_value_t = 5)]
    duration_secs: u64,
}

pub async fn run(args: SymlinkStress) -> anyhow::Result<()> {
    std::fs::create_dir(&args.fs_root)?;
    let fs_root = args.fs_root.canonicalize()?;
    let _guard = FsCleanup {
        path: &fs_root.clone(),
    };

    // Create target directories that symlinks will point to
    let targets_dir = fs_root.join("_targets");
    std::fs::create_dir(&targets_dir)?;
    for i in 0..args.target_count {
        std::fs::create_dir(targets_dir.join(i.to_string()))?;
    }

    // Create symlinks directory
    let symlinks_dir = fs_root.join("_symlinks");
    std::fs::create_dir(&symlinks_dir)?;

    let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
        BackendOptions::default(),
        noop_backing_storage(),
    ));

    let target_count = args.target_count;
    let symlink_count = args.symlink_count;
    let parallelism = args.parallelism;
    let duration = Duration::from_secs(args.duration_secs);

    tt.run_once(async move {
        let project_fs = disk_file_system_operation(RcStr::from(fs_root.to_str().unwrap()))
            .resolve_strongly_consistent()
            .await?;
        let project_root = disk_file_system_root_operation(project_fs)
            .resolve_strongly_consistent()
            .await?
            .owned()
            .await?;

        // Create initial symlinks via turbo-tasks, all pointing to target 0
        let symlinks_path = project_root.join("_symlinks")?;
        let initial_target = RcStr::from("../_targets/0");

        println!("creating {symlink_count} initial symlinks...");

        let initial_op =
            create_initial_symlinks_operation(symlinks_path.clone(), symlink_count, initial_target);
        initial_op.read_strongly_consistent().await?;
        apply_effects(initial_op).await?;

        println!(
            "starting stress test with parallelism={} for {}s...",
            parallelism,
            duration.as_secs()
        );

        let mut rng = rand::rngs::SmallRng::from_rng(&mut rand::rng());
        let mut total_writes: u64 = 0;
        let mut last_progress_writes: u64 = 0;
        let start_time = Instant::now();
        let mut last_progress_time = start_time;

        loop {
            // Check if we've reached the duration limit
            if start_time.elapsed() >= duration {
                break;
            }

            // Generate random symlink updates for this batch
            let updates: Vec<(usize, usize)> = (0..parallelism)
                .map(|_| {
                    let symlink_idx = rng.random_range(0..symlink_count);
                    let target_idx = rng.random_range(0..target_count);
                    (symlink_idx, target_idx)
                })
                .collect();

            // Execute writes in parallel via turbo-tasks
            let write_op = write_symlinks_batch_operation(symlinks_path.clone(), updates);
            write_op.read_strongly_consistent().await?;
            apply_effects(write_op).await?;

            total_writes += parallelism as u64;

            // Print progress every PROGRESS_INTERVAL
            let now = Instant::now();
            if now.duration_since(last_progress_time) >= PROGRESS_INTERVAL {
                let interval_writes = total_writes - last_progress_writes;
                let interval_duration = now.duration_since(last_progress_time);
                let writes_per_sec = interval_writes as f64 / interval_duration.as_secs_f64();
                println!(
                    "{:.1}s: {} writes, {:.0} writes/sec",
                    start_time.elapsed().as_secs_f64(),
                    total_writes,
                    writes_per_sec
                );
                last_progress_time = now;
                last_progress_writes = total_writes;
            }
        }

        // Final summary
        let elapsed = start_time.elapsed();
        let writes_per_sec = total_writes as f64 / elapsed.as_secs_f64();
        println!(
            "completed {} symlink writes in {:.2}s ({:.0} writes/sec)",
            total_writes,
            elapsed.as_secs_f64(),
            writes_per_sec
        );

        Ok(())
    })
    .await?;

    tt.stop_and_wait().await;
    Ok(())
}

#[turbo_tasks::function(operation)]
fn disk_file_system_operation(fs_root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new(rcstr!("project"), fs_root)
}

#[turbo_tasks::function(operation)]
fn disk_file_system_root_operation(fs: ResolvedVc<DiskFileSystem>) -> Vc<FileSystemPath> {
    fs.root()
}

#[turbo_tasks::function(operation)]
async fn create_initial_symlinks_operation(
    symlinks_dir: FileSystemPath,
    count: usize,
    target: RcStr,
) -> anyhow::Result<()> {
    (0..count)
        .map(|i| write_symlink(symlinks_dir.clone(), i, target.clone()))
        .try_join()
        .await?;
    Ok(())
}

#[turbo_tasks::function(operation)]
async fn write_symlinks_batch_operation(
    symlinks_dir: FileSystemPath,
    updates: Vec<(usize, usize)>,
) -> anyhow::Result<()> {
    updates
        .into_iter()
        .map(|(symlink_idx, target_idx)| {
            let target = RcStr::from(format!("../_targets/{}", target_idx));
            write_symlink(symlinks_dir.clone(), symlink_idx, target)
        })
        .try_join()
        .await?;
    Ok(())
}

#[turbo_tasks::function]
async fn write_symlink(
    symlinks_dir: FileSystemPath,
    symlink_idx: usize,
    target: RcStr,
) -> anyhow::Result<()> {
    let symlink_path = symlinks_dir.join(&symlink_idx.to_string())?;
    let link_content = LinkContent::Link {
        target,
        link_type: LinkType::DIRECTORY,
    };
    symlink_path
        .fs()
        .write_link(symlink_path.clone(), link_content.cell())
        .await?;
    Ok(())
}

struct FsCleanup<'a> {
    path: &'a Path,
}

impl Drop for FsCleanup<'_> {
    fn drop(&mut self) {
        std::fs::remove_dir_all(self.path).unwrap();
    }
}
