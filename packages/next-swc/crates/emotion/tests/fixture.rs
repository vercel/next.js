use std::path::PathBuf;

use emotion::EmotionOptions;
use swc_common::{Mark, comments::SingleThreadedComments, chain};
use swc_ecma_transforms_testing::test_fixture;
use swc_ecmascript::{transforms::react::{Runtime, jsx}, parser::{Syntax, TsConfig}};
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
                    next: false,
                    runtime: Some(Runtime::Automatic),
                    throw_if_namespace: false,
                    development: false,
                    use_builtins: true,
                    use_spread: true,
                    ..Default::default()
                },
                top_level_mark,
            );
            chain!(
                emotion::emotion(
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
