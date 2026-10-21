use std::{
    path::PathBuf,
    process::ExitStatus,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use anyhow::{Result, bail};
use bytes::Bytes;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, ReadRef, ResolvedVc, Vc};
use turbo_tasks_fs::{FileSystemPath, VirtualFileSystem};
use turbo_tasks_testing::{Registration, register, run_once_without_cache_check};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    output::{OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsWithReferenced},
};

use crate::{
    evaluate::{
        CodeVersion, EvaluateOperation, EvaluatePool, EvaluationCodeVersion,
        EvaluationInvalidationState, InvalidationKey, InvalidationVersion, ObservedInvalidation,
        Operation, PoolKey, completion_revision, evaluation_invalidation_state,
        evaluation_invalidations, get_or_create_pool,
    },
    pool_stats::PoolStatsSnapshot,
};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
struct TestOutputAsset {
    path: FileSystemPath,
    content: ResolvedVc<AssetContent>,
    reference: ResolvedVc<Box<dyn OutputAsset>>,
}

#[turbo_tasks::value_impl]
impl Asset for TestOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        *self.content
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for TestOutputAsset {
    #[turbo_tasks::function]
    fn references(&self) -> Vc<OutputAssetsWithReferenced> {
        OutputAssetsWithReferenced::from_assets(Vc::<OutputAssets>::cell(vec![self.reference]))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for TestOutputAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }
}

struct TestPool {
    restarts: Arc<AtomicUsize>,
    prewarms: Arc<AtomicUsize>,
}

struct TestOperation;

#[async_trait::async_trait]
impl Operation for TestOperation {
    async fn recv(&mut self) -> Result<Bytes> {
        bail!("unused")
    }
    async fn send(&mut self, _data: Bytes) -> Result<()> {
        Ok(())
    }
    async fn wait_or_kill(&mut self) -> Result<ExitStatus> {
        bail!("unused")
    }
    fn disallow_reuse(&mut self) {}
}

#[async_trait::async_trait]
impl EvaluateOperation for TestPool {
    async fn operation(&self) -> Result<Box<dyn Operation>> {
        Ok(Box::new(TestOperation))
    }
    fn restart(&self) {
        self.restarts.fetch_add(1, Ordering::SeqCst);
    }
    fn stats(&self) -> PoolStatsSnapshot {
        panic!("unused")
    }
    fn pre_warm(&self) {
        self.prewarms.fetch_add(1, Ordering::SeqCst);
    }
}

#[tokio::test]
async fn invalidation_retires_synchronously_once_per_version_and_pool() {
    run_once_without_cache_check(&REGISTRATION, async {
        exercise_invalidation()
            .read_strongly_consistent()
            .await
            .unwrap();
    })
    .await;
}

