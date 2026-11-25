use std::path::PathBuf;

use anyhow::Result;
use bytes::Bytes;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileSystemPath, VirtualFileSystem};
use turbo_tasks_testing::{Registration, register, run_once_without_cache_check};

use crate::{
    AssetsForSourceMapping,
    evaluate::{EvaluatePool, Operation},
    process_pool::{ChildProcessPool, PoolTestHandle},
};

static REGISTRATION: Registration = register!();

fn test_worker(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("tests/{name}"))
}

/// Create a pool backed by the given test worker JS file.
async fn create_pool(worker: &str, concurrency: usize) -> Result<EvaluatePool> {
    Ok(create_pool_with_handle(worker, concurrency).await?.0)
}

/// Create a pool backed by the given test worker JS file, together with a handle that observes
/// the pool's idle process queue without keeping it alive.
async fn create_pool_with_handle(
    worker: &str,
    concurrency: usize,
) -> Result<(EvaluatePool, PoolTestHandle)> {
    let vfs = VirtualFileSystem::new();
    let fs: Vc<Box<dyn turbo_tasks_fs::FileSystem>> = Vc::upcast(vfs);
    let fs = fs.to_resolved().await?;
    let root_path = FileSystemPath {
        fs,
        path: RcStr::default(),
    };

    let assets: Vc<AssetsForSourceMapping> = Vc::cell(Default::default());
    let assets = assets.to_resolved().await?;

    let pool = ChildProcessPool::new(
        std::env::current_dir()?,
        test_worker(worker),
        FxHashMap::default(),
        assets,
        root_path.clone(),
        root_path,
        concurrency,
        false,
    );
    let handle = pool.test_handle();
    Ok((pool.into_evaluate_pool(), handle))
}

/// Shorthand: create a pool with the echo worker.
async fn create_test_pool(concurrency: usize) -> Result<EvaluatePool> {
    create_pool("pool_test_worker.js", concurrency).await
}

/// Every response from the test worker includes the worker's PID, allowing
/// tests to verify whether the same OS process was reused across operations.
#[derive(Serialize, Deserialize, Debug)]
struct Echo {
    echo: serde_json::Value,
    pid: u32,
}

