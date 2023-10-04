use std::path::PathBuf;

use next_swc::{
    disallow_re_export_all_in_page::disallow_re_export_all_in_page,
    next_ssg::next_ssg,
    react_server_components::server_components,
    server_actions::{
        server_actions, {self},
    },
};
use next_transform_dynamic::{next_dynamic, NextDynamicMode};
use next_transform_font::{next_font_loaders, Config as FontLoaderConfig};
use turbopack_binding::swc::{
    core::{
        common::{chain, FileName, Mark},
        ecma::{
            parser::{EsConfig, Syntax},
            transforms::{
                base::resolver,
                testing::{test_fixture, FixtureTestConfig},
            },
        },
    },
    testing::fixture,
};

fn syntax() -> Syntax {
    Syntax::Es(EsConfig {
        jsx: true,
        ..Default::default()
    })
}

#[fixture("tests/errors/re-export-all-in-page/**/input.js")]
fn re_export_all_in_page(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| disallow_re_export_all_in_page(true),
        &input,
        &output,
        FixtureTestConfig {
            allow_error: true,
            ..Default::default()
        },
    );
}

#[fixture("tests/errors/next-dynamic/**/input.js")]
fn next_dynamic_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                true,
                false,
                false,
                NextDynamicMode::Webpack,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output,
        FixtureTestConfig {
            allow_error: true,
            ..Default::default()
        },
    );
}

#[fixture("tests/errors/next-ssg/**/input.js")]
fn next_ssg_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| next_ssg(Default::default()),
        &input,
        &output,
        FixtureTestConfig {
            allow_error: true,
            ..Default::default()
        },
    );
}

#[fixture("tests/errors/react-server-components/server-graph/**/input.js")]
fn react_server_components_server_graph_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/layout.js")),
                next_swc::react_server_components::Config::WithOptions(
                    next_swc::react_server_components::Options { is_server: true },
                ),
                tr.comments.as_ref().clone(),
                None,
                String::from("server").into(),
            )
        },
        &input,
        &output,
        FixtureTestConfig {
            allow_error: true,
            ..Default::default()
        },
    );
}

#[fixture("tests/errors/react-server-components/client-graph/**/input.js")]
fn react_server_components_client_graph_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/page.js")),
                next_swc::react_server_components::Config::WithOptions(
                    next_swc::react_server_components::Options { is_server: false },
                ),
                tr.comments.as_ref().clone(),
                None,
                String::from("client").into(),
            )
        },
        &input,
        &output,
        FixtureTestConfig {
            allow_error: true,
            ..Default::default()
        },
    );
}

#[fixture("tests/errors/next-font-loaders/**/input.js")]
fn next_font_loaders_errors(input: PathBuf) {
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
        FixtureTestConfig {
            allow_error: true,
            ..Default::default()
        },
    );
}

#[fixture("tests/errors/server-actions/server-graph/**/input.js")]
fn react_server_actions_server_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            chain!(
                resolver(Mark::new(), Mark::new(), false),
                server_components(
                    FileName::Real(PathBuf::from("/app/item.js")),
                    next_swc::react_server_components::Config::WithOptions(
                        next_swc::react_server_components::Options { is_server: true },
                    ),
                    tr.comments.as_ref().clone(),
                    None,
                    String::from("default").into(),
                ),
                server_actions(
                    &FileName::Real("/app/item.js".into()),
                    server_actions::Config {
                        is_server: true,
                        enabled: true
                    },
                    tr.comments.as_ref().clone(),
                )
            )
        },
        &input,
        &output,
        FixtureTestConfig {
            allow_error: true,
            ..Default::default()
        },
    );
}

#[fixture("tests/errors/server-actions/client-graph/**/input.js")]
fn react_server_actions_client_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            chain!(
                resolver(Mark::new(), Mark::new(), false),
                server_components(
                    FileName::Real(PathBuf::from("/app/item.js")),
                    next_swc::react_server_components::Config::WithOptions(
                        next_swc::react_server_components::Options { is_server: false },
                    ),
                    tr.comments.as_ref().clone(),
                    None,
                    String::from("client").into(),
                ),
                server_actions(
                    &FileName::Real("/app/item.js".into()),
                    server_actions::Config {
                        is_server: false,
                        enabled: true
                    },
                    tr.comments.as_ref().clone(),
                )
            )
        },
        &input,
        &output,
        FixtureTestConfig {
            allow_error: true,
            ..Default::default()
        },
    );
}
