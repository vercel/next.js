use std::{collections::HashMap, fs, path::PathBuf};

use criterion::{Bencher, BenchmarkId, Criterion};
use regex::Regex;
use turbo_tasks::{NothingVc, TurboTasks, Value};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc, NullFileSystem, NullFileSystemVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{
    emit, emit_with_completion, rebase::RebasedAssetVc, register, ModuleAssetContextVc,
};
use turbopack_core::{
    context::AssetContext,
    environment::{EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment},
    source_asset::SourceAssetVc,
    target::CompileTargetVc,
    transition::TransitionsByNameVc,
};

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
                BenchmarkId::new("emit_with_completion", &bench_input.input),
                &bench_input,
                bench_emit_with_completion,
            );
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

fn bench_emit_with_completion(b: &mut Bencher, bench_input: &BenchInput) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();

    b.to_async(rt).iter(move || {
        let tt = TurboTasks::new(MemoryBackend::new());
        let tests_root = bench_input.tests_root.clone();
        let input = bench_input.input.clone();
        async move {
            tt.run_once(async move {
                let input_fs = DiskFileSystemVc::new("tests".to_string(), tests_root.clone());
                let input = FileSystemPathVc::new(input_fs.into(), &input);

                let input_dir = input.parent().parent();
                let output_fs: NullFileSystemVc = NullFileSystem.into();
                let output_dir = FileSystemPathVc::new(output_fs.into(), "");

                let source = SourceAssetVc::new(input);
                let context = ModuleAssetContextVc::new(
                    TransitionsByNameVc::cell(HashMap::new()),
                    input_dir,
                    EnvironmentVc::new(
                        Value::new(ExecutionEnvironment::NodeJsLambda(
                            NodeJsEnvironment {
                                typescript_enabled: false,
                                compile_target: CompileTargetVc::current(),
                                node_version: 0,
                            }
                            .into(),
                        )),
                        Value::new(EnvironmentIntention::ServerRendering),
                    ),
                    Default::default(),
                );
                let module = context.process(source.into());
                let rebased = RebasedAssetVc::new(module, input_dir, output_dir);

                emit_with_completion(rebased.into(), output_dir).await?;

                Ok(())
            })
            .await
            .unwrap();
        }
    })
}

fn bench_emit(b: &mut Bencher, bench_input: &BenchInput) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();

    b.to_async(rt).iter(move || {
        let tt = TurboTasks::new(MemoryBackend::new());
        let tests_root = bench_input.tests_root.clone();
        let input = bench_input.input.clone();
        async move {
            let task = tt.spawn_once_task(async move {
                let input_fs = DiskFileSystemVc::new("tests".to_string(), tests_root.clone());
                let input = FileSystemPathVc::new(input_fs.into(), &input);

                let input_dir = input.parent().parent();
                let output_fs: NullFileSystemVc = NullFileSystem.into();
                let output_dir = FileSystemPathVc::new(output_fs.into(), "");

                let source = SourceAssetVc::new(input);
                let context = ModuleAssetContextVc::new(
                    TransitionsByNameVc::cell(HashMap::new()),
                    input_dir,
                    EnvironmentVc::new(
                        Value::new(ExecutionEnvironment::NodeJsLambda(
                            NodeJsEnvironment {
                                typescript_enabled: false,
                                compile_target: CompileTargetVc::current(),
                                node_version: 0,
                            }
                            .into(),
                        )),
                        Value::new(EnvironmentIntention::ServerRendering),
                    ),
                    Default::default(),
                );
                let module = context.process(source.into());
                let rebased = RebasedAssetVc::new(module, input_dir, output_dir);

                emit(rebased.into());

                Ok(NothingVc::new().into())
            });
            tt.wait_task_completion(task, true).await.unwrap();
        }
    })
}
