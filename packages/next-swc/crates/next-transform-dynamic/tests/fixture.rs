use std::path::{Path, PathBuf};

use next_transform_dynamic::{next_dynamic, NextDynamicMode};
use swc_core::{
    common::FileName,
    ecma::{
        parser::{EsConfig, Syntax},
        transforms::testing::{test, test_fixture},
    },
};
use testing::fixture;

fn syntax() -> Syntax {
    Syntax::Es(EsConfig {
        jsx: true,
        ..Default::default()
    })
}

#[fixture("tests/fixture/**/input.js")]
fn next_dynamic_fixture(input: PathBuf) {
    next_dynamic_fixture_run(
        &input,
        "output-webpack-dev.js",
        true,
        false,
        false,
        false,
        NextDynamicMode::Webpack,
    );
    next_dynamic_fixture_run(
        &input,
        "output-webpack-prod.js",
        false,
        false,
        false,
        false,
        NextDynamicMode::Webpack,
    );
    next_dynamic_fixture_run(
        &input,
        "output-webpack-server.js",
        false,
        true,
        false,
        false,
        NextDynamicMode::Webpack,
    );

    next_dynamic_fixture_run(
        &input,
        "output-turbo-dev-client.js",
        true,
        false,
        false,
        false,
        NextDynamicMode::Turbopack {
            dynamic_transition_name: "next-client-chunks".into(),
        },
    );
    next_dynamic_fixture_run(
        &input,
        "output-turbo-dev-server.js",
        true,
        true,
        false,
        false,
        NextDynamicMode::Turbopack {
            dynamic_transition_name: "next-client-chunks".into(),
        },
    );
    next_dynamic_fixture_run(
        &input,
        "output-turbo-build-client.js",
        false,
        false,
        false,
        false,
        NextDynamicMode::Turbopack {
            dynamic_transition_name: "next-dynamic".into(),
        },
    );
    next_dynamic_fixture_run(
        &input,
        "output-turbo-build-server.js",
        false,
        true,
        false,
        false,
        NextDynamicMode::Turbopack {
            dynamic_transition_name: "next-dynamic".into(),
        },
    );
    next_dynamic_fixture_run(
        &input,
        "output-turbo-build-rsc.js",
        false,
        true,
        true,
        true,
        NextDynamicMode::Turbopack {
            dynamic_transition_name: "next-dynamic".into(),
        },
    );
}

fn next_dynamic_fixture_run(
    input: &Path,
    output: &str,
    is_development: bool,
    is_server_compiler: bool,
    is_react_server_layer: bool,
    prefer_esm: bool,
    mode: NextDynamicMode,
) {
    let output = input.parent().unwrap().join(output);
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                is_development,
                is_server_compiler,
                is_react_server_layer,
                prefer_esm,
                mode.clone(),
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        input,
        &output,
        Default::default(),
    );
}
