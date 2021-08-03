use self::next_ssg::next_ssg;
use std::path::PathBuf;
use swc_common::{chain, comments::SingleThreadedComments};
use swc_ecma_transforms_testing::{test, test_fixture};
use swc_ecmascript::{
    parser::{EsConfig, Syntax},
    transforms::react::jsx,
};
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
    test_fixture(
        syntax(),
        &|tr| {
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
            );
            chain!(next_ssg(), jsx)
        },
        &input,
        &output,
    );
}
