use std::{fs, path::PathBuf};

use criterion::{async_executor::AsyncStdExecutor, Criterion};
use lazy_static::lazy_static;
use regex::Regex;
use turbo_tasks::{MemoryBackend, NothingVc, TurboTasks};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc, NullFileSystem, NullFileSystemVc};
use turbopack::{
    emit, emit_with_completion, module, rebase::RebasedAssetVc, register,
    source_asset::SourceAssetVc,
};

pub fn benchmark(c: &mut Criterion) {
    register();

    let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut tests_root = package_root.clone();
    tests_root.push("tests");
    let mut tests_dir = tests_root.clone();
    tests_dir.push("node-file-trace");
    tests_dir.push("integration");
    let results = fs::read_dir(tests_dir).unwrap();
    for result in results {
        let result = result.unwrap();
        if result.file_type().unwrap().is_file() {
            let name = result.file_name();
            let name = name.to_string_lossy();
            lazy_static! {
                static ref BENCH_FILTER: Regex =
                    Regex::new(r"(empty|simple|dynamic-in-package|react|whatwg-url|axios|azure-cosmos|cowsay|env-var|fast-glob)\.js$").unwrap();
            }
            if !BENCH_FILTER.is_match(name.as_ref()) {
                continue;
            }
            let input = format!("node-file-trace/integration/{name}");
            let tests_root = tests_root.to_string_lossy().to_string();

            let mut group = c.benchmark_group(&input);
            group.sample_size(10);
            {
                let tests_root = tests_root.clone();
                let input = input.clone();
                group.bench_function("emit_with_completion RebasedAsset", move |b| {
                    let tests_root = tests_root.clone();
                    let input = input.clone();
                    b.to_async(AsyncStdExecutor).iter(move || {
                        let tt = TurboTasks::new(MemoryBackend::new());
                        let tests_root = tests_root.clone();
                        let input = input.clone();
                        async move {
                            tt.run_once(async move {
                                let input_fs =
                                    DiskFileSystemVc::new("tests".to_string(), tests_root.clone());
                                let input = FileSystemPathVc::new(input_fs.into(), &input);

                                let input_dir = input.clone().parent().parent();
                                let output_fs: NullFileSystemVc = NullFileSystem.into();
                                let output_dir = FileSystemPathVc::new(output_fs.into(), "");

                                let source = SourceAssetVc::new(input);
                                let module = module(source.into());
                                let rebased = RebasedAssetVc::new(module, input_dir, output_dir);

                                emit_with_completion(rebased.into()).await?;

                                Ok(())
                            })
                            .await
                            .unwrap();
                        }
                    })
                });
            }
            group.bench_function("emit module", move |b| {
                let tests_root = tests_root.clone();
                let input = input.clone();
                b.to_async(AsyncStdExecutor).iter(move || {
                    let tt = TurboTasks::new(MemoryBackend::new());
                    let tests_root = tests_root.clone();
                    let input = input.clone();
                    async move {
                        tt.spawn_once_task(async move {
                            let input_fs =
                                DiskFileSystemVc::new("tests".to_string(), tests_root.clone());
                            let input = FileSystemPathVc::new(input_fs.into(), &input);

                            let input_dir = input.clone().parent().parent();
                            let output_fs: NullFileSystemVc = NullFileSystem.into();
                            let output_dir = FileSystemPathVc::new(output_fs.into(), "");

                            let source = SourceAssetVc::new(input);
                            let module = module(source.into());
                            let rebased = RebasedAssetVc::new(module, input_dir, output_dir);

                            emit(rebased.into());

                            Ok(NothingVc::new().into())
                        });
                        tt.wait_done().await;
                    }
                })
            });
        }
    }
}
