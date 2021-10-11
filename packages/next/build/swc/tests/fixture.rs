use next_swc::{
    amp_attributes::amp_attributes, next_dynamic::next_dynamic, next_ssg::next_ssg,
    styled_jsx::styled_jsx,
};
use std::path::PathBuf;
use swc_common::{chain, comments::SingleThreadedComments, FileName, Mark};
use swc_ecma_transforms_testing::{test, test_fixture};
use swc_ecmascript::{
    parser::{EsConfig, Syntax},
    transforms::react::jsx,
};
use testing::fixture;

fn syntax() -> Syntax {
    Syntax::Es(EsConfig {
        jsx: true,
        dynamic_import: true,
        ..Default::default()
    })
}

#[fixture("tests/fixture/amp/**/input.js")]
fn amp_attributes_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(syntax(), &|_tr| amp_attributes(), &input, &output);
}

#[fixture("tests/fixture/next-dynamic/**/input.js")]
fn next_dynamic_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output,
    );
}

#[fixture("tests/fixture/ssg/**/input.js")]
fn next_ssg_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            let top_level_mark = Mark::fresh(Mark::root());
            let jsx = jsx::<SingleThreadedComments>(
                tr.cm.clone(),
                None,
                swc_ecmascript::transforms::react::Options {
                    next: false,
                    runtime: None,
                    import_source: "".into(),
                    pragma: "__jsx".into(),
                    pragma_frag: "__jsxFrag".into(),
                    throw_if_namespace: false,
                    development: false,
                    use_builtins: true,
                    use_spread: true,
                    refresh: Default::default(),
                },
                top_level_mark,
            );
            chain!(next_ssg(), jsx)
        },
        &input,
        &output,
    );
}

#[fixture("tests/fixture/styled-jsx/**/input.js")]
fn styled_jsx_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(syntax(), &|_tr| styled_jsx(), &input, &output);
}
