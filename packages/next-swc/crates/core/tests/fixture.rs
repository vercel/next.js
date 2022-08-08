use next_swc::{
    amp_attributes::amp_attributes,
    next_dynamic::next_dynamic,
    next_ssg::next_ssg,
    page_config::page_config_test,
    react_remove_properties::remove_properties,
    relay::{relay, Config as RelayConfig, RelayLanguageConfig},
    remove_console::remove_console,
    shake_exports::{shake_exports, Config as ShakeExportsConfig},
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
    let output_dev = input.parent().unwrap().join("output-dev.js");
    let output_prod = input.parent().unwrap().join("output-prod.js");
    let output_server = input.parent().unwrap().join("output-server.js");
    test_fixture(
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
        &output_dev,
    );
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                false,
                false,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_prod,
    );
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                false,
                true,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_server,
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
                    next: false.into(),
                    runtime: None,
                    import_source: Some("".into()),
                    pragma: Some("__jsx".into()),
                    pragma_frag: Some("__jsxFrag".into()),
                    throw_if_namespace: false.into(),
                    development: false.into(),
                    use_builtins: true.into(),
                    use_spread: true.into(),
                    refresh: Default::default(),
                },
                top_level_mark,
            );
            chain!(next_ssg(Default::default()), jsx)
        },
        &input,
        &output,
    );
}

#[fixture("tests/fixture/page-config/**/input.js")]
fn page_config_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(syntax(), &|_tr| page_config_test(), &input, &output);
}

#[fixture("tests/fixture/relay/**/input.ts*")]
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
                FileName::Real(PathBuf::from("input.tsx")),
                Some(PathBuf::from("src/pages")),
            )
        },
        &input,
        &output,
    );
}

#[fixture("tests/fixture/remove-console/**/input.js")]
fn remove_console_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| remove_console(next_swc::remove_console::Config::All(true)),
        &input,
        &output,
    );
}

#[fixture("tests/fixture/react-remove-properties/default/**/input.js")]
fn react_remove_properties_default_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| remove_properties(next_swc::react_remove_properties::Config::All(true)),
        &input,
        &output,
    );
}

#[fixture("tests/fixture/react-remove-properties/custom/**/input.js")]
fn react_remove_properties_custom_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            remove_properties(next_swc::react_remove_properties::Config::WithOptions(
                next_swc::react_remove_properties::Options {
                    properties: vec!["^data-custom$".into()],
                },
            ))
        },
        &input,
        &output,
    );
}

#[fixture("tests/fixture/shake-exports/most-usecases/input.js")]
fn shake_exports_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            shake_exports(ShakeExportsConfig {
                ignore: vec![
                    String::from("keep").into(),
                    String::from("keep1").into(),
                    String::from("keep2").into(),
                    String::from("keep3").into(),
                    String::from("keep4").into(),
                ],
            })
        },
        &input,
        &output,
    );
}

#[fixture("tests/fixture/shake-exports/keep-default/input.js")]
fn shake_exports_fixture_default(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            shake_exports(ShakeExportsConfig {
                ignore: vec![String::from("default").into()],
            })
        },
        &input,
        &output,
    );
}
