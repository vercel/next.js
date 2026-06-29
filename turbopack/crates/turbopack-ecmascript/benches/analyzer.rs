use std::{
    fs,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use criterion::{Bencher, BenchmarkId, Criterion, criterion_group, criterion_main};
use swc_core::{
    common::{FilePathMapping, GLOBALS, Mark, SourceMap},
    ecma::{
        ast::{EsVersion, Program},
        parser::parse_file_as_program,
        transforms::base::resolver,
        visit::VisitMutWith,
    },
};
use turbo_tasks::{
    ResolvedVc, TurboTasks, unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment, NodeJsVersion},
    target::CompileTarget,
};
use turbopack_ecmascript::{
    AnalyzeMode,
    analyzer::{
        Bump, ThreadLocal,
        graph::{EvalContext, VarGraph, create_graph},
        imports::ImportAttributes,
        linker::link,
        test_utils::{early_visitor, visitor},
    },
};

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

pub fn benchmark(c: &mut Criterion) {
    let tests_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/analyzer/graph");
    let results = fs::read_dir(tests_dir).unwrap();

    let mut group = c.benchmark_group("analyzer");
    group.warm_up_time(Duration::from_secs(1));
    group.measurement_time(Duration::from_secs(3));

    for result in results {
        let entry = result.unwrap();
        if entry.file_type().unwrap().is_dir() {
            let name = entry.file_name().into_string().unwrap();
            let input = entry.path().join("input.js");

            let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));
            let fm = cm.load_file(&input).unwrap();
            GLOBALS.set(&swc_core::common::Globals::new(), || {
                let mut program = parse_file_as_program(
                    &fm,
                    Default::default(),
                    EsVersion::latest(),
                    None,
                    &mut vec![],
                )
                .unwrap();

                let unresolved_mark = Mark::new();
                let top_level_mark = Mark::new();
                program.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));

                let eval_context = EvalContext::new(
                    Some(&program),
                    unresolved_mark,
                    top_level_mark,
                    Default::default(),
                    None,
                );
                // Leak a per-benchmark arena so the stored `VarGraph` can be `'static` (benches are
                // short-lived processes, so the leak is inconsequential).
                let arena: &'static ThreadLocal<Bump> = Box::leak(Box::new(ThreadLocal::new()));
                let var_graph = Arc::new(create_graph(
                    arena.get_or_default(),
                    &program,
                    &eval_context,
                    AnalyzeMode::CodeGenerationAndTracing,
                    true,
                ));

                let input = BenchInput {
                    program,
                    eval_context,
                    var_graph,
                    arena,
                };

                group.bench_with_input(
                    BenchmarkId::new("create_graph", &name),
                    &input,
                    bench_create_graph,
                );
                group.bench_with_input(BenchmarkId::new("link", &name), &input, bench_link);
            });
        }
    }
}

struct BenchInput {
    program: Program,
    eval_context: EvalContext,
    var_graph: Arc<VarGraph<'static>>,
    arena: &'static ThreadLocal<Bump>,
}

fn bench_create_graph(b: &mut Bencher, input: &BenchInput) {
    b.iter(|| {
        let arena = ThreadLocal::new();
        criterion::black_box(create_graph(
            arena.get_or_default(),
            &input.program,
            &input.eval_context,
            AnalyzeMode::CodeGenerationAndTracing,
            true,
        ));
    });
}

fn bench_link(b: &mut Bencher, input: &BenchInput) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap();

    let arena = input.arena;
    let var_graph = input.var_graph.clone();

    b.to_async(rt).iter_custom(move |iters| {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: None,
                dependency_tracking: false,
                ..Default::default()
            },
            noop_backing_storage(),
        ));
        let var_graph = var_graph.clone();
        async move {
            tt.run_once(async move {
                // `link` performs eventually-consistent Vc reads. That trips the top-level-task
                // assertion under debug-assertions, but for a benchmark (not real code) reading
                // the not-yet-settled value is fine — we only care about throughput.
                unmark_top_level_task_may_leak_eventually_consistent_state();
                let compile_time_info = CompileTimeInfo::builder(
                    Environment::new(ExecutionEnvironment::NodeJsLambda(
                        NodeJsEnvironment {
                            compile_target: CompileTarget::unknown().to_resolved().await?,
                            node_version: NodeJsVersion::default().resolved_cell(),
                            cwd: ResolvedVc::cell(None),
                        }
                        .resolved_cell(),
                    ))
                    .to_resolved()
                    .await?,
                )
                .cell()
                .await?;
                let start = Instant::now();
                for _ in 0..iters {
                    let var_cache = Default::default();
                    for value in var_graph.values.values() {
                        link(
                            arena,
                            &var_graph,
                            value.clone_in(arena.get_or_default()),
                            &(|val| early_visitor(arena, val)),
                            &(|val| {
                                visitor(
                                    arena,
                                    val,
                                    compile_time_info,
                                    ImportAttributes::empty_ref(),
                                )
                            }),
                            &Default::default(),
                            &var_cache,
                        )
                        .await?;
                    }
                }
                anyhow::Ok(start.elapsed())
            })
            .await
            .unwrap()
        }
    });
}

criterion_group!(analyzer_benches, benchmark);
criterion_main!(analyzer_benches);
