use next_swc_napi::webpack_ast::{self, parse_file_as_webpack_ast};
use std::path::PathBuf;
use swc_common::{chain, Mark};
use swc_ecma_transforms_testing::test_fixture;
use swc_ecmascript::{
    parser::{EsConfig, Syntax},
    transforms::resolver_with_mark,
    visit::as_folder,
};
use testing::NormalizedOutput;

#[testing::fixture("tests/webpack-ast/**/input.js")]
fn fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");

    test_fixture(
        Syntax::Es(EsConfig {
            jsx: true,
            ..Default::default()
        }),
        &|_| {
            let top_level_mark = Mark::fresh(Mark::root());

            chain!(
                resolver_with_mark(top_level_mark),
                as_folder(webpack_ast::ast_minimalizer(top_level_mark))
            )
        },
        &input,
        &output,
    );
}