#[turbo_tasks::function(operation, root)]
async fn exercise_invalidation() -> Result<Vc<()>> {
    let restarts = Arc::new(AtomicUsize::new(0));
    let make_pool = || {
        EvaluatePool::new(Box::new(TestPool {
            restarts: restarts.clone(),
            prewarms: Default::default(),
        }))
    };
    let pool = make_pool();
    let other_pool = make_pool();
    let fs: Vc<Box<dyn turbo_tasks_fs::FileSystem>> = Vc::upcast(VirtualFileSystem::new());
    let ident = AssetIdent::from_path(FileSystemPath {
        fs: fs.to_resolved().await.unwrap(),
        path: rcstr!("entry.js"),
    })
    .into_vc()
    .to_resolved()
    .await
    .unwrap();
    let code = evaluation_invalidation_state(InvalidationKey::Code(ident))
        .await
        .unwrap();
    let immutable = Completion::immutable().to_resolved().await.unwrap();
    let additional = evaluation_invalidation_state(InvalidationKey::Additional(immutable))
        .await
        .unwrap();
    let another_handle = evaluation_invalidation_state(InvalidationKey::Additional(
        Completion::new().to_resolved().await.unwrap(),
    ))
    .await
    .unwrap();
    assert!(
        !ReadRef::ptr_eq(&code, &additional),
        "different keys must allocate distinct States"
    );
    assert!(!ReadRef::ptr_eq(&additional, &another_handle));
    assert!(ReadRef::ptr_eq(
        &additional,
        &evaluation_invalidation_state(InvalidationKey::Additional(immutable))
            .await
            .unwrap()
    ));
    let code_v1 = vec![(rcstr!("entry.js"), Some(rcstr!("v1")))];
    let code_v2 = vec![(rcstr!("entry.js"), Some(rcstr!("v2")))];
    let v1 = ObservedInvalidation {
        value: InvalidationVersion::Completion(Completion::new().await?),
        revision: 1,
    };
    let v2 = ObservedInvalidation {
        value: InvalidationVersion::Completion(Completion::new().await?),
        revision: 2,
    };
    fn acquire_version<'a>(
        pool: &'a EvaluatePool,
        code: ReadRef<EvaluationInvalidationState>,
        extra: ReadRef<EvaluationInvalidationState>,
        code_version: Vec<(RcStr, Option<RcStr>)>,
        additional_version: ObservedInvalidation,
    ) -> impl Future<Output = Result<Box<dyn Operation>>> + Send + 'a {
        let version = Arc::new(EvaluationCodeVersion {
            root: PathBuf::from("output"),
            revision: if code_version == vec![(rcstr!("entry.js"), Some(rcstr!("v1")))] {
                1
            } else {
                2
            },
            version: CodeVersion {
                files: code_version,
                modules: Vec::new(),
            },
        });
        let invalidations = evaluation_invalidations(code, &version, extra, additional_version);
        pool.operation_with_code(false, Some(version), Some(invalidations))
    }
    let acquire =
        |pool, extra: &ReadRef<EvaluationInvalidationState>, code_version, additional_version| {
            acquire_version(
                pool,
                code.clone(),
                extra.clone(),
                code_version,
                additional_version,
            )
        };
    drop(acquire(&pool, &additional, code_v1.clone(), v1.clone()));
    drop(acquire(
        &other_pool,
        &additional,
        code_v1.clone(),
        v1.clone(),
    ));
    assert_eq!(
        restarts.load(Ordering::SeqCst),
        0,
        "first observation is not a restart"
    );
    drop(acquire(&pool, &another_handle, code_v1.clone(), v1.clone()));
    drop(acquire(&pool, &additional, code_v1.clone(), v1.clone()));
    assert_eq!(
        restarts.load(Ordering::SeqCst),
        0,
        "new handles and unchanged versions preserve reuse"
    );

    // The restart must happen before polling/awaiting this future. A second evaluation can
    // observe the updated State immediately, but cannot slip through before pool retirement.
    let delayed_extra = acquire(&pool, &additional, code_v1.clone(), v1.clone());
    let first = acquire(&pool, &additional, code_v1.clone(), v2.clone());
    assert_eq!(restarts.load(Ordering::SeqCst), 1);
    let second = acquire(&pool, &additional, code_v1.clone(), v2.clone());
    first.await.unwrap();
    second.await.unwrap();
    assert!(delayed_extra.await.is_err());
    assert!(
        acquire(&pool, &additional, code_v1.clone(), v1.clone())
            .await
            .is_err()
    );
    assert_eq!(
        additional
            .versions
            .get_untracked()
            .get(&pool.id)
            .unwrap()
            .revision,
        2
    );
    assert_eq!(restarts.load(Ordering::SeqCst), 1);
    drop(acquire(
        &other_pool,
        &additional,
        code_v1.clone(),
        v2.clone(),
    ));
    assert_eq!(
        restarts.load(Ordering::SeqCst),
        2,
        "a second compatible configuration also needs retirement"
    );
    drop(acquire(&pool, &additional, code_v2.clone(), v2.clone()));
    assert!(
        acquire(&pool, &additional, code_v1, v2.clone())
            .await
            .is_err()
    );
    acquire(&pool, &additional, code_v2, v2).await?;
    assert_eq!(
        restarts.load(Ordering::SeqCst),
        3,
        "changed emitted code must retire workers"
    );
    Ok(Vc::cell(()))
}

