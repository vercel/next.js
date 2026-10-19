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
use turbo_rcstr::rcstr;
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
        EvaluateOperation, EvaluatePool, InvalidationKey, InvalidationVersion, Operation, PoolKey,
        evaluation_invalidation_state, evaluation_operation, get_or_create_pool,
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
    let v1 = Completion::new().await.unwrap();
    let v2 = Completion::new().await.unwrap();
    let acquire = |pool, extra, code_version, additional_version| {
        evaluation_operation(
            pool,
            &code,
            InvalidationVersion::Code(code_version),
            extra,
            InvalidationVersion::Completion(additional_version),
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
    let first = acquire(&pool, &additional, code_v1.clone(), v2.clone());
    assert_eq!(restarts.load(Ordering::SeqCst), 1);
    let second = acquire(&pool, &additional, code_v1.clone(), v2.clone());
    first.await.unwrap();
    second.await.unwrap();
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
    drop(acquire(&pool, &additional, code_v2, v2));
    assert_eq!(
        restarts.load(Ordering::SeqCst),
        3,
        "changed emitted code must retire workers"
    );
    Ok(Vc::cell(()))
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
