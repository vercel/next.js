#![allow(clippy::needless_return)]

use std::{
    fs::OpenOptions,
    io::{Read, Write},
    iter,
    num::NonZeroU64,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use clap::{Args, ValueEnum};
use rand::{Rng, RngExt, SeedableRng};
use rustc_hash::FxHashSet;
use tokio::time::sleep;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Effects, NonLocalValue, OperationVc, ResolvedVc, TransientInstance, Vc,
    read_strongly_consistent_and_apply_effects, take_effects,
};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{
    DiskFileSystem, DiskFileSystemMap, DiskWatcherConfig, File, FileContent, FileSystem,
    FileSystemPath,
};

// Prefix read-derived writes so they are idempotent: reading our own output produces the same
// effect value, while a subsequent external write produces a new one.
const FILE_SENTINEL_PREFIX: &[u8] = b"sentinel_value:";

#[derive(Args)]
pub struct FsWatcher {
    #[arg(long)]
    fs_root: PathBuf,
    #[arg(long, default_value_t = 4)]
    depth: usize,
    #[arg(long, default_value_t = 6)]
    width: usize,
    #[arg(long, default_value_t = 100)]
    notify_timeout_ms: u64,
    /// Poll the filesystem at this interval instead of using native events. Polling is slower, but
    /// can be useful on filesystems where native events do not work.
    #[arg(long, value_name = "MILLISECONDS")]
    poll_interval_ms: Option<NonZeroU64>,
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
    /// Polling may miss multiple symlink changes within one second because notify's PollWatcher
    /// retains whole-second mtime precision for non-files.
    #[arg(long, value_enum)]
    symlinks: Option<SymlinkMode>,
    /// Total number of symlinks to create.
    #[arg(long, default_value_t = 80, requires = "symlinks")]
    symlink_count: u32,
    /// Number of symlink modifications per iteration (only used when --symlinks is set).
    #[arg(long, default_value_t = 20, requires = "symlinks")]
    symlink_modifications: u32,
    /// Track reads and derived writes for regular files. External modifications invalidate the
    /// reads, and the changed input produces a new write effect.
    #[arg(long)]
    track_read_writes: bool,
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

#[derive(Default, NonLocalValue)]
struct PathInvalidations(Arc<Mutex<FxHashSet<RcStr>>>);

#[turbo_tasks::function(operation, root)]
async fn extract_effects_operation(op: OperationVc<()>) -> anyhow::Result<Vc<Effects>> {
    let _ = op.resolve().strongly_consistent().await?;
    Ok(take_effects(op).await?.cell())
}

pub async fn run(args: FsWatcher) -> anyhow::Result<()> {
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
        let project_fs = disk_file_system_operation(
            RcStr::from(fs_root.to_str().unwrap()),
            watcher_config(args.poll_interval_ms),
        )
        .resolve()
        .strongly_consistent()
        .await?;
        let project_root = disk_file_system_root_operation(project_fs)
            .resolve()
            .strongly_consistent()
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
            project_fs.await?.start_watching().await?;
        }

        let symlink_count = if args.symlinks.is_some() {
            args.symlink_count
        } else {
            0
        };
        let track_read_writes = args.track_read_writes;

        let effects_op = extract_effects_operation(access_all_paths_operation(
            invalidations.clone(),
            project_root.clone(),
            args.depth,
            args.width,
            symlink_count,
            track_read_writes,
        ));
        if track_read_writes {
            read_strongly_consistent_and_apply_effects(effects_op, |e| e).await?;
            let (total, mismatched) = verify_read_written_files(&fs_root, args.depth, args.width);
            println!(
                "read and wrote all {} files, {} mismatches",
                total,
                mismatched.len()
            );
            if args.print_missing_invalidations && !mismatched.is_empty() {
                for path in &mismatched {
                    println!("  mismatch {path:?}");
                }
            }
        } else {
            // Still drive the computation (and propagate errors) without applying effects.
            effects_op.read_strongly_consistent().await?;
            let invalidations = invalidations.0.lock().unwrap();
            println!("read all {} files", invalidations.len());
        }
        invalidations.0.lock().unwrap().clear();

        if args.start_watching_late {
            project_fs.await?.start_watching().await?;
        }

