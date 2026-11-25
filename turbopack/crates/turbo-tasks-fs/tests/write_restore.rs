#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Writes restored from the persistent cache are published from their persisted content, without
//! re-executing their write tasks, and outputs that already have that content aren't rewritten.

use std::{fs, path::Path, sync::Arc};

use anyhow::{Context, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Effects, OperationVc, ResolvedVc, TurboTasks, Vc, read_strongly_consistent_and_apply_effects,
    take_effects,
};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, GitVersionInfo, StorageMode, TurboTasksBackend,
};
use turbo_tasks_fs::{DiskFileSystem, DiskFileSystemMap, File, FileContent, FileSystem};

#[turbo_tasks::function(operation, root)]
fn disk(root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new_with_options(
        "restore".into(),
        Vc::cell(root),
        Vec::new(),
        Default::default(),
        DiskFileSystemMap::empty(),
        Some(".staging".into()),
    )
}

#[turbo_tasks::function(operation, root)]
async fn write_text(fs: ResolvedVc<DiskFileSystem>, text: RcStr) -> Result<Vc<()>> {
    FileSystem::root(*fs)
        .await?
        .join("out.txt")?
        .write(FileContent::Content(File::from(text)).cell())
        .await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn capture(operation: OperationVc<()>) -> Result<Vc<Effects>> {
    operation.read_strongly_consistent().await?;
    Ok(take_effects(operation).await?.cell())
}

fn open(cache: &Path) -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(4),
            small_preallocation: true,
            storage_mode: Some(StorageMode::ReadWriteOnShutdown),
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            cache,
            &GitVersionInfo {
                describe: "test-unversioned",
                dirty: false,
            },
            BackingStorageOptions {
                is_short_session: true,
                skip_compaction: true,
                ..Default::default()
            },
        )
        .unwrap()
        .0,
    ))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn restored_write_and_a_new_writer() -> Result<()> {
    let cache_parent = Path::new(env!("CARGO_TARGET_TMPDIR")).join(".cache");
    fs::create_dir_all(&cache_parent)?;
    let cache = tempfile::Builder::new()
        .prefix("write-restore-")
        .tempdir_in(&cache_parent)?;
    let dir = tempfile::tempdir()?;
    let path = fs::canonicalize(dir.path())?;
    let out = path.join("out.txt");
    let root: RcStr = path.to_str().context("Non-UTF8 path")?.into();

    // Session 1: A writes and publishes the path, and is persisted.
    let tt = open(cache.path());
    tt.run_once({
        let root = root.clone();
        async move {
            let fs_vc = disk(root).resolve().strongly_consistent().await?;
            read_strongly_consistent_and_apply_effects(
                capture(write_text(fs_vc, "a".into())),
                |e| e,
            )
            .await?;
            anyhow::Ok(())
        }
    })
    .await?;
    tt.stop_and_wait().await;
    fs::write(&out, "edited outside")?;

    // Session 2: A is restored without executing; publishing it registers it when captured.
    let tt = open(cache.path());
    let result = tt
        .run_once({
            let out = out.clone();
            async move {
                let fs_vc = disk(root).resolve().strongly_consistent().await?;
                read_strongly_consistent_and_apply_effects(
                    capture(write_text(fs_vc, "a".into())),
                    |e| e,
                )
                .await?;
                let after_a = fs::read_to_string(&out)?;
                // B is a different writer of the same path: it only changes it when published.
                let b = capture(write_text(fs_vc, "b".into()));
                b.read_strongly_consistent().await?;
                let after_b_executed = fs::read_to_string(&out)?;
                read_strongly_consistent_and_apply_effects(b, |e| e).await?;
                anyhow::Ok([after_a, after_b_executed, fs::read_to_string(&out)?])
            }
        })
        .await;
    tt.stop_and_wait().await;
    assert_eq!(result?, ["a", "a", "b"]);
    Ok(())
}

/// How often [`write_counted`] executed.
static EXECUTIONS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

#[turbo_tasks::function(operation, root)]
async fn write_counted(fs: ResolvedVc<DiskFileSystem>) -> Result<Vc<()>> {
    EXECUTIONS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    FileSystem::root(*fs)
        .await?
        .join("counted.txt")?
        .write(FileContent::Content(File::from("counted")).cell())
        .await?;
    Ok(Vc::cell(()))
}

