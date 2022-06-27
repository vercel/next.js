use next_swc::{
    disallow_re_export_all_in_page::disallow_re_export_all_in_page, next_dynamic::next_dynamic,
    next_ssg::next_ssg,
};
use std::path::PathBuf;
use swc_common::FileName;
use swc_ecma_transforms_testing::test_fixture_allowing_error;
use swc_ecmascript::parser::{EsConfig, Syntax};
use testing::fixture;

fn syntax() -> Syntax {
    Syntax::Es(EsConfig {
        jsx: true,
        ..Default::default()
    })
}

#[fixture("tests/errors/re-export-all-in-page/**/input.js")]
fn re_export_all_in_page(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture_allowing_error(
        syntax(),
        &|_tr| disallow_re_export_all_in_page(true),
        &input,
        &output,
    );
}

#[fixture("tests/errors/next-dynamic/**/input.js")]
fn next_dynamic_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture_allowing_error(
        syntax(),
        &|_tr| {
            next_dynamic(
                true,
                false,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output,
    );
}

#[fixture("tests/errors/next-ssg/**/input.js")]
fn next_ssg_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture_allowing_error(
        syntax(),
        &|_tr| next_ssg(Default::default()),
        &input,
        &output,
    );
}
