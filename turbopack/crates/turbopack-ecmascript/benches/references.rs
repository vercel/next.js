use std::{path::PathBuf, time::Duration};

use anyhow::Result;
use criterion::{BatchSize, Bencher, BenchmarkId, Criterion, criterion_group, criterion_main};
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, TurboTasks};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{DiskFileSystem, FileSystem};
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    ident::Layer,
};
use turbopack_ecmascript::{
    AnalyzeMode, EcmascriptInputTransforms, EcmascriptModuleAsset, EcmascriptOptions,
    TreeShakingMode, references::analyze_ecmascript_module,
};
use turbopack_test_utils::noop_asset_context::NoopAssetContext;

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

pub fn benchmark(c: &mut Criterion) {
    let root_dir = String::leak(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/benches/")
            .to_str()
            .unwrap()
            .to_string(),
    );

    let mut group = c.benchmark_group("references");
    group.warm_up_time(Duration::from_secs(1));
    group.measurement_time(Duration::from_secs(10));

    for (file, trace_only) in [
        (r#"packages-bundle.js"#, false),
        (r#"packages-bundle.js"#, true),
        (r#"app-page-turbo.runtime.prod.js"#, false),
        (r#"app-page-turbo.runtime.prod.js"#, true),
        (r#"react-dom-client.development.js"#, false),
        (r#"react-dom-client.development.js"#, true),
        (r#"jsonwebtoken.js"#, false),
        (r#"jsonwebtoken.js"#, true),
    ] {
        group.bench_with_input(
            BenchmarkId::new(file, if trace_only { "tracing" } else { "full" }),
            &BenchInput {
                root_dir,
                file,
                analyze_mode: if trace_only {
                    AnalyzeMode::Tracing
                } else {
                    AnalyzeMode::CodeGenerationAndTracing
                },
            },
            bench_full,
        );
    }
}

async fn setup(
    root_dir: &str,
    file: &str,
    analyze_mode: AnalyzeMode,
) -> Result<ResolvedVc<EcmascriptModuleAsset>> {
    let fs = DiskFileSystem::new(rcstr!("project"), root_dir.into());

    let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
        NodeJsEnvironment::default().resolved_cell(),
    ));
    let compile_time_info = CompileTimeInfo::new(environment).to_resolved().await?;
    let layer = Layer::new(rcstr!("test"));
    let module_asset_context = NoopAssetContext {
        compile_time_info,
        layer,
    }
    .resolved_cell();
    let module = EcmascriptModuleAsset::builder(
        ResolvedVc::upcast(
            FileSource::new(fs.root().await?.join(file).unwrap())
                .to_resolved()
                .await?,
        ),
        ResolvedVc::upcast(module_asset_context),
        EcmascriptInputTransforms::empty().to_resolved().await?,
        EcmascriptOptions {
            tree_shaking_mode: Some(TreeShakingMode::ReexportsOnly),
            analyze_mode,
            ..Default::default()
        }
        .resolved_cell(),
        compile_time_info,
    )
    .build()
    .to_resolved()
    .await?;
    Ok(module)
}

struct BenchInput {
    root_dir: &'static str,
    file: &'static str,
    analyze_mode: AnalyzeMode,
}

fn bench_full(b: &mut Bencher, input: &BenchInput) {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();

    b.to_async(rt).iter_batched(
        || {
            let tt = TurboTasks::new(TurboTasksBackend::new(
                BackendOptions {
                    dependency_tracking: false,
                    storage_mode: None,
                    ..Default::default()
                },
                noop_backing_storage(),
            ));
            let BenchInput {
                root_dir,
                file,
                analyze_mode,
            } = *input;
            let module = tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(tt.run_once(async move {
                        let module = setup(root_dir, file, analyze_mode).await?;
                        Ok(module)
                    }))
                    .unwrap()
            });
            (tt, module)
        },
        |(tt, module)| async move {
            tt.run_once(async move {
                analyze_ecmascript_module(*module, None).await?;
                Ok(())
            })
            .await
            .unwrap()
        },
        BatchSize::SmallInput,
    );
}

criterion_group!(references_benches, benchmark);
criterion_main!(references_benches);