fn code_version(
    root: &str,
    files: &[(&str, &str)],
    modules: &[(&str, u128)],
) -> Arc<EvaluationCodeVersion> {
    static NEXT_REVISION: AtomicUsize = AtomicUsize::new(1);
    Arc::new(EvaluationCodeVersion {
        root: PathBuf::from(root),
        revision: NEXT_REVISION.fetch_add(1, Ordering::SeqCst) as u64,
        version: CodeVersion {
            files: files
                .iter()
                .map(|(path, hash)| (RcStr::from(*path), Some(RcStr::from(*hash))))
                .collect(),
            modules: modules
                .iter()
                .map(|(id, hash)| ((*id).into(), *hash))
                .collect(),
        },
    })
}

fn counting_pool() -> (EvaluatePool, Arc<AtomicUsize>) {
    let restarts = Arc::new(AtomicUsize::new(0));
    let pool = EvaluatePool::new(Box::new(TestPool {
        restarts: restarts.clone(),
        prewarms: Default::default(),
    }));
    (pool, restarts)
}

#[test]
fn file_versions_are_shared_across_entries_and_namespaced_by_output_root() {
    let (pool, restarts) = counting_pool();
    let acquire = |root, files: &[(&str, &str)]| {
        drop(pool.operation_with_code(false, Some(code_version(root, files, &[])), None));
    };
    acquire("root-a", &[("a.js", "a"), ("shared.js", "v1")]);
    acquire("root-a", &[("b.js", "b"), ("shared.js", "v1")]);
    acquire("root-b", &[("shared.js", "v2")]);
    assert_eq!(restarts.load(Ordering::SeqCst), 0);
    acquire("root-a", &[("new-entry.js", "c"), ("shared.js", "v2")]);
    assert_eq!(restarts.load(Ordering::SeqCst), 1);

    // Retirement resets residency, not revision high-water marks, for omitted files too.
    acquire("root-a", &[("a.js", "changed but no longer cached")]);
    assert_eq!(restarts.load(Ordering::SeqCst), 1);
    drop(pool.operation(true));
    acquire("root-a", &[("shared.js", "v3")]);
    assert_eq!(restarts.load(Ordering::SeqCst), 2);
}

