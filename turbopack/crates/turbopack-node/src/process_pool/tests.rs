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
};

static REGISTRATION: Registration = register!();

fn test_worker(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("tests/{name}"))
}

/// Create a pool backed by the given test worker JS file.
async fn create_pool(worker: &str, concurrency: usize) -> Result<EvaluatePool> {
    use crate::process_pool::ChildProcessPool;

    let vfs = VirtualFileSystem::new();
    let fs: Vc<Box<dyn turbo_tasks_fs::FileSystem>> = Vc::upcast(vfs);
    let fs = fs.to_resolved().await?;
    let root_path = FileSystemPath {
        fs,
        path: RcStr::default(),
    };

    let assets: Vc<AssetsForSourceMapping> = Vc::cell(Default::default());
    let assets = assets.to_resolved().await?;

    Ok(ChildProcessPool::create(
        std::env::current_dir()?,
        test_worker(worker),
        FxHashMap::default(),
        assets,
        root_path.clone(),
        root_path,
        concurrency,
        false,
    ))
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
async fn test_pool_kill_all_workers() {
    run_once_without_cache_check(&REGISTRATION, async {
        let pool = create_test_pool(2).await.unwrap();

        // An idle process is killed.
        let pid1 = {
            let mut op = pool.operation().await.unwrap();
            send_recv(&mut op, serde_json::json!({"round": 1}))
                .await
                .pid
        };
        pool.kill_all_workers();
        assert_eq!(pool.stats().workers, 0);

        // A process that is in use while the workers are killed isn't reused afterwards.
        let pid2 = {
            let mut op = pool.operation().await.unwrap();
            let pid = send_recv(&mut op, serde_json::json!({"round": 2}))
                .await
                .pid;
            pool.kill_all_workers();
            pid
        };
        assert_ne!(pid1, pid2, "expected a fresh process after killing");
        assert_eq!(pool.stats().workers, 0);

        let pid3 = {
            let mut op = pool.operation().await.unwrap();
            send_recv(&mut op, serde_json::json!({"round": 3}))
                .await
                .pid
        };
        assert_ne!(pid2, pid3, "expected a fresh process after killing");

        let stats = pool.stats();
        assert_eq!(stats.bootup_count, 3);
        assert_eq!(stats.cold_operation_count, 3);
        assert_eq!(stats.warm_operation_count, 0);
        assert_eq!(stats.workers, 1);
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_kill_all_workers_concurrent() {
    run_once_without_cache_check(&REGISTRATION, async {
        let pool = std::sync::Arc::new(create_test_pool(2).await.unwrap());

        for round in 0..5 {
            // Operations that run while the workers are killed.
            let operations = (0..4)
                .map(|i| {
                    let pool = pool.clone();
                    tokio::spawn(async move {
                        let mut op = pool.operation().await.unwrap();
                        send_recv(&mut op, serde_json::json!({"round": round, "i": i}))
                            .await
                            .pid
                    })
                })
                .collect::<Vec<_>>();
            tokio::task::yield_now().await;
            pool.kill_all_workers();
            let mut old_pids = Vec::new();
            for operation in operations {
                old_pids.push(operation.await.unwrap());
            }
            // Processes used before the kill finished must not be reused afterwards.
            pool.kill_all_workers();
            assert_eq!(pool.stats().workers, 0, "round {round}");

            let mut op = pool.operation().await.unwrap();
            let pid = send_recv(&mut op, serde_json::json!({"after": round}))
                .await
                .pid;
            assert!(
                !old_pids.contains(&pid),
                "round {round}: reused a killed process"
            );
        }
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_pool_kill_all_workers_queued_operation() {
    run_once_without_cache_check(&REGISTRATION, async {
        let pool = std::sync::Arc::new(create_test_pool(1).await.unwrap());

        let mut running = pool.operation().await.unwrap();
        let old_pid = send_recv(&mut running, serde_json::json!({"running": true}))
            .await
            .pid;

        // An operation that is still waiting for the concurrency permit while the workers are
        // killed.
        let queued = tokio::spawn({
            let pool = pool.clone();
            async move {
                let mut op = pool.operation().await.unwrap();
                send_recv(&mut op, serde_json::json!({"queued": true}))
                    .await
                    .pid
            }
        });
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        pool.kill_all_workers();
        drop(running);

        // The queued operation gets a process that only ran code after the kill, so that process
        // is kept for reuse.
        let queued_pid = queued.await.unwrap();
        assert_ne!(
            old_pid, queued_pid,
            "expected a fresh process after killing"
        );
        assert_eq!(pool.stats().workers, 1);

        let mut op = pool.operation().await.unwrap();
        let pid = send_recv(&mut op, serde_json::json!({"after": true}))
            .await
            .pid;
        assert_eq!(pid, queued_pid, "expected the fresh process to be reused");
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
