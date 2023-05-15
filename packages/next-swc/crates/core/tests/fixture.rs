use std::{env::current_dir, path::PathBuf};

use next_swc::{
    amp_attributes::amp_attributes,
    next_dynamic::next_dynamic,
    next_ssg::next_ssg,
    page_config::page_config_test,
    react_remove_properties::remove_properties,
    react_server_components::server_components,
    remove_console::remove_console,
    server_actions::{self, server_actions},
    shake_exports::{shake_exports, Config as ShakeExportsConfig},
};
use next_transform_font::{next_font_loaders, Config as FontLoaderConfig};
use turbo_binding::swc::{
    core::{
        common::{chain, comments::SingleThreadedComments, FileName, Mark},
        ecma::{
            parser::{EsConfig, Syntax},
            transforms::{
                base::resolver,
                react::jsx,
                testing::{test, test_fixture},
            },
        },
    },
    custom_transform::relay::{relay, RelayLanguageConfig},
    testing::fixture,
};

fn syntax() -> Syntax {
    Syntax::Es(EsConfig {
        jsx: true,
        ..Default::default()
    })
}

#[fixture("tests/fixture/amp/**/input.js")]
fn amp_attributes_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| amp_attributes(),
        &input,
        &output,
        Default::default(),
    );
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
                false,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_dev,
        Default::default(),
    );
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                false,
                false,
                false,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_prod,
        Default::default(),
    );
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                false,
                true,
                false,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_server,
        Default::default(),
    );
}

#[fixture("tests/fixture/ssg/**/input.js")]
fn next_ssg_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            let top_level_mark = Mark::fresh(Mark::root());
            let unresolved_mark = Mark::fresh(Mark::root());
            let jsx = jsx::<SingleThreadedComments>(
                tr.cm.clone(),
                None,
                turbo_binding::swc::core::ecma::transforms::react::Options {
                    next: false.into(),
                    runtime: None,
                    import_source: Some("".into()),
                    pragma: Some("__jsx".into()),
                    pragma_frag: Some("__jsxFrag".into()),
                    throw_if_namespace: false.into(),
                    development: false.into(),
                    refresh: Default::default(),
                    ..Default::default()
                },
                top_level_mark,
                unresolved_mark,
            );
            chain!(
                resolver(unresolved_mark, top_level_mark, true),
                next_ssg(Default::default()),
                jsx
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/page-config/**/input.js")]
fn page_config_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| page_config_test(),
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/relay/**/input.ts*")]
fn relay_no_artifact_dir_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    let config = turbo_binding::swc::custom_transform::relay::Config {
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
                current_dir().unwrap(),
                Some(PathBuf::from("src/pages")),
                None,
            )
        },
        &input,
        &output,
        Default::default(),
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
        Default::default(),
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
        Default::default(),
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
        Default::default(),
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
                    String::from("keep5").into(),
                ],
            })
        },
        &input,
        &output,
        Default::default(),
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
        Default::default(),
    );
}

#[fixture("tests/fixture/react-server-components/server-graph/**/input.js")]
fn react_server_components_server_graph_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                next_swc::react_server_components::Config::WithOptions(
                    next_swc::react_server_components::Options { is_server: true },
                ),
                tr.comments.as_ref().clone(),
                None,
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/react-server-components/client-graph/**/input.js")]
fn react_server_components_client_graph_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                next_swc::react_server_components::Config::WithOptions(
                    next_swc::react_server_components::Options { is_server: false },
                ),
                tr.comments.as_ref().clone(),
                None,
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/next-font-loaders/**/input.js")]
fn next_font_loaders_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            next_font_loaders(FontLoaderConfig {
                relative_file_path_from_root: "pages/test.tsx".into(),
                font_loaders: vec!["@next/font/google".into(), "cool-fonts".into()],
            })
        },
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/server-actions/server/**/input.js")]
fn server_actions_server_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            chain!(
                resolver(Mark::new(), Mark::new(), false),
                server_actions(
                    &FileName::Real("/app/item.js".into()),
                    server_actions::Config { is_server: true },
                    _tr.comments.as_ref().clone(),
                )
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/server-actions/client/**/input.js")]
fn server_actions_client_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            chain!(
                resolver(Mark::new(), Mark::new(), false),
                server_actions(
                    &FileName::Real("/app/item.js".into()),
                    server_actions::Config { is_server: false },
                    _tr.comments.as_ref().clone(),
                )
            )
        },
        &input,
        &output,
        Default::default(),
    );
}
