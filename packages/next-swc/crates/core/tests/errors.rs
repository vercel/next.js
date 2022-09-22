use next_swc::{
    disallow_re_export_all_in_page::disallow_re_export_all_in_page, next_dynamic::next_dynamic,
    next_font_loaders::next_font_loaders, next_ssg::next_ssg,
    react_server_components::server_components,
};
use std::path::PathBuf;
use swc_core::{
    common::FileName,
    ecma::parser::{EsConfig, Syntax},
    ecma::transforms::testing::test_fixture_allowing_error,
};
use testing::fixture;

fn syntax() -> Syntax {
    Syntax::Es(EsConfig {
        jsx: true,
        ..Default::default()
    })
}

#[fixture("tests/errors/re-export-all-in-page/**/input.js")]
fn re_export_all_in_page(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture_allowing_error(
        syntax(),
        &|_tr| disallow_re_export_all_in_page(true),
        &input,
        &output,
    );
}

#[fixture("tests/errors/next-dynamic/**/input.js")]
fn next_dynamic_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture_allowing_error(
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
        &output,
    );
}

#[fixture("tests/errors/next-ssg/**/input.js")]
fn next_ssg_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture_allowing_error(
        syntax(),
        &|_tr| next_ssg(Default::default()),
        &input,
        &output,
    );
}

#[fixture("tests/errors/react-server-components/server-graph/**/input.js")]
fn react_server_components_server_graph_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture_allowing_error(
        syntax(),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                next_swc::react_server_components::Config::WithOptions(
                    next_swc::react_server_components::Options { is_server: true },
                ),
                tr.comments.as_ref().clone(),
            )
        },
        &input,
        &output,
    );
}

#[fixture("tests/errors/react-server-components/client-graph/**/input.js")]
fn react_server_components_client_graph_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture_allowing_error(
        syntax(),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/page.js")),
                next_swc::react_server_components::Config::WithOptions(
                    next_swc::react_server_components::Options { is_server: false },
                ),
                tr.comments.as_ref().clone(),
            )
        },
        &input,
        &output,
    );
}

#[fixture("tests/errors/next-font-loaders/**/input.js")]
fn next_font_loaders_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture_allowing_error(
        syntax(),
        &|_tr| next_font_loaders(vec!["@next/font/google".into(), "cool-fonts".into()]),
        &input,
        &output,
    );
}
