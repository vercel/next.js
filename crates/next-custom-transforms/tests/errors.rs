use std::path::PathBuf;

use next_custom_transforms::transforms::{
    disallow_re_export_all_in_page::disallow_re_export_all_in_page,
    dynamic::{next_dynamic, NextDynamicMode},
    fonts::{next_font_loaders, Config as FontLoaderConfig},
    next_ssg::next_ssg,
    react_server_components::server_components,
    server_actions::{
        server_actions, {self},
    },
    strip_page_exports::{next_transform_strip_page_exports, ExportFilter},
};
use turbopack_binding::swc::{
    core::{
        common::{chain, FileName, Mark},
        ecma::{
            parser::{EsSyntax, Syntax},
            transforms::{
                base::resolver,
                testing::{test_fixture, FixtureTestConfig},
            },
        },
    },
    testing::fixture,
};

fn syntax() -> Syntax {
    Syntax::Es(EsSyntax {
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
    use next_custom_transforms::transforms::react_server_components::{Config, Options};
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/layout.js")),
                Config::WithOptions(Options {
                    is_react_server_layer: true,
                }),
                tr.comments.as_ref().clone(),
                None,
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
    use next_custom_transforms::transforms::react_server_components::{Config, Options};
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/page.js")),
                Config::WithOptions(Options {
                    is_react_server_layer: false,
                }),
                tr.comments.as_ref().clone(),
                None,
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
    use next_custom_transforms::transforms::react_server_components::{Config, Options};
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            chain!(
                resolver(Mark::new(), Mark::new(), false),
                server_components(
                    FileName::Real(PathBuf::from("/app/item.js")),
                    Config::WithOptions(Options {
                        is_react_server_layer: true
                    },),
                    tr.comments.as_ref().clone(),
                    None,
                ),
                server_actions(
                    &FileName::Real("/app/item.js".into()),
                    server_actions::Config {
                        is_react_server_layer: true,
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
    use next_custom_transforms::transforms::react_server_components::{Config, Options};
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            chain!(
                resolver(Mark::new(), Mark::new(), false),
                server_components(
                    FileName::Real(PathBuf::from("/app/item.js")),
                    Config::WithOptions(Options {
                        is_react_server_layer: false
                    },),
                    tr.comments.as_ref().clone(),
                    None,
                ),
                server_actions(
                    &FileName::Real("/app/item.js".into()),
                    server_actions::Config {
                        is_react_server_layer: false,
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

#[fixture("tests/errors/strip-page-exports/**/input.js")]
fn next_transform_strip_page_exports_errors(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            next_transform_strip_page_exports(ExportFilter::StripDataExports, Default::default())
        },
        &input,
        &output,
        FixtureTestConfig {
            allow_error: true,
            ..Default::default()
        },
    );
}
