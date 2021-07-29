use self::next_ssg::next_ssg;
use std::path::PathBuf;
use swc_ecma_transforms_testing::{test, test_fixture};
use swc_ecmascript::parser::{EsConfig, Syntax};
use testing::fixture;

#[path = "../src/next_ssg.rs"]
mod next_ssg;

fn syntax() -> Syntax {
    Syntax::Es(EsConfig {
        jsx: true,
        ..Default::default()
    })
}

#[fixture("tests/fixture/ssg/**/input.js")]
fn next_ssg_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(syntax(), &|_| next_ssg(), &input, &output);
}
