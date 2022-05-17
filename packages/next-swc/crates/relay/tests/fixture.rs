use std::path::PathBuf;
use swc_common::FileName;
use swc_ecma_transforms_testing::{test, test_fixture};
use swc_ecmascript::parser::{EsConfig, Syntax};
use swc_relay_transform::{relay, Config as RelayConfig, RelayLanguageConfig};
use testing::fixture;

fn syntax() -> Syntax {
    Syntax::Es(EsConfig {
        jsx: true,
        ..Default::default()
    })
}

#[fixture("tests/fixture/**/input.ts*")]
fn relay_no_artifact_dir_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    let config = RelayConfig {
        language: RelayLanguageConfig::TypeScript,
        artifact_directory: Some(PathBuf::from("__generated__")),
        ..Default::default()
    };
    test_fixture(
        syntax(),
        &|_tr| {
            relay(
                &config,
                std::env::current_dir().unwrap(),
                FileName::Real(PathBuf::from("input.tsx")),
                Some(PathBuf::from("src/pages")),
            )
        },
        &input,
        &output,
    );
}