#[test]
fn module_versions_follow_shared_modules_across_chunk_regrouping() {
    let (pool, restarts) = counting_pool();
    let acquire = |root, chunk, modules: &[(&str, u128)]| {
        drop(pool.operation_with_code(
            false,
            Some(code_version(root, &[(chunk, "chunk bytes")], modules)),
            None,
        ));
    };
    acquire("root-a", "chunk-a.js", &[("shared", 1), ("unused", 1)]);
    acquire("root-a", "chunk-b.js", &[("shared", 1)]);
    acquire("root-b", "chunk-a.js", &[("shared", 2)]);
    assert_eq!(restarts.load(Ordering::SeqCst), 0);
    acquire("root-a", "chunk-c.js", &[("shared", 2)]);
    assert_eq!(restarts.load(Ordering::SeqCst), 1);
    acquire("root-a", "chunk-d.js", &[("shared", 2), ("unused", 2)]);
    assert_eq!(restarts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn delayed_acquisition_rechecks_code_after_another_entry_retires_workers() {
    let (pool, restarts) = counting_pool();
    let v1 = code_version("root", &[], &[("shared", 1)]);
    let v2 = code_version("root", &[], &[("shared", 2)]);
    let delayed = pool.operation_with_code(false, Some(v1), None);
    drop(pool.operation_with_code(false, Some(v2.clone()), None));
    assert_eq!(restarts.load(Ordering::SeqCst), 1);
    assert!(
        delayed.await.is_err(),
        "the obsolete v1 evaluation must bail instead of rolling workers back from v2"
    );
    assert_eq!(restarts.load(Ordering::SeqCst), 1);
    drop(pool.operation_with_code(false, Some(v2), None));
    assert_eq!(restarts.load(Ordering::SeqCst), 1);
}

#[test]
fn obsolete_evaluation_is_not_retried_even_on_the_first_attempt() {
    use futures_retry::{ErrorHandler, RetryPolicy};

    use crate::evaluate::{ObsoleteEvaluation, PoolErrorHandler};

    assert!(matches!(
        PoolErrorHandler.handle(
            1,
            anyhow::Error::new(ObsoleteEvaluation).context("acquiring worker")
        ),
        RetryPolicy::ForwardError(_)
    ));
}

#[tokio::test]
async fn pending_acquisition_bails_when_a_newer_completion_wins() {
    use std::sync::atomic::AtomicBool;

    use tokio::sync::Notify;

    struct WaitingPool {
        inner: TestPool,
        first: AtomicBool,
        started: Arc<Notify>,
        resume: Arc<Notify>,
    }
    #[async_trait::async_trait]
    impl EvaluateOperation for WaitingPool {
        async fn operation(&self) -> Result<Box<dyn Operation>> {
            if self.first.swap(false, Ordering::SeqCst) {
                self.started.notify_one();
                self.resume.notified().await;
            }
            self.inner.operation().await
        }
        fn restart(&self) {
            self.inner.restart()
        }
        fn stats(&self) -> PoolStatsSnapshot {
            self.inner.stats()
        }
        fn pre_warm(&self) {
            self.inner.pre_warm()
        }
    }
    let restarts = Arc::new(AtomicUsize::new(0));
    let started = Arc::new(Notify::new());
    let resume = Arc::new(Notify::new());
    let pool = EvaluatePool::new(Box::new(WaitingPool {
        inner: TestPool {
            restarts: restarts.clone(),
            prewarms: Default::default(),
        },
        first: AtomicBool::new(true),
        started: started.clone(),
        resume: resume.clone(),
    }));
    let old = code_version("root", &[("shared.js", "v1")], &[("shared", 1)]);
    let new = code_version("root", &[("shared.js", "v2")], &[("shared", 2)]);
    let delayed = pool.operation_with_code(false, Some(old), None);
    let winner = async {
        started.notified().await;
        pool.operation_with_code(false, Some(new.clone()), None)
            .await
            .unwrap();
        resume.notify_one();
    };
    let (loser, ()) = tokio::join!(delayed, winner);
    assert!(loser.is_err());
    pool.operation_with_code(false, Some(new), None)
        .await
        .unwrap();
    assert_eq!(restarts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn obsolete_versions_cannot_erase_history_even_after_unrelated_retirement() {
    let (pool, restarts) = counting_pool();
    let old = code_version("root", &[("shared.js", "old")], &[("shared", 1)]);
    let new = code_version("root", &[("shared.js", "new")], &[("shared", 2)]);
    pool.operation_with_code(false, Some(new.clone()), None)
        .await
        .unwrap();
    assert!(
        pool.operation_with_code(false, Some(old.clone()), None)
            .await
            .is_err()
    );
    assert_eq!(restarts.load(Ordering::SeqCst), 0);
    // Identical and disjoint observations are harmless even when their revisions are older.
    let mut same = code_version("root", &[("shared.js", "new")], &[("shared", 2)]);
    Arc::get_mut(&mut same).unwrap().revision = old.revision;
    pool.operation_with_code(false, Some(same), None)
        .await
        .unwrap();
    let disjoint = code_version("root", &[("other.js", "old")], &[("other", 1)]);
    pool.operation_with_code(false, Some(disjoint), None)
        .await
        .unwrap();
    let unrelated_change = code_version("root", &[("other.js", "new")], &[("other", 2)]);
    pool.operation_with_code(false, Some(unrelated_change), None)
        .await
        .unwrap();
    assert_eq!(restarts.load(Ordering::SeqCst), 1);
    // shared.js/shared were omitted from the retiring request, but their version cannot regress.
    assert!(
        pool.operation_with_code(false, Some(old.clone()), None)
            .await
            .is_err()
    );
    drop(pool.operation(true));
    assert!(
        pool.operation_with_code(false, Some(old), None)
            .await
            .is_err()
    );
    pool.operation_with_code(false, Some(new), None)
        .await
        .unwrap();
    assert_eq!(restarts.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn obsolete_module_conflict_does_not_publish_new_file_history() {
    let (pool, restarts) = counting_pool();
    let old = code_version("root", &[("previously-unseen.js", "old")], &[("shared", 1)]);
    let new = code_version("root", &[], &[("shared", 2)]);
    pool.operation_with_code(false, Some(new), None)
        .await
        .unwrap();
    assert!(
        pool.operation_with_code(false, Some(old), None)
            .await
            .is_err()
    );
    assert!(pool.code.lock().files.is_empty());
    assert_eq!(restarts.load(Ordering::SeqCst), 0);
}

#[turbo_tasks::value]
struct ChangingCompletion {
    tick: turbo_tasks::State<u32>,
}

#[turbo_tasks::function(operation, root)]
fn changing_completion_input(key: u32) -> Vc<ChangingCompletion> {
    let _ = key;
    ChangingCompletion {
        tick: turbo_tasks::State::new(0),
    }
    .cell()
}

#[turbo_tasks::function]
async fn changing_completion(input: ResolvedVc<ChangingCompletion>) -> Result<Vc<Completion>> {
    let _ = *input.await?.tick.get();
    Ok(Completion::new())
}

#[turbo_tasks::function(operation, root)]
async fn revision_snapshot(input: ResolvedVc<ChangingCompletion>) -> Result<Vc<u64>> {
    Ok(Vc::cell(
        completion_revision(changing_completion(*input)).await?.n,
    ))
}

static CACHED_COMPLETION_EXECUTIONS: AtomicUsize = AtomicUsize::new(0);

#[turbo_tasks::function(operation, root)]
async fn cached_completion_consumer(input: ResolvedVc<ChangingCompletion>) -> Result<Vc<u64>> {
    completion_revision(changing_completion(*input)).await?;
    // Unlike the revision itself, this detects semantic work being repeated on restore.
    Ok(Vc::cell(
        CACHED_COMPLETION_EXECUTIONS.fetch_add(1, Ordering::SeqCst) as u64,
    ))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn completion_revision_preserves_cached_consumers_on_restore() {
    turbo_tasks_testing::run(&REGISTRATION, || async {
        let input = changing_completion_input(2)
            .resolve()
            .strongly_consistent()
            .await?;
        Ok(*cached_completion_consumer(input)
            .read_strongly_consistent()
            .await?)
    })
    .await
    .unwrap();
}

#[turbo_tasks::function(operation, root)]
fn revision_observation(
    input: ResolvedVc<ChangingCompletion>,
) -> Vc<crate::evaluate::CompletionRevision> {
    completion_revision(changing_completion(*input))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn restored_completion_observations_get_fresh_ordinals_before_changes() {
    // Observe the helper directly, as evaluation does, rather than persisting a copy of its
    // session-local ordinal in an unrelated task's semantic result.
    let mut previous = 0;
    for initial in [true, false, false] {
        let instance = REGISTRATION.create_turbo_tasks(
            "restored_completion_observations_get_fresh_ordinals_before_changes",
            initial,
        );
        let latest = turbo_tasks::run_once(instance.tt.clone(), async move {
            let input_op = changing_completion_input(3);
            let input_vc = input_op.resolve().strongly_consistent().await?;
            let input = input_op.read_strongly_consistent().await?;
            let revision = revision_observation(input_vc);
            let restored = revision.read_strongly_consistent().await?;
            assert!(
                restored.n > previous,
                "an unserialized helper is recomputed on demand"
            );
            assert_eq!(restored.n, revision.read_strongly_consistent().await?.n);
            let tick = *input.tick.get_untracked();
            input.tick.set(tick + 1);
            let changed = revision.read_strongly_consistent().await?;
            assert!(changed.n > restored.n);
            let other = changing_completion_input(4)
                .resolve()
                .strongly_consistent()
                .await?;
            let other = revision_observation(other)
                .read_strongly_consistent()
                .await?;
            assert!(other.n > changed.n, "restored lineages remain comparable");
            assert!(restored.n < changed.n, "old observations stay immutable");
            Ok(other.n)
        })
        .await
        .unwrap();
        instance.tt.stop_and_wait().await;
        previous = latest;
    }
}

#[test]
fn completion_revision_cache_survives_process_restart() {
    let cache = std::env::temp_dir().join(format!(
        "turbopack-node-completion-process-cache-{}",
        std::process::id()
    ));
    for phase in ["initial", "restored"] {
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "evaluate::tests::completion_revision_persistence_subprocess",
                "--nocapture",
            ])
            .env("TURBOPACK_NODE_TEST_CACHE_ROOT", &cache)
            .env("TURBOPACK_NODE_COMPLETION_CACHE_PHASE", phase)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{phase} subprocess failed:\n{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
    std::fs::remove_dir_all(cache).unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn completion_revision_persistence_subprocess() {
    let Ok(phase) = std::env::var("TURBOPACK_NODE_COMPLETION_CACHE_PHASE") else {
        return;
    };
    let initial = phase == "initial";
    let instance = REGISTRATION.create_turbo_tasks("completion_process_restart", initial);
    turbo_tasks::run_once(instance.tt.clone(), async move {
        let consumer_input = changing_completion_input(2)
            .resolve()
            .strongly_consistent()
            .await?;
        cached_completion_consumer(consumer_input)
            .read_strongly_consistent()
            .await?;
        assert_eq!(
            CACHED_COMPLETION_EXECUTIONS.load(Ordering::SeqCst),
            usize::from(initial),
            "the restored semantic consumer must not execute, even with a fresh process clock"
        );
        if initial {
            // Make the persisted helper ordinal larger than the allocator in a new process.
            for key in 100..164 {
                let input = changing_completion_input(key)
                    .resolve()
                    .strongly_consistent()
                    .await?;
                revision_observation(input)
                    .read_strongly_consistent()
                    .await?;
            }
        }
        let input_op = changing_completion_input(3);
        let input_vc = input_op.resolve().strongly_consistent().await?;
        let input = input_op.read_strongly_consistent().await?;
        let revision = revision_observation(input_vc);
        let old = revision.read_strongly_consistent().await?;
        if initial {
            assert!(old.n > 64);
        } else {
            assert!(
                old.n < 64,
                "old session ordinals must not be restored into a fresh clock"
            );
        }
        let tick = *input.tick.get_untracked();
        input.tick.set(tick + 1);
        let new = revision.read_strongly_consistent().await?;
        assert!(new.n > old.n);
        assert!(old.n < new.n, "old snapshots stay immutable after restore");
        Ok(())
    })
    .await
    .unwrap();
    instance.tt.stop_and_wait().await;
}

#[tokio::test]
async fn completion_revisions_advance_on_invalidation_not_on_reads_and_preserve_snapshots() {
    run_once_without_cache_check(&REGISTRATION, async {
        let input_op = changing_completion_input(0);
        let input_vc = input_op.resolve().strongly_consistent().await.unwrap();
        let input = input_op.read_strongly_consistent().await.unwrap();
        let snapshot = revision_snapshot(input_vc);
        let old = snapshot.read_strongly_consistent().await.unwrap();
        assert_eq!(*old, *snapshot.read_strongly_consistent().await.unwrap());
        input.tick.set(1);
        let new = snapshot.read_strongly_consistent().await.unwrap();
        assert!(*new > *old);
        assert_eq!(*new, *snapshot.read_strongly_consistent().await.unwrap());
        input.tick.set(0);
        let reverted = snapshot.read_strongly_consistent().await.unwrap();
        assert!(
            *reverted > *new,
            "reverted inputs still produce a newer Completion"
        );
        assert!(
            *old < *new && *new < *reverted,
            "old snapshots must remain immutable"
        );
        let other = changing_completion_input(1)
            .resolve()
            .strongly_consistent()
            .await
            .unwrap();
        let other_revision = revision_snapshot(other)
            .read_strongly_consistent()
            .await
            .unwrap();
        assert!(
            *other_revision > *reverted,
            "different completion lineages are comparable"
        );
        assert_eq!(
            *reverted,
            *snapshot.read_strongly_consistent().await.unwrap()
        );
    })
    .await;
}

#[turbo_tasks::value]
struct CodeSnapshot {
    code: CodeVersion,
    revision: u64,
}

#[turbo_tasks::function]
async fn changing_asset_content(input: ResolvedVc<ChangingCompletion>) -> Result<Vc<AssetContent>> {
    use turbo_tasks_fs::{File, FileContent};
    let tick = *input.await?.tick.get();
    Ok(AssetContent::file(
        FileContent::Content(File::from(format!("module.exports = {tick}"))).cell(),
    ))
}

#[turbo_tasks::function(operation, root)]
async fn code_snapshot(input: ResolvedVc<ChangingCompletion>) -> Result<Vc<CodeSnapshot>> {
    use turbo_tasks_fs::{File, FileContent};
    use turbopack_core::virtual_output::VirtualOutputAsset;

    use crate::evaluate::{evaluation_code_completion, evaluation_code_version};

    let fs: Vc<Box<dyn turbo_tasks_fs::FileSystem>> = Vc::upcast(VirtualFileSystem::new());
    let root = FileSystemPath {
        fs: fs.to_resolved().await?,
        path: rcstr!("output"),
    };
    let reference = ResolvedVc::upcast(
        VirtualOutputAsset::new(
            root.join("chunk.js")?,
            AssetContent::file(FileContent::Content(File::from("unchanged chunk")).cell()),
        )
        .to_resolved()
        .await?,
    );
    let entry = ResolvedVc::upcast(
        TestOutputAsset {
            path: root.join("entry.js")?,
            content: changing_asset_content(*input).to_resolved().await?,
            reference,
        }
        .resolved_cell(),
    );
    let version = evaluation_code_version(*entry, root).to_resolved().await?;
    let revision = completion_revision(evaluation_code_completion(*version, *version))
        .await?
        .n;
    Ok(CodeSnapshot {
        code: version.owned().await?,
        revision,
    }
    .cell())
}

#[tokio::test]
async fn code_revisions_advance_even_when_content_reverts() {
    run_once_without_cache_check(&REGISTRATION, async {
        let input_op = changing_completion_input(0);
        let input_vc = input_op.resolve().strongly_consistent().await.unwrap();
        let input = input_op.read_strongly_consistent().await.unwrap();
        let snapshot = code_snapshot(input_vc);
        let old = snapshot.read_strongly_consistent().await.unwrap();
        assert_eq!(
            old.revision,
            snapshot.read_strongly_consistent().await.unwrap().revision
        );
        input.tick.set(1);
        let new = snapshot.read_strongly_consistent().await.unwrap();
        assert_ne!(old.code, new.code);
        assert!(new.revision > old.revision);
        input.tick.set(0);
        let reverted = snapshot.read_strongly_consistent().await.unwrap();
        assert_eq!(old.code, reverted.code);
        assert!(reverted.revision > new.revision);
        assert_eq!(
            reverted.revision,
            snapshot.read_strongly_consistent().await.unwrap().revision
        );
    })
    .await;
}

#[tokio::test]
async fn concurrent_registry_lookups_create_and_prewarm_once() {
    run_once_without_cache_check(&REGISTRATION, async {
        let prewarms = Arc::new(AtomicUsize::new(0));
        let creations = AtomicUsize::new(0);
        let key = || PoolKey {
            backend: rcstr!("registry-test-backend"),
            cwd: PathBuf::from("registry-test-cwd"),
            env: Vec::new(),
            concurrency: 1,
            debug: false,
        };
        // Simulate evaluations with different entry paths: only the first creator's generic
        // bootstrap is needed. Entry paths and invalidation handles are deliberately absent
        // from PoolKey.
        let create = |_entry: &str| {
            creations.fetch_add(1, Ordering::SeqCst);
            let prewarms = prewarms.clone();
            Box::pin(async move {
                tokio::task::yield_now().await;
                Ok(EvaluatePool::new(Box::new(TestPool {
                    restarts: Default::default(),
                    prewarms,
                })))
            }) as crate::backend::CreatePoolFuture
        };
        let (a, b) = tokio::join!(
            get_or_create_pool(key(), || create("entry-a.js")),
            get_or_create_pool(key(), || create("entry-b.js")),
        );
        let a = a.unwrap();
        assert!(Arc::ptr_eq(&a, &b.unwrap()));
        assert_eq!(creations.load(Ordering::SeqCst), 1);
        assert_eq!(prewarms.load(Ordering::SeqCst), 1);
        for incompatible in [
            PoolKey {
                backend: rcstr!("another-backend"),
                ..key()
            },
            PoolKey {
                cwd: PathBuf::from("another-cwd"),
                ..key()
            },
            PoolKey {
                env: vec![(rcstr!("TEST_ENV"), rcstr!("different"))],
                ..key()
            },
            PoolKey {
                concurrency: 2,
                ..key()
            },
            PoolKey {
                debug: true,
                ..key()
            },
        ] {
            let other = get_or_create_pool(incompatible, || create("entry-a.js"))
                .await
                .unwrap();
            assert!(!Arc::ptr_eq(&a, &other));
        }
    })
    .await;
}

#[tokio::test]
async fn registry_isolates_task_engine_lifetimes() {
    async fn lookup() -> Arc<EvaluatePool> {
        get_or_create_pool(
            PoolKey {
                backend: rcstr!("engine-isolation-test"),
                cwd: PathBuf::from("cwd"),
                env: Vec::new(),
                concurrency: 1,
                debug: false,
            },
            || {
                Box::pin(async {
                    Ok(EvaluatePool::new(Box::new(TestPool {
                        restarts: Default::default(),
                        prewarms: Default::default(),
                    })))
                })
            },
        )
        .await
        .unwrap()
    }
    let a = run_once_without_cache_check(&REGISTRATION, lookup()).await;
    let b = run_once_without_cache_check(&REGISTRATION, lookup()).await;
    assert!(
        !Arc::ptr_eq(&a, &b),
        "a replacement engine must not inherit old module caches"
    );
}

#[tokio::test]
async fn code_fingerprints_include_referenced_chunks_not_absolute_paths() {
    run_once_without_cache_check(&REGISTRATION, async {
        exercise_code_fingerprints()
            .read_strongly_consistent()
            .await
            .unwrap();
    })
    .await;
}

#[turbo_tasks::function(operation, root)]
async fn exercise_code_fingerprints() -> Result<Vc<()>> {
    use turbo_tasks_fs::{File, FileContent};
    use turbopack_core::virtual_output::VirtualOutputAsset;

    use crate::evaluate::evaluation_code_version;

    let fs: Vc<Box<dyn turbo_tasks_fs::FileSystem>> = Vc::upcast(VirtualFileSystem::new());
    let root = FileSystemPath {
        fs: fs.to_resolved().await?,
        path: rcstr!("output"),
    };
    async fn make_entry(
        root: FileSystemPath,
        chunk: &str,
    ) -> Result<turbo_tasks::ResolvedVc<Box<dyn OutputAsset>>> {
        let content =
            |text: &str| AssetContent::file(FileContent::Content(File::from(text)).cell());
        let reference = Vc::upcast::<Box<dyn OutputAsset>>(VirtualOutputAsset::new(
            root.join("chunk.js")?,
            content(chunk),
        ))
        .to_resolved()
        .await?;
        Ok(turbo_tasks::ResolvedVc::upcast(
            TestOutputAsset {
                path: root.join("entry.js")?,
                content: content("require('./chunk.js')").to_resolved().await?,
                reference,
            }
            .resolved_cell(),
        ))
    }
    let a = evaluation_code_version(*make_entry(root.clone(), "v1").await?, root.clone()).await?;
    let b = evaluation_code_version(*make_entry(root.clone(), "v2").await?, root.clone()).await?;
    assert_ne!(
        *a, *b,
        "unchanged entry bytes must not hide changed referenced code"
    );
    let relocated_root = root.join("relocated")?;
    let relocated = evaluation_code_version(
        *make_entry(relocated_root.clone(), "v1").await?,
        relocated_root,
    )
    .await?;
    assert_eq!(
        *a, *relocated,
        "changing only the emitted root must not request a restart"
    );
    Ok(Vc::cell(()))
}