        let mut rand_buf = [0; 16];
        let mut rng = rand::rngs::SmallRng::from_rng(&mut rand::rng());
        loop {
            let mut modified_file_paths = FxHashSet::default();
            let symlink_targets_before = symlink_targets.clone();
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

            // A symlink can be selected more than once per iteration. If later mutations restore
            // its starting target, Turbo Tasks sees no net value change, so don't expect the parent
            // operation to be invalidated.
            remove_unchanged_symlink_paths(
                &mut modified_file_paths,
                &fs_root,
                &symlink_targets_before,
                &symlink_targets,
            );

            // there's no way to know when we've received all the pending events from the operating
            // system, so just sleep and pray
            sleep(Duration::from_millis(args.notify_timeout_ms)).await;
            let effects_op = extract_effects_operation(access_all_paths_operation(
                invalidations.clone(),
                project_root.clone(),
                args.depth,
                args.width,
                symlink_count,
                track_read_writes,
            ));
            let symlink_info = if args.symlinks.is_some() {
                " and symlinks"
            } else {
                ""
            };
            if track_read_writes {
                read_strongly_consistent_and_apply_effects(effects_op, |e| e).await?;
                let (total, mismatched) =
                    verify_read_written_files(&fs_root, args.depth, args.width);
                println!(
                    "modified {} files{}. verified {} files, {} mismatches",
                    modified_file_paths.len(),
                    symlink_info,
                    total,
                    mismatched.len()
                );
                if args.print_missing_invalidations && !mismatched.is_empty() {
                    let mut sorted = mismatched;
                    sorted.sort_unstable();
                    for path in &sorted {
                        println!("  mismatch {path:?}");
                    }
                }
            } else {
                // Still drive the computation (and propagate errors) without applying effects.
                effects_op.read_strongly_consistent().await?;
                let mut invalidations = invalidations.0.lock().unwrap();
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

fn watcher_config(poll_interval_ms: Option<NonZeroU64>) -> DiskWatcherConfig {
    DiskWatcherConfig {
        poll_interval: poll_interval_ms.map(|value| Duration::from_millis(value.get())),
        ..Default::default()
    }
}

#[turbo_tasks::function(operation, root)]
fn disk_file_system_operation(
    fs_root: RcStr,
    watcher_config: DiskWatcherConfig,
) -> Vc<DiskFileSystem> {
    DiskFileSystem::new_with_options(
        rcstr!("project"),
        Vc::cell(fs_root),
        Vec::new(),
        watcher_config,
        DiskFileSystemMap::empty(),
    )
}

#[turbo_tasks::function(operation, root)]
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

fn read_derived_content(current: Option<&[u8]>) -> Vec<u8> {
    let current = current.unwrap_or_default();
    if current.starts_with(FILE_SENTINEL_PREFIX) {
        return current.to_vec();
    }

    let mut content = Vec::with_capacity(FILE_SENTINEL_PREFIX.len() + current.len());
    content.extend_from_slice(FILE_SENTINEL_PREFIX);
    content.extend_from_slice(current);
    content
}

#[turbo_tasks::function]
async fn read_write_path(
    invalidations: TransientInstance<PathInvalidations>,
    path: FileSystemPath,
) -> anyhow::Result<()> {
    let path_str = path.path.clone();
    invalidations.0.lock().unwrap().insert(path_str);

    let current = path.read().await?;
    let content = match &*current {
        FileContent::Content(file) => {
            let mut bytes = Vec::new();
            file.read().read_to_end(&mut bytes)?;
            read_derived_content(Some(&bytes))
        }
        FileContent::NotFound => read_derived_content(None),
    };
    let _ = path
        .write(FileContent::Content(File::from(content)).cell())
        .await?;
    Ok(())
}

#[turbo_tasks::function(operation, root)]
async fn access_all_paths_operation(
    invalidations: TransientInstance<PathInvalidations>,
    root: FileSystemPath,
    depth: usize,
    width: usize,
    symlink_count: u32,
    track_read_writes: bool,
) -> anyhow::Result<()> {
    async fn process_paths_inner(
        invalidations: TransientInstance<PathInvalidations>,
        parent: FileSystemPath,
        depth: usize,
        width: usize,
        track_read_writes: bool,
    ) -> anyhow::Result<()> {
        for child_id in 0..width {
            let child_name = child_id.to_string();
            let child_path = parent.join(&child_name)?;
            if depth == 1 {
                if track_read_writes {
                    read_write_path(invalidations.clone(), child_path).await?;
                } else {
                    read_path(invalidations.clone(), child_path).await?;
                }
            } else {
                Box::pin(process_paths_inner(
                    invalidations.clone(),
                    child_path,
                    depth - 1,
                    width,
                    track_read_writes,
                ))
                .await?;
            }
        }
        Ok(())
    }
    process_paths_inner(
        invalidations.clone(),
        root.clone(),
        depth,
        width,
        track_read_writes,
    )
    .await?;

    // Symlinks remain read-tracked even when regular files use read-derived writes.
    if symlink_count > 0 {
        let symlinks_dir = root.join("_symlinks")?;
        for i in 0..symlink_count {
            read_link(invalidations.clone(), symlinks_dir.join(&i.to_string())?).await?;
        }
    }

    Ok(())
}

/// Verifies that every regular file contains a read-derived sentinel value.
fn verify_read_written_files(fs_root: &Path, depth: usize, width: usize) -> (usize, Vec<PathBuf>) {
    fn check_files_inner(
        parent: &Path,
        depth: usize,
        width: usize,
        total: &mut usize,
        mismatched: &mut Vec<PathBuf>,
    ) {
        for child_id in 0..width {
            let child_path = parent.join(child_id.to_string());
            if depth == 1 {
                *total += 1;
                match std::fs::read(&child_path) {
                    Ok(content) if content.starts_with(FILE_SENTINEL_PREFIX) => {}
                    _ => mismatched.push(child_path),
                }
            } else {
                check_files_inner(&child_path, depth - 1, width, total, mismatched);
            }
        }
    }

    let mut total = 0;
    let mut mismatched = Vec::new();
    check_files_inner(fs_root, depth, width, &mut total, &mut mismatched);
    (total, mismatched)
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

fn remove_unchanged_symlink_paths(
    modified_file_paths: &mut FxHashSet<PathBuf>,
    fs_root: &Path,
    before: &[PathBuf],
    after: &[PathBuf],
) {
    debug_assert_eq!(before.len(), after.len());
    let symlinks_dir = fs_root.join("_symlinks");
    for (index, (before, after)) in before.iter().zip(after).enumerate() {
        if before == after {
            modified_file_paths.remove(&symlinks_dir.join(index.to_string()));
        }
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

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use rustc_hash::FxHashSet;

    use crate::fs_watcher::{
        FILE_SENTINEL_PREFIX, read_derived_content, remove_unchanged_symlink_paths,
    };

    #[test]
    fn prefixes_external_content() {
        assert_eq!(
            read_derived_content(Some(b"external")),
            [FILE_SENTINEL_PREFIX, b"external"].concat()
        );
    }

    #[test]
    fn preserves_already_derived_content() {
        let content = [FILE_SENTINEL_PREFIX, b"external"].concat();
        assert_eq!(read_derived_content(Some(&content)), content);
    }

    #[test]
    fn distinct_external_content_produces_distinct_writes() {
        assert_ne!(
            read_derived_content(Some(b"first")),
            read_derived_content(Some(b"second"))
        );
    }

    #[test]
    fn handles_empty_and_missing_content_deterministically() {
        assert_eq!(read_derived_content(Some(b"")), FILE_SENTINEL_PREFIX);
        assert_eq!(read_derived_content(None), FILE_SENTINEL_PREFIX);
    }

    #[test]
    fn retains_symlinks_with_a_net_target_change() {
        let root = Path::new("/root");
        let symlink = root.join("_symlinks/0");
        let mut modified = FxHashSet::from_iter([symlink.clone()]);

        remove_unchanged_symlink_paths(
            &mut modified,
            root,
            &[PathBuf::from("old")],
            &[PathBuf::from("new")],
        );

        assert_eq!(modified, FxHashSet::from_iter([symlink]));
    }

    #[test]
    fn retains_symlinks_changed_multiple_times_to_a_different_target() {
        let root = Path::new("/root");
        let symlink = root.join("_symlinks/0");
        let mut modified = FxHashSet::from_iter([symlink.clone()]);

        // Intermediate targets are intentionally absent: only the iteration boundaries determine
        // whether the dependent operation observes a net value change.
        remove_unchanged_symlink_paths(
            &mut modified,
            root,
            &[PathBuf::from("start")],
            &[PathBuf::from("final")],
        );

        assert_eq!(modified, FxHashSet::from_iter([symlink]));
    }

    #[test]
    fn removes_symlinks_restored_to_their_starting_target() {
        let root = Path::new("/root");
        let symlink = root.join("_symlinks/0");
        let unrelated = root.join("file");
        let mut modified = FxHashSet::from_iter([symlink, unrelated.clone()]);

        // The link may have taken any number of intermediate targets. Only its starting and final
        // observable values matter to the dependent Turbo Tasks operation.
        remove_unchanged_symlink_paths(
            &mut modified,
            root,
            &[PathBuf::from("same")],
            &[PathBuf::from("same")],
        );

        assert_eq!(modified, FxHashSet::from_iter([unrelated]));
    }

    #[test]
    fn leaves_untouched_symlinks_and_unrelated_paths_alone() {
        let root = Path::new("/root");
        let unrelated = root.join("file");
        let changed_symlink = root.join("_symlinks/1");
        let mut modified = FxHashSet::from_iter([unrelated.clone(), changed_symlink.clone()]);

        remove_unchanged_symlink_paths(
            &mut modified,
            root,
            &[PathBuf::from("unchanged"), PathBuf::from("old")],
            &[PathBuf::from("unchanged"), PathBuf::from("new")],
        );

        assert_eq!(modified, FxHashSet::from_iter([unrelated, changed_symlink]));
    }
}
