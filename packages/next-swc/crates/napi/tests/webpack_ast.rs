use next_swc_napi::webpack_ast;
use std::path::PathBuf;
use swc_common::{chain, Mark};
use swc_ecma_transforms_testing::test_fixture;
use swc_ecmascript::{parser::Syntax, transforms::resolver_with_mark, visit::as_folder};

#[testing::fixture("tests/webpack-ast/**/input.js")]
fn fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");

    test_fixture(
        Syntax::default(),
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