async fn send_recv(op: &mut Box<dyn Operation>, msg: serde_json::Value) -> Echo {
    op.send(Bytes::from(serde_json::to_vec(&msg).unwrap()))
        .await
        .unwrap();
    serde_json::from_slice(&op.recv().await.unwrap()).unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_single_operation() {
    run_once_without_cache_check(&REGISTRATION, async {
        let pool = create_test_pool(2).await.unwrap();
        let mut op = pool.operation().await.unwrap();

        let msg = serde_json::json!({"hello": "world"});
        let resp = send_recv(&mut op, msg.clone()).await;

        assert_eq!(resp.echo, msg);
        assert!(resp.pid > 0);

        drop(op);

        let stats = pool.stats();
        assert_eq!(stats.bootup_count, 1);
        assert_eq!(stats.cold_operation_count, 1);
        assert_eq!(stats.warm_operation_count, 0);
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_process_reuse() {
    run_once_without_cache_check(&REGISTRATION, async {
        let pool = create_test_pool(2).await.unwrap();

        // First operation — spawns a new process.
        let pid1 = {
            let mut op = pool.operation().await.unwrap();
            let resp = send_recv(&mut op, serde_json::json!({"round": 1})).await;
            resp.pid
            // op is dropped here, returning the process to the idle queue.
        };

        let stats = pool.stats();
        assert_eq!(stats.bootup_count, 1);
        assert_eq!(stats.cold_operation_count, 1);

        // Second operation — should reuse the same process.
        let pid2 = {
            let mut op = pool.operation().await.unwrap();
            let resp = send_recv(&mut op, serde_json::json!({"round": 2})).await;
            resp.pid
        };

        assert_eq!(
            pid1, pid2,
            "expected the second operation to reuse the same process"
        );

        let stats = pool.stats();
        assert_eq!(
            stats.bootup_count, 1,
            "no new process should have been spawned"
        );
        assert_eq!(
            stats.warm_operation_count, 1,
            "second op should be warm (reused)"
        );
        assert_eq!(
            stats.cold_operation_count, 1,
            "only the first op should be cold"
        );
    })
    .await;
}

#[cfg(all(feature = "process_pool", not(feature = "worker_pool")))]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_pre_warm() {
    run_once_without_cache_check(&REGISTRATION, async {
        let pool = create_test_pool(2).await.unwrap();

        // Pre-warm spawns a process in the background.
        pool.pre_warm();

        // Wait for the pre-warmed process to finish booting.
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);
        loop {
            if pool.stats().bootup_count == 1 {
                break;
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "pre_warm did not complete within timeout"
            );
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        assert_eq!(pool.stats().workers, 1);

        // The first operation should pick up the pre-warmed idle process,
        // registering as a warm (not cold) operation.
        let mut op = pool.operation().await.unwrap();
        let resp = send_recv(&mut op, serde_json::json!({"pre_warmed": true})).await;
        assert_eq!(resp.echo, serde_json::json!({"pre_warmed": true}));

        drop(op);

        let stats = pool.stats();
        assert_eq!(
            stats.bootup_count, 1,
            "no additional process should have been spawned"
        );
        assert_eq!(
            stats.warm_operation_count, 1,
            "operation should have reused the pre-warmed process"
        );
        assert_eq!(stats.cold_operation_count, 0, "no cold operations expected");
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_concurrent_operations() {
    run_once_without_cache_check(&REGISTRATION, async {
        let pool = create_test_pool(2).await.unwrap();

        // Force two separate processes into the idle pool by holding the first
        // operation open while starting the second. This prevents the pool from
        // reusing the first process for the second request.
        let pid1;
        let pid2;
        {
            let mut op1 = pool.operation().await.unwrap();
            // op1 is still held, so the pool must spawn a second process.
            let mut op2 = pool.operation().await.unwrap();
            pid1 = send_recv(&mut op1, serde_json::json!({"warmup": 1}))
                .await
                .pid;
            pid2 = send_recv(&mut op2, serde_json::json!({"warmup": 2}))
                .await
                .pid;
        }
        assert_ne!(
            pid1, pid2,
            "holding two operations should use different processes"
        );

        let stats = pool.stats();
        assert_eq!(stats.bootup_count, 2);
        assert_eq!(stats.cold_operation_count, 2);

        // Both processes are now idle. Run two operations concurrently — they
        // should each pick up one of the idle processes.
        let (r1, r2) = tokio::join!(
            async {
                let mut op = pool.operation().await.unwrap();
                send_recv(&mut op, serde_json::json!({"task": "a"})).await
            },
            async {
                let mut op = pool.operation().await.unwrap();
                send_recv(&mut op, serde_json::json!({"task": "b"})).await
            }
        );

        assert_eq!(r1.echo, serde_json::json!({"task": "a"}));
        assert_eq!(r2.echo, serde_json::json!({"task": "b"}));
        assert_ne!(
            r1.pid, r2.pid,
            "expected concurrent operations to use different processes"
        );
        // Both PIDs should match the original two processes (reuse, no new spawns).
        assert!(
            (r1.pid == pid1 || r1.pid == pid2) && (r2.pid == pid1 || r2.pid == pid2),
            "expected concurrent operations to reuse the pre-existing processes"
        );

        let stats = pool.stats();
        assert_eq!(
            stats.bootup_count, 2,
            "no new processes should have been spawned"
        );
        assert_eq!(
            stats.warm_operation_count, 2,
            "both concurrent ops should be warm"
        );
    })
    .await;
}

#[cfg(all(feature = "process_pool", not(feature = "worker_pool")))]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_pre_warm_failure() {
    run_once_without_cache_check(&REGISTRATION, async {
        let pool = create_pool("pool_test_broken_worker.js", 2).await.unwrap();

        // Pre-warm with a worker that exits immediately (startup failure).
        pool.pre_warm();

        // Wait for the pre_warm task to observe the failure. Since the worker
        // exits right away, this should resolve quickly. We poll until workers
        // returns to 0 (the error path calls remove_worker).
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);
        loop {
            let stats = pool.stats();
            // add_booting_worker sets workers=1, booting_workers=1.
            // On failure: finished_booting_worker + remove_worker resets both to 0.
            if stats.workers == 0 && stats.booting_workers == 0 {
                break;
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "pre_warm failure was not cleaned up within timeout"
            );
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        let stats = pool.stats();
        assert_eq!(
            stats.bootup_count, 0,
            "failed boot should not count as successful"
        );
        assert_eq!(
            stats.workers, 0,
            "failed pre_warm should not leave phantom workers"
        );
        assert_eq!(stats.booting_workers, 0);
    })
    .await;
}

/// Whether the process with `pid` is still running. A zombie (exited, not yet reaped) counts as
/// not running.
#[cfg(target_os = "linux")]
fn is_process_running(pid: u32) -> bool {
    match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
        // The state follows the parenthesized command name, e.g. `1234 (node) S ...`.
        Ok(stat) => stat
            .rsplit_once(')')
            .and_then(|(_, rest)| rest.split_whitespace().next())
            .is_some_and(|state| state != "Z" && state != "X"),
        Err(_) => false,
    }
}

#[cfg(target_os = "linux")]
async fn wait_for_process_exit(pid: u32) {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(10);
    while is_process_running(pid) {
        assert!(
            tokio::time::Instant::now() < deadline,
            "process {pid} is still running"
        );
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
}

/// Runs one operation and returns the PID of the process that served it. The process is idle
/// afterwards.
#[cfg(target_os = "linux")]
async fn run_operation(pool: &EvaluatePool) -> u32 {
    let mut op = pool.operation().await.unwrap();
    send_recv(&mut op, serde_json::json!({"ping": true}))
        .await
        .pid
}

#[cfg(target_os = "linux")]
#[turbo_tasks::function(operation, root)]
async fn cell_owned_test_pool() -> Result<Vc<EvaluatePool>> {
    Ok(create_pool_with_handle("pool_test_worker.js", 2)
        .await?
        .0
        .cell())
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_cell_drop_on_turbo_tasks_shutdown_kills_idle_processes() {
    let instance = REGISTRATION.create_turbo_tasks("cell_owned_test_pool", true);
    let tt = instance.tt.clone();
    let pid = turbo_tasks::run_once(tt.clone(), async {
        let pool = cell_owned_test_pool().read_strongly_consistent().await?;
        Ok(run_operation(&pool).await)
    })
    .await
    .unwrap();
    assert!(is_process_running(pid));

    // Dropping the backend storage drops the `EvaluatePool` cell, which owns the idle process.
    tt.stop_and_wait().await;
    wait_for_process_exit(pid).await;
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_drop_kills_idle_processes() {
    run_once_without_cache_check(&REGISTRATION, async {
        let (pool, handle) = create_pool_with_handle("pool_test_worker.js", 2)
            .await
            .unwrap();
        assert!(handle.is_registered());

        let pid = run_operation(&pool).await;
        assert_eq!(handle.idle_count(), 1);
        assert!(is_process_running(pid));

        drop(pool);

        assert!(!handle.is_registered());
        assert!(!handle.is_queue_alive());
        wait_for_process_exit(pid).await;
    })
    .await;
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_drop_with_inflight_operation() {
    run_once_without_cache_check(&REGISTRATION, async {
        let (pool, handle) = create_pool_with_handle("pool_test_worker.js", 2)
            .await
            .unwrap();

        let mut op1 = pool.operation().await.unwrap();
        let mut op2 = pool.operation().await.unwrap();
        let pid1 = send_recv(&mut op1, serde_json::json!({"before": "drop"}))
            .await
            .pid;
        let pid2 = send_recv(&mut op2, serde_json::json!({"before": "drop"}))
            .await
            .pid;
        assert_ne!(pid1, pid2);

        drop(pool);
        assert!(!handle.is_registered());

        // The operations still work after their pool was dropped.
        let resp = send_recv(&mut op1, serde_json::json!({"after": "drop"})).await;
        assert_eq!(resp.pid, pid1);

        // Returning a process to the dropped pool kills it instead of keeping it idle, even while
        // another operation still references the pool's queue.
        drop(op1);
        assert!(handle.is_queue_alive());
        assert_eq!(handle.idle_count(), 0);
        wait_for_process_exit(pid1).await;
        assert!(is_process_running(pid2));

        drop(op2);
        assert!(!handle.is_queue_alive());
        wait_for_process_exit(pid2).await;
    })
    .await;
}

#[cfg(all(feature = "process_pool", not(feature = "worker_pool")))]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_drop_during_pre_warm() {
    run_once_without_cache_check(&REGISTRATION, async {
        let (pool, handle) = create_pool_with_handle("pool_test_worker.js", 2)
            .await
            .unwrap();

        pool.pre_warm();
        drop(pool);
        assert!(!handle.is_registered());

        // Pre-warming keeps the queue alive until the process has booted, then pushes the process
        // into the closed queue, which kills it.
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);
        while handle.is_queue_alive() {
            assert_eq!(handle.idle_count(), 0);
            assert!(
                tokio::time::Instant::now() < deadline,
                "pre_warm did not finish within timeout"
            );
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await;
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_drop_does_not_affect_other_pool() {
    run_once_without_cache_check(&REGISTRATION, async {
        let (pool_a, handle_a) = create_pool_with_handle("pool_test_worker.js", 2)
            .await
            .unwrap();
        let (pool_b, handle_b) = create_pool_with_handle("pool_test_worker.js", 2)
            .await
            .unwrap();

        let pid_a = run_operation(&pool_a).await;
        let pid_b = run_operation(&pool_b).await;
        assert_ne!(pid_a, pid_b);

        drop(pool_a);
        wait_for_process_exit(pid_a).await;

        assert!(!handle_a.is_registered());
        assert!(handle_b.is_registered());
        assert!(is_process_running(pid_b));
        assert_eq!(handle_b.idle_count(), 1);
        assert_eq!(
            run_operation(&pool_b).await,
            pid_b,
            "the other pool should still reuse its idle process"
        );
    })
    .await;
}
