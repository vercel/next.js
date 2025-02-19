use std::{fs, path::PathBuf};

use criterion::{Bencher, BenchmarkId, Criterion};
use regex::Regex;
use turbo_rcstr::RcStr;
use turbo_tasks::{apply_effects, ReadConsistency, ResolvedVc, TurboTasks, Value, Vc};
use turbo_tasks_fs::{DiskFileSystem, FileSystem, NullFileSystem};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{
    emit_with_completion_operation,
    module_options::{EcmascriptOptionsContext, ModuleOptionsContext},
    register, ModuleAssetContext,
};
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    rebase::RebasedAsset,
    reference_type::ReferenceType,
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

// TODO this should move to the `node-file-trace` crate
pub fn benchmark(c: &mut Criterion) {
    register();

    let bench_filter = Regex::new(r"(empty|simple|dynamic-in-package|react|whatwg-url|axios|azure-cosmos|cowsay|env-var|fast-glob)\.js$").unwrap();

    let tests_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests");
    let tests_dir = tests_root.join("node-file-trace/integration");

    let mut group = c.benchmark_group("node-file-trace");
    group.sample_size(10);

    let results = fs::read_dir(tests_dir).unwrap();
    for result in results {
        let entry = result.unwrap();
        if entry.file_type().unwrap().is_file() {
            let name = entry.file_name().into_string().unwrap();
            if !bench_filter.is_match(&name) {
                continue;
            }

            let input = format!("node-file-trace/integration/{name}");
            let tests_root = tests_root.to_string_lossy().to_string();

            let bench_input = BenchInput { tests_root, input };

            group.bench_with_input(
                BenchmarkId::new("emit", &bench_input.input),
                &bench_input,
                bench_emit,
            );
        }
    }

    group.finish();
}

struct BenchInput {
    tests_root: String,
    input: String,
}

fn bench_emit(b: &mut Bencher, bench_input: &BenchInput) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();

    b.to_async(rt).iter(move || {
        let tt = TurboTasks::new(MemoryBackend::default());
        let tests_root: RcStr = bench_input.tests_root.clone().into();
        let input: RcStr = bench_input.input.clone().into();
        async move {
            let task = tt.spawn_once_task(async move {
                let input_fs = DiskFileSystem::new("tests".into(), tests_root.clone(), vec![]);
                let input = input_fs.root().join(input.clone());

                let input_dir = input.parent().parent();
                let output_fs: Vc<NullFileSystem> = NullFileSystem.into();
                let output_dir = output_fs.root().to_resolved().await?;

                let source = FileSource::new(input);
                let compile_time_info = CompileTimeInfo::builder(
                    Environment::new(Value::new(ExecutionEnvironment::NodeJsLambda(
                        NodeJsEnvironment::default().resolved_cell(),
                    )))
                    .to_resolved()
                    .await?,
                )
                .cell()
                .await?;
                let module_asset_context = ModuleAssetContext::new(
                    Default::default(),
                    compile_time_info,
                    ModuleOptionsContext {
                        ecmascript: EcmascriptOptionsContext {
                            enable_types: true,
                            ..Default::default()
                        },
                        ..Default::default()
                    }
                    .cell(),
                    ResolveOptionsContext {
                        emulate_environment: Some(
                            compile_time_info.environment().to_resolved().await?,
                        ),
                        ..Default::default()
                    }
                    .cell(),
                    Vc::cell("node_file_trace".into()),
                );
                let module = module_asset_context
                    .process(Vc::upcast(source), Value::new(ReferenceType::Undefined))
                    .module();
                let rebased = RebasedAsset::new(Vc::upcast(module), input_dir, *output_dir)
                    .to_resolved()
                    .await?;

                let emit_op =
                    emit_with_completion_operation(ResolvedVc::upcast(rebased), output_dir);
                emit_op.read_strongly_consistent().await?;
                apply_effects(emit_op).await?;

                Ok::<Vc<()>, _>(Default::default())
            });
            tt.wait_task_completion(task, ReadConsistency::Strong)
                .await
                .unwrap();
        }
    })
}
