use std::{fs, path::PathBuf, sync::Arc, time::Duration};

use criterion::{Bencher, BenchmarkId, Criterion};
use swc_core::{
    common::{FilePathMapping, Mark, SourceMap, GLOBALS},
    ecma::{
        ast::{EsVersion, Program},
        parser::parse_file_as_program,
        transforms::base::resolver,
        visit::VisitMutWith,
    },
};
use turbo_tasks::{ResolvedVc, Value};
use turbo_tasks_testing::VcStorage;
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment, NodeJsVersion},
    target::CompileTarget,
};
use turbopack_ecmascript::analyzer::{
    graph::{create_graph, EvalContext, VarGraph},
    imports::ImportAttributes,
    linker::link,
    test_utils::{early_visitor, visitor},
};

pub fn benchmark(c: &mut Criterion) {
    turbopack_ecmascript::register();

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

                let eval_context =
                    EvalContext::new(&program, unresolved_mark, top_level_mark, None, None);
                let var_graph = create_graph(&program, &eval_context);

                let input = BenchInput {
                    program,
                    eval_context,
                    var_graph,
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
    var_graph: VarGraph,
}

fn bench_create_graph(b: &mut Bencher, input: &BenchInput) {
    b.iter(|| create_graph(&input.program, &input.eval_context));
}

fn bench_link(b: &mut Bencher, input: &BenchInput) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap();

    b.to_async(rt).iter(|| async {
        let var_cache = Default::default();
        for val in input.var_graph.values.values() {
            VcStorage::with(async {
                let compile_time_info = CompileTimeInfo::builder(
                    Environment::new(Value::new(ExecutionEnvironment::NodeJsLambda(
                        NodeJsEnvironment {
                            compile_target: CompileTarget::unknown().to_resolved().await?,
                            node_version: NodeJsVersion::default().resolved_cell(),
                            cwd: ResolvedVc::cell(None),
                        }
                        .resolved_cell(),
                    )))
                    .to_resolved()
                    .await?,
                )
                .cell()
                .await?;
                link(
                    &input.var_graph,
                    val.clone(),
                    &early_visitor,
                    &(|val| visitor(val, compile_time_info, ImportAttributes::empty_ref())),
                    &Default::default(),
                    &var_cache,
                )
                .await
            })
            .await
            .unwrap();
        }
    });
}
