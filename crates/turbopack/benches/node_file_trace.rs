use std::{collections::HashMap, fs, path::PathBuf};

use criterion::{Bencher, BenchmarkId, Criterion};
use regex::Regex;
use turbo_tasks::{NothingVc, TurboTasks, Value};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystem, NullFileSystem, NullFileSystemVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{
    emit, rebase::RebasedAssetVc, register, resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByNameVc, ModuleAssetContextVc,
};
use turbopack_core::{
    context::AssetContext,
    environment::{EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment},
    source_asset::SourceAssetVc,
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
        let tt = TurboTasks::new(MemoryBackend::new());
        let tests_root = bench_input.tests_root.clone();
        let input = bench_input.input.clone();
        async move {
            let task = tt.spawn_once_task(async move {
                let input_fs = DiskFileSystemVc::new("tests".to_string(), tests_root.clone());
                let input = input_fs.root().join(&input);

                let input_dir = input.parent().parent();
                let output_fs: NullFileSystemVc = NullFileSystem.into();
                let output_dir = output_fs.root();

                let source = SourceAssetVc::new(input);
                let environment = EnvironmentVc::new(
                    Value::new(ExecutionEnvironment::NodeJsLambda(
                        NodeJsEnvironment::default().into(),
                    )),
                    Value::new(EnvironmentIntention::ServerRendering),
                );
                let context = ModuleAssetContextVc::new(
                    TransitionsByNameVc::cell(HashMap::new()),
                    environment,
                    Default::default(),
                    ResolveOptionsContext {
                        emulate_environment: Some(environment),
                        ..Default::default()
                    }
                    .cell(),
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
