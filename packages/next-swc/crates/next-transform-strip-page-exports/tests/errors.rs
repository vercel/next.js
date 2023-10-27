use std::path::PathBuf;

use next_transform_strip_page_exports::{next_transform_strip_page_exports, ExportFilter};
use swc_core::ecma::{
    parser::{EsConfig, Syntax},
    transforms::testing::{test_fixture, FixtureTestConfig},
};
use testing::fixture;

fn syntax() -> Syntax {
    Syntax::Es(EsConfig {
        jsx: true,
        ..Default::default()
    })
}

#[fixture("tests/errors/**/input.js")]
fn next_transform_strip_page_exports_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            next_transform_strip_page_exports(ExportFilter::StripDataExports, Default::default())
        },
        &input,
        &output,
        FixtureTestConfig {
            allow_error: true,
            ..Default::default()
        },
    );
}
