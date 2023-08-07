use std::path::{Path, PathBuf};

use next_transform_strip_page_exports::{next_transform_strip_page_exports, ExportFilter};
use swc_core::{
    common::{chain, comments::SingleThreadedComments, Mark},
    ecma::{
        parser::{EsConfig, Syntax},
        transforms::{
            react::jsx,
            testing::{test, test_fixture},
        },
    },
};
use testing::fixture;

fn syntax() -> Syntax {
    Syntax::Es(EsConfig {
        jsx: true,
        ..Default::default()
    })
}

fn run_test(input: &Path, output: &Path, mode: ExportFilter) {
    test_fixture(
        syntax(),
        &|tr| {
            let top_level_mark = Mark::fresh(Mark::root());
            let unresolved_mark = Mark::fresh(Mark::root());
            let jsx = jsx::<SingleThreadedComments>(
                tr.cm.clone(),
                None,
                swc_core::ecma::transforms::react::Options {
                    next: false.into(),
                    runtime: None,
                    import_source: Some("".into()),
                    pragma: Some("__jsx".into()),
                    pragma_frag: Some("__jsxFrag".into()),
                    throw_if_namespace: false.into(),
                    development: false.into(),
                    ..Default::default()
                },
                top_level_mark,
                unresolved_mark,
            );
            chain!(
                swc_core::ecma::transforms::base::resolver(unresolved_mark, top_level_mark, true),
                next_transform_strip_page_exports(mode, Default::default()),
                jsx
            )
        },
        input,
        output,
        Default::default(),
    );
}

#[fixture("tests/fixtures/**/output-data.js")]
fn next_transform_strip_page_exports_fixture_data(output: PathBuf) {
    let input = output.parent().unwrap().join("input.js");

    run_test(&input, &output, ExportFilter::StripDefaultExport);
}

#[fixture("tests/fixtures/**/output-default.js")]
fn next_transform_strip_page_exports_fixture_default(output: PathBuf) {
    let input = output.parent().unwrap().join("input.js");

    run_test(&input, &output, ExportFilter::StripDataExports);
}
