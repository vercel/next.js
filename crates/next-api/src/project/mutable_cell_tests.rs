use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
    time::Duration,
};

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TurboTasks, Vc};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, GitVersionInfo, StorageMode, TurboTasksBackend,
    noop_backing_storage,
};

use crate::project::{
    AdditionalRootConfig, DebugBuildPaths, DefineEnv, DraftModeOptions, PartialProjectOptions,
    ProjectContainer, ProjectOptions, WatchOptions, additional_root_path_operation,
    define_env_diff_report, disk_file_system_map_operation, project_root_path_operation,
};

static READER_RUNS: [AtomicU32; 2] = [const { AtomicU32::new(0) }; 2];

fn create_tt() -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            small_preallocation: true,
            gc: Some(true),
            ..Default::default()
        },
        noop_backing_storage(),
    ))
}

fn persistent_tt(path: &Path) -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            small_preallocation: true,
            gc: Some(true),
            storage_mode: Some(StorageMode::ReadWriteOnShutdown),
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            path,
            &GitVersionInfo {
                describe: "project-mutable-cells-test",
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

fn options(root: &Path) -> ProjectOptions {
    ProjectOptions {
        root_path: root.canonicalize().unwrap().to_str().unwrap().into(),
        project_path: RcStr::default(),
        next_config: rcstr!("{}"),
        additional_roots: Vec::new(),
        env: Vec::new(),
        define_env: DefineEnv {
            client: Vec::new(),
            edge: Vec::new(),
            nodejs: Vec::new(),
        },
        watch: WatchOptions::default(),
        dev: false,
        encryption_key: rcstr!("test-key"),
        build_id: rcstr!("initial"),
        preview_props: DraftModeOptions {
            preview_mode_id: rcstr!("test-preview"),
            preview_mode_encryption_key: rcstr!("test-preview-key"),
            preview_mode_signing_key: rcstr!("test-preview-signing"),
        },
        browserslist_query: rcstr!("last 1 Chrome version"),
        no_mangling: false,
        write_routes_hashes_manifest: false,
        current_node_js_version: rcstr!("v20.0.0"),
        debug_build_paths: None,
        deferred_entries: None,
        is_persistent_caching_enabled: false,
        next_version: rcstr!("test"),
        server_hmr: false,
    }
}

#[turbo_tasks::function(operation, root)]
async fn read_build_id(
    container: ResolvedVc<ProjectContainer>,
    tracked: bool,
) -> Result<Vc<RcStr>> {
    READER_RUNS[usize::from(!tracked)].fetch_add(1, Ordering::SeqCst);
    let container = container.await?;
    let snapshot = if tracked {
        container.options_state.get()?
    } else {
        container.options_state.get_untracked()?
    };
    Ok(Vc::cell(snapshot.0.as_ref().unwrap().build_id.clone()))
}

#[turbo_tasks::function(operation, root)]
async fn project_build_id(container: ResolvedVc<ProjectContainer>) -> Result<Vc<RcStr>> {
    Ok(Vc::cell(container.project().await?.build_id.clone()))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn initialization_publishes_filesystem_cells_and_preserves_old_snapshots() {
    let scratch = tempfile::tempdir().unwrap();
    let project_root = scratch.path().join("project");
    let extra_root = scratch.path().join("extra");
    std::fs::create_dir_all(&project_root).unwrap();
    std::fs::create_dir_all(&extra_root).unwrap();
    let mut initial = options(&project_root);
    let expected_root = initial.root_path.clone();
    let expected_extra: RcStr = extra_root.canonicalize().unwrap().to_str().unwrap().into();
    initial.additional_roots.push(AdditionalRootConfig {
        key: rcstr!("extra"),
        path: expected_extra.clone(),
        ignore_if_missing: false,
    });
    let tt = create_tt();
    tokio::time::timeout(
        Duration::from_secs(30),
        tt.run_once(async move {
            let operation = ProjectContainer::new_operation(rcstr!("initialization"), false);
            let container = operation.resolve().strongly_consistent().await?;
            let held = operation.read_strongly_consistent().await?;
            let old_options = held.options_state.get_untracked()?;
            let old_filesystems = held.file_systems_state.get_untracked()?;
            let old_roots = held.additional_roots_state.get_untracked()?;
            assert!(old_options.0.is_none());
            assert!(old_filesystems.0.is_none());
            assert!(old_roots.0.is_empty());
            assert!(
                project_root_path_operation(container)
                    .read_strongly_consistent()
                    .await
                    .is_err()
            );
            assert!(
                disk_file_system_map_operation(container)
                    .read_strongly_consistent()
                    .await
                    .is_err()
            );
            assert!(
                project_build_id(container)
                    .read_strongly_consistent()
                    .await
                    .is_err()
            );
            let error = container
                .update(PartialProjectOptions::default())
                .await
                .unwrap_err();
            assert!(error.to_string().contains("initialized with initialize()"));

            assert!(
                ProjectContainer::initialize(operation, initial)
                    .await?
                    .is_empty()
            );
            assert_eq!(
                *project_root_path_operation(container)
                    .read_strongly_consistent()
                    .await?,
                expected_root
            );
            assert_eq!(
                *additional_root_path_operation(container, rcstr!("extra"))
                    .read_strongly_consistent()
                    .await?,
                expected_extra
            );
            let map = disk_file_system_map_operation(container)
                .read_strongly_consistent()
                .await?;
            assert_eq!(map.len(), 2);
            assert!(map.lookup_fs_path(&project_root.join("file.js")).is_some());
            assert!(map.lookup_fs_path(&extra_root.join("file.js")).is_some());
            assert_eq!(
                held.options_state
                    .get_untracked()?
                    .0
                    .as_ref()
                    .unwrap()
                    .build_id,
                "initial"
            );
            assert!(held.file_systems_state.get_untracked()?.0.is_some());
            assert_eq!(held.additional_roots_state.get_untracked()?.0.len(), 1);
            assert!(old_options.0.is_none());
            assert!(old_filesystems.0.is_none());
            assert!(old_roots.0.is_empty());
            assert_eq!(
                *project_build_id(container)
                    .read_strongly_consistent()
                    .await?,
                "initial"
            );
            anyhow::Ok(())
        }),
    )
    .await
    .unwrap()
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn actual_updates_invalidate_tracked_readers_not_held_or_untracked_snapshots() {
    let scratch = tempfile::tempdir().unwrap();
    let initial = options(scratch.path());
    let tt = create_tt();
    tokio::time::timeout(
        Duration::from_secs(30),
        tt.run_once(async move {
            let operation = ProjectContainer::new_operation(rcstr!("tracked"), false);
            ProjectContainer::initialize(operation, initial).await?;
            let container = operation.resolve().strongly_consistent().await?;
            let held = operation.read_strongly_consistent().await?;
            let old = held.options_state.get_untracked()?;
            assert_eq!(
                *read_build_id(container, true)
                    .read_strongly_consistent()
                    .await?,
                "initial"
            );
            assert_eq!(
                *read_build_id(container, false)
                    .read_strongly_consistent()
                    .await?,
                "initial"
            );
            assert_eq!(
                *project_build_id(container)
                    .read_strongly_consistent()
                    .await?,
                "initial"
            );
            let tracked_runs = READER_RUNS[0].load(Ordering::SeqCst);
            let untracked_runs = READER_RUNS[1].load(Ordering::SeqCst);
            assert!(tracked_runs > 0 && untracked_runs > 0);
            container
                .update(PartialProjectOptions {
                    build_id: Some(rcstr!("updated")),
                    ..Default::default()
                })
                .await?;
            assert_eq!(old.0.as_ref().unwrap().build_id, "initial");
            assert_eq!(
                held.options_state
                    .get_untracked()?
                    .0
                    .as_ref()
                    .unwrap()
                    .build_id,
                "updated"
            );
            assert_eq!(
                *read_build_id(container, true)
                    .read_strongly_consistent()
                    .await?,
                "updated"
            );
            assert_eq!(
                *read_build_id(container, false)
                    .read_strongly_consistent()
                    .await?,
                "initial"
            );
            assert_eq!(
                *project_build_id(container)
                    .read_strongly_consistent()
                    .await?,
                "updated"
            );
            // Determinism verification may repeat executions. The tracked reader must run
            // again, whereas the untracked reader must never rerun because of this write.
            assert!(READER_RUNS[0].load(Ordering::SeqCst) > tracked_runs);
            assert_eq!(READER_RUNS[1].load(Ordering::SeqCst), untracked_runs);
            anyhow::Ok(())
        }),
    )
    .await
    .unwrap()
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent_partial_updates_preserve_disjoint_fields_and_all_option_semantics() {
    let scratch = tempfile::tempdir().unwrap();
    let initial = options(scratch.path());
    let expected_root = initial.root_path.clone();
    let tt = create_tt();
    let container = tt
        .run_once(async move {
            let operation = ProjectContainer::new_operation(rcstr!("updates"), false);
            ProjectContainer::initialize(operation, initial).await?;
            operation.resolve().strongly_consistent().await
        })
        .await
        .unwrap();
    let barrier = Arc::new(tokio::sync::Barrier::new(2));
    let mut writers = Vec::new();
    for no_mangling in [false, true] {
        let tt = tt.clone();
        let barrier = barrier.clone();
        writers.push(tokio::spawn(async move {
            tt.run_once(async move {
                for index in 0..20 {
                    // Synchronize actual caller tasks, never block inside a cell update closure.
                    barrier.wait().await;
                    let partial = if no_mangling {
                        PartialProjectOptions {
                            no_mangling: Some(true),
                            ..Default::default()
                        }
                    } else {
                        PartialProjectOptions {
                            build_id: Some(RcStr::from(format!("build-{index}"))),
                            ..Default::default()
                        }
                    };
                    container.update(partial).await?;
                }
                anyhow::Ok(())
            })
            .await
        }));
    }
    tokio::time::timeout(Duration::from_secs(30), async {
        for writer in writers {
            writer.await.unwrap().unwrap();
        }
    })
    .await
    .unwrap();
    tt.run_once(async move {
        let held = container.await?;
        let snapshot = held.options_state.get_untracked()?;
        let merged = snapshot.0.as_ref().unwrap();
        assert_eq!(merged.build_id, "build-19");
        assert!(merged.no_mangling);
        let new_define_env = DefineEnv {
            client: vec![(rcstr!("VISIBLE"), Some(rcstr!("new")))],
            edge: Vec::new(),
            nodejs: Vec::new(),
        };
        assert_eq!(
            define_env_diff_report(&merged.define_env, &new_define_env),
            "client: { +VISIBLE }"
        );
        let preview = DraftModeOptions {
            preview_mode_id: rcstr!("new-preview"),
            preview_mode_encryption_key: rcstr!("new-preview-key"),
            preview_mode_signing_key: rcstr!("new-preview-signing"),
        };
        let debug_paths = DebugBuildPaths {
            app: vec![rcstr!("/page")],
            pages: Vec::new(),
        };
        container
            .update(PartialProjectOptions {
                next_config: Some(rcstr!("{\"distDir\":\"custom\"}")),
                env: Some(vec![(rcstr!("VISIBLE"), rcstr!("new"))]),
                define_env: Some(new_define_env.clone()),
                dev: Some(true),
                encryption_key: Some(rcstr!("new-key")),
                build_id: Some(rcstr!("final")),
                preview_props: Some(preview.clone()),
                browserslist_query: Some(rcstr!("Chrome 100")),
                no_mangling: Some(false),
                write_routes_hashes_manifest: Some(true),
                debug_build_paths: Some(debug_paths.clone()),
            })
            .await?;
        let new = held.options_state.get_untracked()?;
        let new = new.0.as_ref().unwrap();
        assert_eq!(new.next_config, "{\"distDir\":\"custom\"}");
        assert_eq!(new.env, [(rcstr!("VISIBLE"), rcstr!("new"))]);
        assert_eq!(new.define_env, new_define_env);
        assert!(new.dev);
        assert_eq!(new.encryption_key, "new-key");
        assert_eq!(new.build_id, "final");
        assert_eq!(new.preview_props, preview);
        assert_eq!(new.browserslist_query, "Chrome 100");
        assert!(!new.no_mangling);
        assert!(new.write_routes_hashes_manifest);
        assert_eq!(new.debug_build_paths.as_ref(), Some(&debug_paths));
        assert_eq!(new.root_path, expected_root);
        assert!(!new.watch.enable);
        assert_eq!(merged.build_id, "build-19");
        container.update(PartialProjectOptions::default()).await?;
        assert_eq!(held.options_state.get_untracked()?.0.as_ref(), Some(new));
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn rooted_owner_and_actual_payloads_survive_snapshot_and_backend_restart() {
    let scratch = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    let initial = options(scratch.path());
    let expected_root = initial.root_path.clone();
    let tt = persistent_tt(cache.path());
    let handle = tt
        .run_once(async move {
            let operation = ProjectContainer::new_operation(rcstr!("persistent"), false);
            ProjectContainer::initialize(operation, initial).await?;
            let container = operation.resolve().strongly_consistent().await?;
            container
                .update(PartialProjectOptions {
                    build_id: Some(rcstr!("persisted")),
                    ..Default::default()
                })
                .await?;
            anyhow::Ok(operation.read_strongly_consistent().await?.options_state)
        })
        .await
        .unwrap();
    let outcome = tt.backend().snapshot_and_evict_for_testing(&tt);
    assert!(outcome.had_new_data);
    tt.backend().gc_for_testing(&tt);
    tt.run_once(async move {
        // Production new_operation is a root. Its escaped cell identity is still usable.
        assert_eq!(
            handle.get_untracked()?.0.as_ref().unwrap().build_id,
            "persisted"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
    let reopened = persistent_tt(cache.path());
    tokio::time::timeout(
        Duration::from_secs(30),
        reopened.run_once(async move {
            // Reacquire identity in the reopened instance; never reuse the old live TaskId.
            let operation = ProjectContainer::new_operation(rcstr!("persistent"), false);
            let container = operation.resolve().strongly_consistent().await?;
            let held = operation.read_strongly_consistent().await?;
            assert_eq!(
                held.options_state
                    .get_untracked()?
                    .0
                    .as_ref()
                    .unwrap()
                    .build_id,
                "persisted"
            );
            assert!(held.file_systems_state.get_untracked()?.0.is_some());
            assert!(held.additional_roots_state.get_untracked()?.0.is_empty());
            assert_eq!(
                *project_root_path_operation(container)
                    .read_strongly_consistent()
                    .await?,
                expected_root
            );
            assert_eq!(
                disk_file_system_map_operation(container)
                    .read_strongly_consistent()
                    .await?
                    .len(),
                1
            );
            container
                .update(PartialProjectOptions {
                    build_id: Some(rcstr!("after-restart")),
                    ..Default::default()
                })
                .await?;
            assert_eq!(
                held.options_state
                    .get_untracked()?
                    .0
                    .as_ref()
                    .unwrap()
                    .build_id,
                "after-restart"
            );
            anyhow::Ok(())
        }),
    )
    .await
    .unwrap()
    .unwrap();
    reopened.stop_and_wait().await;
}
