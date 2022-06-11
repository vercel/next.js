use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use async_std::task::block_on;
use criterion::Criterion;
use swc_common::{FilePathMapping, Mark, SourceMap, GLOBALS};
use swc_ecma_transforms_base::resolver;
use swc_ecmascript::{ast::EsVersion, parser::parse_file_as_program, visit::VisitMutWith};
use turbo_tasks_testing::VcStorage;
use turbopack_ecmascript::analyzer::{
    graph::{create_graph, EvalContext},
    linker::{link, LinkCache},
    test_utils::visitor,
};
use turbopack_ecmascript::target::CompileTarget;

pub fn benchmark(c: &mut Criterion) {
    let mut tests_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    tests_dir.push("tests");
    tests_dir.push("analyzer");
    tests_dir.push("graph");
    let results = fs::read_dir(tests_dir).unwrap();
    for result in results {
        let result = result.unwrap();
        if result.file_type().unwrap().is_dir() {
            let name = result.file_name();
            let name = name.to_string_lossy();
            let mut input = result.path();
            input.push("input.js");

            let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));
            let fm = cm.load_file(&input).unwrap();
            GLOBALS.set(&swc_common::Globals::new(), || {
                let mut m = parse_file_as_program(
                    &fm,
                    Default::default(),
                    EsVersion::latest(),
                    None,
                    &mut vec![],
                )
                .unwrap();

                let unresolved_mark = Mark::new();
                let top_level_mark = Mark::new();
                m.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));

                let eval_context = EvalContext::new(&m, unresolved_mark);

                let var_graph = create_graph(&m, &eval_context);

                let mut group = c.benchmark_group(&format!("analyzer/{name}"));
                group.warm_up_time(Duration::from_secs(1));
                group.measurement_time(Duration::from_secs(3));
                group.bench_function("create_graph", move |b| {
                    b.iter(|| create_graph(&m, &eval_context));
                });
                group.bench_function("link", move |b| {
                    b.iter(|| {
                        let cache = Mutex::new(LinkCache::new());
                        for val in var_graph.values.values() {
                            block_on(async {
                                VcStorage::install();
                                link(
                                    &var_graph,
                                    val.clone(),
                                    &(|val| Box::pin(visitor(val, CompileTarget::Current.into()))),
                                    &cache,
                                )
                                .await
                            })
                            .unwrap();
                        }
                    });
                });
            });
        }
    }
}
