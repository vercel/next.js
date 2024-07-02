use std::{
    env::current_dir,
    path::{Path, PathBuf},
};

use next_custom_transforms::transforms::{
    amp_attributes::amp_attributes,
    cjs_optimizer::cjs_optimizer,
    dynamic::{next_dynamic, NextDynamicMode},
    fonts::{next_font_loaders, Config as FontLoaderConfig},
    named_import_transform::named_import_transform,
    next_ssg::next_ssg,
    optimize_barrel::optimize_barrel,
    optimize_server_react::{self, optimize_server_react},
    page_config::page_config_test,
    pure::pure_magic,
    react_server_components::server_components,
    server_actions::{
        server_actions, {self},
    },
    shake_exports::{shake_exports, Config as ShakeExportsConfig},
    strip_page_exports::{next_transform_strip_page_exports, ExportFilter},
};
use serde::de::DeserializeOwned;
use swc_core::ecma::visit::as_folder;
use turbopack_binding::swc::{
    core::{
        common::{chain, comments::SingleThreadedComments, FileName, Mark, SyntaxContext},
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
                false,
                NextDynamicMode::Webpack,
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
                false,
                NextDynamicMode::Webpack,
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
                false,
                NextDynamicMode::Webpack,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_server,
        Default::default(),
    );
}

#[fixture("tests/fixture/next-dynamic-app-dir/**/input.js")]
fn app_dir_next_dynamic_fixture(input: PathBuf) {
    let output_dev = input.parent().unwrap().join("output-dev.js");
    let output_prod = input.parent().unwrap().join("output-prod.js");
    let output_server: PathBuf = input.parent().unwrap().join("output-server.js");
    let output_server_client_layer = input
        .parent()
        .unwrap()
        .join("output-server-client-layer.js");
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                true,
                false,
                true,
                false,
                NextDynamicMode::Webpack,
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
                true,
                false,
                NextDynamicMode::Webpack,
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
                true,
                false,
                NextDynamicMode::Webpack,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_server,
        Default::default(),
    );
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                false,
                true,
                false,
                false,
                NextDynamicMode::Webpack,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_server_client_layer,
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
                turbopack_binding::swc::core::ecma::transforms::react::Options {
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

    test_fixture(
        syntax(),
        &|_tr| {
            let config = turbopack_binding::swc::custom_transform::relay::Config {
                language: RelayLanguageConfig::TypeScript,
                artifact_directory: Some(PathBuf::from("__generated__")),
                ..Default::default()
            };

            relay(
                config.into(),
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
    use next_custom_transforms::transforms::react_server_components::{Config, Options};
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Config::WithOptions(Options {
                    is_react_server_layer: true,
                }),
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
    use next_custom_transforms::transforms::react_server_components::{Config, Options};
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")),
                Config::WithOptions(Options {
                    is_react_server_layer: false,
                }),
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
                    server_actions::Config {
                        is_react_server_layer: true,
                        enabled: true
                    },
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
                    server_actions::Config {
                        is_react_server_layer: false,
                        enabled: true
                    },
                    _tr.comments.as_ref().clone(),
                )
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/cjs-optimize/**/input.js")]
fn cjs_optimize_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();

            let unresolved_ctxt = SyntaxContext::empty().apply_mark(unresolved_mark);

            chain!(
                resolver(unresolved_mark, top_level_mark, false),
                as_folder(cjs_optimizer(
                    json(
                        r#"
                        {
                            "packages": {
                                "next/server": {
                                    "transforms": {
                                        "Response": "next/server/response"
                                    }
                                }
                            }
                        }
                        "#
                    ),
                    unresolved_ctxt
                ))
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/named-import-transform/**/input.js")]
fn named_import_transform_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();

            chain!(
                resolver(unresolved_mark, top_level_mark, false),
                named_import_transform(json(
                    r#"
                    {
                        "packages": ["foo", "bar"]
                    }
                    "#
                ))
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/optimize-barrel/normal/**/input.js")]
fn optimize_barrel_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();

            chain!(
                resolver(unresolved_mark, top_level_mark, false),
                optimize_barrel(json(
                    r#"
                        {
                            "wildcard": false
                        }
                    "#
                ))
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/optimize-barrel/wildcard/**/input.js")]
fn optimize_barrel_wildcard_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();

            chain!(
                resolver(unresolved_mark, top_level_mark, false),
                optimize_barrel(json(
                    r#"
                        {
                            "wildcard": true
                        }
                    "#
                ))
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/optimize_server_react/**/input.js")]
fn optimize_server_react_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();

            chain!(
                resolver(unresolved_mark, top_level_mark, false),
                optimize_server_react(optimize_server_react::Config {
                    optimize_use_state: true
                })
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

fn json<T>(s: &str) -> T
where
    T: DeserializeOwned,
{
    serde_json::from_str(s).expect("failed to deserialize")
}

#[fixture("tests/fixture/pure/**/input.js")]
fn pure(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();

            chain!(
                resolver(unresolved_mark, top_level_mark, false),
                as_folder(pure_magic(tr.comments.clone()))
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

fn run_stip_page_exports_test(input: &Path, output: &Path, mode: ExportFilter) {
    test_fixture(
        syntax(),
        &|tr| {
            let top_level_mark = Mark::fresh(Mark::root());
            let unresolved_mark = Mark::fresh(Mark::root());
            let jsx = jsx::<SingleThreadedComments>(
                tr.cm.clone(),
                None,
                swc_core::ecma::transforms::react::Options {
                    next: false.into(),
                    runtime: None,
                    import_source: Some("".into()),
                    pragma: Some("__jsx".into()),
                    pragma_frag: Some("__jsxFrag".into()),
                    throw_if_namespace: false.into(),
                    development: false.into(),
                    ..Default::default()
                },
                top_level_mark,
                unresolved_mark,
            );
            chain!(
                swc_core::ecma::transforms::base::resolver(unresolved_mark, top_level_mark, true),
                next_transform_strip_page_exports(mode, Default::default()),
                jsx
            )
        },
        input,
        output,
        Default::default(),
    );
}

#[fixture("tests/fixture/strip-page-exports/**/output-data.js")]
fn next_transform_strip_page_exports_fixture_data(output: PathBuf) {
    let input = output.parent().unwrap().join("input.js");

    run_stip_page_exports_test(&input, &output, ExportFilter::StripDefaultExport);
}

#[fixture("tests/fixture/strip-page-exports/**/output-default.js")]
fn next_transform_strip_page_exports_fixture_default(output: PathBuf) {
    let input = output.parent().unwrap().join("input.js");

    run_stip_page_exports_test(&input, &output, ExportFilter::StripDataExports);
}
