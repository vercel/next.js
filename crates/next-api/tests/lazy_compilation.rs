#![feature(arbitrary_self_types)]

use anyhow::Result;
use next_api::project::activate_lazy_chunk_operation;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{TurboTasks, Vc};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, GitVersionInfo, StorageMode, TurboTasksBackend,
    turbo_backing_storage,
};
use turbopack_ecmascript::async_chunk::proxy::{activation_key, lazy_compilation_state};

#[turbo_tasks::function(operation, root)]
async fn is_active_operation(key: RcStr) -> Result<Vc<bool>> {
    Ok(Vc::cell(lazy_compilation_state(key).await?.is_active()))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lazy_compilation_survives_cache_restarts() {
    let cache = tempfile::tempdir().unwrap();

    // Persist an inactive reader, activate it after a restart, then repeat the
    // activation in another session where the activation operation is cached.
    for session in 0..3 {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                num_workers: Some(2),
                small_preallocation: true,
                storage_mode: Some(StorageMode::ReadWriteOnShutdown),
                ..Default::default()
            },
            turbo_backing_storage(
                cache.path(),
                &GitVersionInfo {
                    describe: "lazy-compilation-test",
                    dirty: false,
                },
                BackingStorageOptions {
                    is_short_session: true,
                    ..Default::default()
                },
            )
            .unwrap()
            .0,
        ));

        tt.run_once(async move {
            for read_before_activation in [true, false] {
                let key = activation_key(if read_before_activation {
                    "test-lazy-module-reader-first"
                } else {
                    "test-lazy-module-activation-first"
                });
                let active = is_active_operation(key.clone());
                if read_before_activation {
                    assert!(
                        !*active.read_strongly_consistent().await?,
                        "lazy compilation must start inactive in session {session}"
                    );
                }
                if session > 0 || !read_before_activation {
                    let chunk_path: RcStr = format!("static/chunks/{key}.js").into();
                    assert!(
                        *activate_lazy_chunk_operation(chunk_path)
                            .read_strongly_consistent()
                            .await?
                    );
                    assert!(
                        *active.read_strongly_consistent().await?,
                        "activation must invalidate a restored reader in session {session}"
                    );
                }
            }
            assert!(
                !*activate_lazy_chunk_operation(rcstr!("static/chunks/ordinary.js"))
                    .read_strongly_consistent()
                    .await?
            );
            anyhow::Ok(())
        })
        .await
        .unwrap();
        tt.stop_and_wait().await;
    }
}