/// A write restored from the persistent cache whose bytes are still on disk is accepted without
/// re-executing the write task or rewriting the file. Once the bytes differ, publication rewrites
/// them from the persisted content, still without re-executing the write task.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn restored_write_is_verified_by_its_content() -> Result<()> {
    use std::sync::atomic::Ordering;

    let cache_parent = Path::new(env!("CARGO_TARGET_TMPDIR")).join(".cache");
    fs::create_dir_all(&cache_parent)?;
    let cache = tempfile::Builder::new()
        .prefix("write-verify-")
        .tempdir_in(&cache_parent)?;
    let dir = tempfile::tempdir()?;
    let path = fs::canonicalize(dir.path())?;
    let out = path.join("counted.txt");
    let root: RcStr = path.to_str().context("Non-UTF8 path")?.into();

    let session = |root: RcStr| {
        let tt = open(cache.path());
        async move {
            tt.run_once(async move {
                let fs_vc = disk(root).resolve().strongly_consistent().await?;
                read_strongly_consistent_and_apply_effects(capture(write_counted(fs_vc)), |e| e)
                    .await?;
                anyhow::Ok(())
            })
            .await?;
            tt.stop_and_wait().await;
            anyhow::Ok(())
        }
    };

    session(root.clone()).await?;
    assert_eq!(EXECUTIONS.load(Ordering::SeqCst), 1);
    let modified = fs::metadata(&out)?.modified()?;

    // Unchanged on disk: the restored effect verifies it.
    session(root.clone()).await?;
    assert_eq!(
        EXECUTIONS.load(Ordering::SeqCst),
        1,
        "the write task executed again"
    );
    assert_eq!(
        fs::metadata(&out)?.modified()?,
        modified,
        "the file was rewritten"
    );

    // Same length, different bytes.
    fs::write(&out, "COUNTED")?;
    session(root).await?;
    assert_eq!(
        EXECUTIONS.load(Ordering::SeqCst),
        1,
        "the write task executed again"
    );
    assert_eq!(fs::read_to_string(&out)?, "counted");
    Ok(())
}

#[turbo_tasks::function(operation, root)]
async fn write_linked(fs: ResolvedVc<DiskFileSystem>) -> Result<Vc<()>> {
    FileSystem::root(*fs)
        .await?
        .join("linked.txt")?
        .write(FileContent::Content(File::from("linked")).cell())
        .await?;
    Ok(Vc::cell(()))
}

/// A restored write whose path now holds a link to equal bytes is not on disk: publication writes
/// the file again.
#[cfg(unix)]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn restored_write_is_not_verified_by_a_link_to_equal_bytes() -> Result<()> {
    let cache_parent = Path::new(env!("CARGO_TARGET_TMPDIR")).join(".cache");
    fs::create_dir_all(&cache_parent)?;
    let cache = tempfile::Builder::new()
        .prefix("write-link-")
        .tempdir_in(&cache_parent)?;
    let dir = tempfile::tempdir()?;
    let path = fs::canonicalize(dir.path())?;
    let out = path.join("linked.txt");
    let root: RcStr = path.to_str().context("Non-UTF8 path")?.into();

    for session in 0..2 {
        if session == 1 {
            fs::write(path.join("elsewhere.txt"), "linked")?;
            fs::remove_file(&out)?;
            std::os::unix::fs::symlink("elsewhere.txt", &out)?;
        }
        let tt = open(cache.path());
        let root = root.clone();
        tt.run_once(async move {
            let fs_vc = disk(root).resolve().strongly_consistent().await?;
            read_strongly_consistent_and_apply_effects(capture(write_linked(fs_vc)), |e| e).await?;
            anyhow::Ok(())
        })
        .await?;
        tt.stop_and_wait().await;
    }
    assert!(fs::symlink_metadata(&out)?.file_type().is_file());
    assert_eq!(fs::read_to_string(&out)?, "linked");
    Ok(())
}

/// More outputs than publication applies at once, times its retries.
const MANY_OUTPUTS: u32 = 5000;

#[turbo_tasks::function]
async fn write_numbered(fs: ResolvedVc<DiskFileSystem>, n: u32) -> Result<()> {
    FileSystem::root(*fs)
        .await?
        .join(&format!("many/{n}.txt"))?
        .write(FileContent::Content(File::from(format!("{n}"))).cell())
        .await?;
    Ok(())
}

#[turbo_tasks::function(operation, root)]
async fn write_many(fs: ResolvedVc<DiskFileSystem>) -> Result<Vc<()>> {
    for n in 0..MANY_OUTPUTS {
        write_numbered(*fs, n).as_side_effect().await?;
    }
    Ok(Vc::cell(()))
}

/// Restoring many outputs whose files are gone (e.g. a cache restored without its outputs) writes
/// all of them from their persisted content.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn restoring_many_missing_outputs() -> Result<()> {
    let cache_parent = Path::new(env!("CARGO_TARGET_TMPDIR")).join(".cache");
    fs::create_dir_all(&cache_parent)?;
    let cache = tempfile::Builder::new()
        .prefix("write-many-")
        .tempdir_in(&cache_parent)?;
    let dir = tempfile::tempdir()?;
    let path = fs::canonicalize(dir.path())?;
    let root: RcStr = path.to_str().context("Non-UTF8 path")?.into();

    for session in 0..2 {
        if session == 1 {
            fs::remove_dir_all(path.join("many"))?;
        }
        let tt = open(cache.path());
        let root = root.clone();
        tt.run_once(async move {
            let fs_vc = disk(root).resolve().strongly_consistent().await?;
            read_strongly_consistent_and_apply_effects(capture(write_many(fs_vc)), |e| e).await?;
            anyhow::Ok(())
        })
        .await?;
        tt.stop_and_wait().await;
    }
    for n in [0, MANY_OUTPUTS / 2, MANY_OUTPUTS - 1] {
        assert_eq!(
            fs::read_to_string(path.join(format!("many/{n}.txt")))?,
            n.to_string()
        );
    }
    assert_eq!(
        fs::read_dir(path.join("many"))?.count(),
        MANY_OUTPUTS as usize
    );
    Ok(())
}
