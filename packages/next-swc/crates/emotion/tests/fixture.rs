use std::path::PathBuf;

use swc_core::{
    common::{chain, comments::SingleThreadedComments, Mark},
    ecma::parser::{Syntax, TsConfig},
    ecma::transforms::react::{jsx, Runtime},
    ecma::transforms::testing::test_fixture,
};
use swc_emotion::EmotionOptions;
use testing::fixture;

fn ts_syntax() -> Syntax {
    Syntax::Typescript(TsConfig {
        tsx: true,
        ..Default::default()
    })
}

#[fixture("tests/fixture/**/input.tsx")]
fn next_emotion_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.ts");
    test_fixture(
        ts_syntax(),
        &|tr| {
            let top_level_mark = Mark::fresh(Mark::root());
            let jsx = jsx::<SingleThreadedComments>(
                tr.cm.clone(),
                Some(tr.comments.as_ref().clone()),
                swc_core::ecma::transforms::react::Options {
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

            let test_import_map =
                serde_json::from_str(include_str!("./testImportMap.json")).unwrap();

            chain!(
                swc_emotion::emotion(
                    EmotionOptions {
                        enabled: Some(true),
                        sourcemap: Some(true),
                        auto_label: Some(true),
                        import_map: Some(test_import_map),
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
        Default::default(),
    );
}
