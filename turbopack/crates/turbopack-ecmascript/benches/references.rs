use std::{path::PathBuf, sync::Arc, time::Duration};

use criterion::{Bencher, BenchmarkId, Criterion};
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, TurboTasks};
use turbo_tasks_backend::{
    BackendOptions, BackingStorage, TurboTasksBackend, noop_backing_storage,
};
use turbo_tasks_fs::{DiskFileSystem, FileSystem};
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    ident::Layer,
};
use turbopack_ecmascript::{
    EcmascriptInputTransforms, EcmascriptModuleAsset, EcmascriptOptions, TreeShakingMode,
    references::analyse_ecmascript_module_internal,
};
use turbopack_test_utils::noop_asset_context::NoopAssetContext;

pub fn benchmark(c: &mut Criterion) {
    turbopack_ecmascript::register();
    turbopack_test_utils::register();

    let rt = tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap();

    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            dependency_tracking: false,
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ));

    let cases = rt
        .block_on(tt.run_once(async {
            let root_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../");
            let fs = DiskFileSystem::new(rcstr!("project"), root_dir.to_str().unwrap().into());

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

            let mut cases = vec![];
            for (file, is_tracing) in [
                (r#"packages/next/dist/compiled/babel-packages/packages-bundle.js"#, false),
                (r#"packages/next/dist/compiled/babel-packages/packages-bundle.js"#, true),
                (r#"node_modules/.pnpm/react-dom@19.2.0-canary-03fda05d-20250820_react@19.2.0-canary-03fda05d-20250820/node_modules/react-dom/cjs/react-dom-client.development.js"#, false),
                (r#"node_modules/.pnpm/react-dom@19.2.0-canary-03fda05d-20250820_react@19.2.0-canary-03fda05d-20250820/node_modules/react-dom/cjs/react-dom-client.development.js"#, true),
            ] {
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
                        is_tracing,
                        ..Default::default()
                    }
                    .resolved_cell(),
                    compile_time_info,
                )
                .build()
                .to_resolved()
                .await?;

                cases.push((file.rsplit("/").next().unwrap(), if is_tracing { "tracing" } else { "full" }, module));
            }
            anyhow::Ok(cases)
        }))
        .unwrap();

    let mut group = c.benchmark_group("references");
    group.warm_up_time(Duration::from_secs(1));
    group.measurement_time(Duration::from_secs(10));

    for (file, param, module) in cases {
        group.bench_with_input(
            BenchmarkId::new(file, param),
            &BenchInput {
                module,
                storage: tt.clone(),
            },
            bench_full,
        );
    }
}

struct BenchInput<B>
where
    B: BackingStorage,
{
    storage: Arc<TurboTasks<TurboTasksBackend<B>>>,
    module: ResolvedVc<EcmascriptModuleAsset>,
}

fn bench_full<B>(b: &mut Bencher, input: &BenchInput<B>)
where
    B: BackingStorage,
{
    let rt = tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap();

    b.to_async(rt).iter(|| {
        input
            .storage
            .run_once(analyse_ecmascript_module_internal(input.module, None))
    });
}
