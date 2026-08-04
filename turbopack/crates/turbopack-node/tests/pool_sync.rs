// Live verification of the SYNC node-eval pool bridge (option B). The async
// pool is kept intact and driven on a dedicated edge runtime via `block_on`
// (see `process_pool::edge_rt`); these tests prove that a real Node worker
// actually spawns, connects over TCP driven by that runtime, evaluates, and
// echoes back — all from the sync turbo-tasks engine (no ambient tokio runtime,
// `#[turbo_tasks::test]` in sync mode is a plain `#[test]` driven by `sync_poll`).
//
// Gated on `sync` + `process_pool`. In the async build the sibling `pool.rs`
// covers the same behavior with `#[tokio::test]`; this file compiles to nothing.
#![cfg(all(feature = "sync", feature = "process_pool"))]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::path::PathBuf;

use bytes::Bytes;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{Vc, read};
use turbo_tasks_fs::{FileSystemPath, VirtualFileSystem};
use turbo_tasks_testing::{Registration, register, run_once_without_cache_check};
use turbopack_node::{
    AssetsForSourceMapping,
    evaluate::{EvaluatePool, Operation},
    process_pool::ChildProcessPool,
};

static REGISTRATION: Registration = register!();

fn test_worker(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("tests/{name}"))
}

/// Every response from the test worker includes the worker's PID, allowing
/// tests to verify whether the same OS process was reused across operations.
#[derive(Serialize, Deserialize, Debug)]
struct Echo {
    echo: serde_json::Value,
    pid: u32,
}

/// Build a pool backed by the echo worker. Vc reads use the dual-mode `read!`
/// (identity/`sync_read` under `sync`); `ChildProcessPool::create` is plain
/// synchronous construction in both modes.
fn create_test_pool(concurrency: usize) -> EvaluatePool {
    let vfs = VirtualFileSystem::new();
    let fs: Vc<Box<dyn turbo_tasks_fs::FileSystem>> = Vc::upcast(vfs);
    let fs = read!(fs.to_resolved()).unwrap();
    let root_path = FileSystemPath {
        fs,
        path: RcStr::default(),
    };

    let assets: Vc<AssetsForSourceMapping> = Vc::cell(Default::default());
    let assets = read!(assets.to_resolved()).unwrap();

    ChildProcessPool::create(
        std::env::current_dir().unwrap(),
        test_worker("pool_test_worker.js"),
        FxHashMap::default(),
        assets,
        root_path.clone(),
        root_path,
        concurrency,
        false,
    )
}

/// One blocking round-trip through the sync bridge: `operation()` acquires a
/// worker (spawning + TCP connect on the edge runtime), `send`/`recv` are plain
/// blocking calls that `block_on` the async IPC.
#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn sync_pool_single_operation() {
    run_once_without_cache_check(&REGISTRATION, async {
        let pool = create_test_pool(2);
        let mut op = pool.operation().unwrap();

        let msg = serde_json::json!({"hello": "world"});
        op.send(Bytes::from(serde_json::to_vec(&msg).unwrap()))
            .unwrap();
        let resp: Echo = serde_json::from_slice(&op.recv().unwrap()).unwrap();

        assert_eq!(resp.echo, msg);
        assert!(resp.pid > 0, "worker should report a real PID");

        drop(op);

        let stats = pool.stats();
        assert_eq!(stats.bootup_count, 1);
        assert_eq!(stats.cold_operation_count, 1);
        assert_eq!(stats.warm_operation_count, 0);
    })
    .await
}

/// A second operation after the first is returned to the idle queue must reuse
/// the same OS process — proving the idle-queue path works across separate
/// `block_on`-bridged operations.
#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn sync_pool_process_reuse() {
    run_once_without_cache_check(&REGISTRATION, async {
        let pool = create_test_pool(2);

        let pid1 = {
            let mut op = pool.operation().unwrap();
            op.send(Bytes::from(
                serde_json::to_vec(&serde_json::json!({"round": 1})).unwrap(),
            ))
            .unwrap();
            let resp: Echo = serde_json::from_slice(&op.recv().unwrap()).unwrap();
            resp.pid
        };

        let pid2 = {
            let mut op = pool.operation().unwrap();
            op.send(Bytes::from(
                serde_json::to_vec(&serde_json::json!({"round": 2})).unwrap(),
            ))
            .unwrap();
            let resp: Echo = serde_json::from_slice(&op.recv().unwrap()).unwrap();
            resp.pid
        };

        assert_eq!(
            pid1, pid2,
            "expected the second operation to reuse the same process"
        );

        let stats = pool.stats();
        assert_eq!(stats.bootup_count, 1, "no new process should have spawned");
        assert_eq!(stats.warm_operation_count, 1, "second op should be warm");
        assert_eq!(stats.cold_operation_count, 1, "only the first op is cold");
    })
    .await
}
