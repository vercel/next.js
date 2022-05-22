use std::path::PathBuf;

use swc_common::{chain, comments::SingleThreadedComments, Mark};
use swc_ecma_transforms_testing::test_fixture;
use swc_ecmascript::{
    parser::{Syntax, TsConfig},
    transforms::react::{jsx, Runtime},
};
use swc_emotion::EmotionOptions;
use testing::fixture;

fn ts_syntax() -> Syntax {
    Syntax::Typescript(TsConfig {
        tsx: true,
        ..Default::default()
    })
}

#[fixture("tests/fixture/*/input.tsx")]
fn next_emotion_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.ts");
    test_fixture(
        ts_syntax(),
        &|tr| {
            let top_level_mark = Mark::fresh(Mark::root());
            let jsx = jsx::<SingleThreadedComments>(
                tr.cm.clone(),
                Some(tr.comments.as_ref().clone()),
                swc_ecmascript::transforms::react::Options {
                    next: false.into(),
                    runtime: Some(Runtime::Automatic),
                    throw_if_namespace: false.into(),
                    development: false.into(),
                    use_builtins: true.into(),
                    use_spread: true.into(),
                    ..Default::default()
                },
                top_level_mark,
            );
            chain!(
                swc_emotion::emotion(
                    EmotionOptions {
                        enabled: Some(true),
                        sourcemap: Some(true),
                        auto_label: Some(true),
                        ..Default::default()
                    },
                    &PathBuf::from("input.ts"),
                    tr.cm.clone(),
                    tr.comments.as_ref().clone(),
                ),
                jsx
            )
        },
        &input,
        &output,
    );
}
