use std::{
    env::current_dir,
    iter::FromIterator,
    path::{Path, PathBuf},
    sync::Arc,
};

use next_custom_transforms::transforms::{
    amp_attributes::amp_attributes,
    cjs_optimizer::cjs_optimizer,
    debug_fn_name::debug_fn_name,
    dynamic::{next_dynamic, NextDynamicMode},
    fonts::{next_font_loaders, Config as FontLoaderConfig},
    named_import_transform::named_import_transform,
    next_ssg::next_ssg,
    optimize_barrel::optimize_barrel,
    optimize_server_react::{self, optimize_server_react},
    page_config::page_config_test,
    pure::pure_magic,
    react_server_components::server_components,
    server_actions::{self, server_actions},
    shake_exports::{shake_exports, Config as ShakeExportsConfig},
    strip_page_exports::{next_transform_strip_page_exports, ExportFilter},
    warn_for_edge_runtime::warn_for_edge_runtime,
};
use rustc_hash::FxHashSet;
use serde::de::DeserializeOwned;
use swc_core::{
    atoms::atom,
    common::{comments::SingleThreadedComments, FileName, Mark, SyntaxContext},
    ecma::{
        ast::Pass,
        parser::{EsSyntax, Syntax},
        transforms::{
            base::resolver,
            react::jsx,
            testing::{test_fixture, FixtureTestConfig},
        },
        utils::ExprCtx,
        visit::{visit_mut_pass, visit_pass, Visit},
    },
};
use swc_relay::{relay, RelayLanguageConfig};
use testing::fixture;

fn syntax() -> Syntax {
    Syntax::Es(EsSyntax {
        jsx: true,
        import_attributes: true,
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
    let output_turbo_dev = input.parent().unwrap().join("output-turbo-dev.js");
    let output_turbo_prod = input.parent().unwrap().join("output-turbo-prod.js");
    let output_turbo_server = input.parent().unwrap().join("output-turbo-server.js");
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                true,
                false,
                false,
                false,
                NextDynamicMode::Webpack,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
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
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
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
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
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
                true,
                false,
                false,
                false,
                NextDynamicMode::Turbopack {
                    dynamic_client_transition_name: atom!("next-client-dynamic"),
                    dynamic_transition_name: atom!("next-dynamic"),
                },
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_turbo_dev,
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
                NextDynamicMode::Turbopack {
                    dynamic_client_transition_name: atom!("next-client-dynamic"),
                    dynamic_transition_name: atom!("next-dynamic"),
                },
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_turbo_prod,
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
                NextDynamicMode::Turbopack {
                    dynamic_client_transition_name: atom!("next-client-dynamic"),
                    dynamic_transition_name: atom!("next-dynamic"),
                },
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_turbo_server,
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
    let output_turbo_dev = input.parent().unwrap().join("output-turbo-dev.js");
    let output_turbo_prod = input.parent().unwrap().join("output-turbo-prod.js");
    let output_turbo_server: PathBuf = input.parent().unwrap().join("output-turbo-server.js");
    let output_turbo_server_client_layer = input
        .parent()
        .unwrap()
        .join("output-turbo-server-client-layer.js");
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                true,
                false,
                true,
                false,
                NextDynamicMode::Webpack,
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
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
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
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
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
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
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_server_client_layer,
        Default::default(),
    );
    test_fixture(
        syntax(),
        &|_tr| {
            next_dynamic(
                true,
                false,
                true,
                false,
                NextDynamicMode::Turbopack {
                    dynamic_client_transition_name: atom!("next-client-dynamic"),
                    dynamic_transition_name: atom!("next-dynamic"),
                },
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_turbo_dev,
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
                NextDynamicMode::Turbopack {
                    dynamic_client_transition_name: atom!("next-client-dynamic"),
                    dynamic_transition_name: atom!("next-dynamic"),
                },
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_turbo_prod,
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
                NextDynamicMode::Turbopack {
                    dynamic_client_transition_name: atom!("next-client-dynamic"),
                    dynamic_transition_name: atom!("next-dynamic"),
                },
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_turbo_server,
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
                NextDynamicMode::Turbopack {
                    dynamic_client_transition_name: atom!("next-client-dynamic"),
                    dynamic_transition_name: atom!("next-dynamic"),
                },
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
                Some("/some-project/src".into()),
            )
        },
        &input,
        &output_turbo_server_client_layer,
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
                swc_core::ecma::transforms::react::Options {
                    next: false.into(),
                    runtime: None,
                    import_source: Some("".into()),
                    pragma: Some(Arc::new("__jsx".into())),
                    pragma_frag: Some(Arc::new("__jsxFrag".into())),
                    throw_if_namespace: false.into(),
                    development: false.into(),
                    refresh: Default::default(),
                    ..Default::default()
                },
                top_level_mark,
                unresolved_mark,
            );
            (
                resolver(unresolved_mark, top_level_mark, true),
                next_ssg(Default::default()),
                jsx,
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
            let config = swc_relay::Config {
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

#[fixture("tests/fixture/react-server-components/**/input.ts")]
fn react_server_components_typescript(input: PathBuf) {
    use next_custom_transforms::transforms::react_server_components::{Config, Options};
    let output = input.parent().unwrap().join("output.ts");
    test_fixture(
        Syntax::Typescript(Default::default()),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
                Config::WithOptions(Options {
                    is_react_server_layer: true,
                    dynamic_io_enabled: false,
                    use_cache_enabled: false,
                }),
                tr.comments.as_ref().clone(),
                None,
            )
        },
        &input,
        &output,
        FixtureTestConfig {
            module: Some(true),
            ..Default::default()
        },
    );
}

#[fixture("tests/fixture/react-server-components/**/input.js")]
fn react_server_components_fixture(input: PathBuf) {
    use next_custom_transforms::transforms::react_server_components::{Config, Options};
    let is_react_server_layer = input.iter().any(|s| s.to_str() == Some("server-graph"));
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|tr| {
            server_components(
                FileName::Real(PathBuf::from("/some-project/src/some-file.js")).into(),
                Config::WithOptions(Options {
                    is_react_server_layer,
                    dynamic_io_enabled: false,
                    use_cache_enabled: false,
                }),
                tr.comments.as_ref().clone(),
                None,
            )
        },
        &input,
        &output,
        FixtureTestConfig {
            module: Some(true),
            ..Default::default()
        },
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

#[fixture("tests/fixture/server-actions/**/input.js")]
fn server_actions_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    let is_react_server_layer = input.iter().any(|s| s.to_str() == Some("server-graph"));
    test_fixture(
        syntax(),
        &|_tr| {
            (
                resolver(Mark::new(), Mark::new(), false),
                server_actions(
                    &FileName::Real("/app/item.js".into()),
                    server_actions::Config {
                        is_react_server_layer,
                        use_cache_enabled: true,
                        hash_salt: "".into(),
                        cache_kinds: FxHashSet::from_iter(["x".into()]),
                    },
                    _tr.comments.as_ref().clone(),
                    Default::default(),
                ),
            )
        },
        &input,
        &output,
        FixtureTestConfig {
            module: Some(true),
            ..Default::default()
        },
    );
}

#[fixture("tests/fixture/next-font-with-directive/**/input.js")]
fn next_font_with_directive_fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            (
                resolver(Mark::new(), Mark::new(), false),
                next_font_loaders(FontLoaderConfig {
                    relative_file_path_from_root: "app/test.tsx".into(),
                    font_loaders: vec!["@next/font/google".into()],
                }),
                server_actions(
                    &FileName::Real("/app/test.tsx".into()),
                    server_actions::Config {
                        is_react_server_layer: true,
                        use_cache_enabled: true,
                        hash_salt: "".into(),
                        cache_kinds: FxHashSet::default(),
                    },
                    _tr.comments.as_ref().clone(),
                    Default::default(),
                ),
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

            (
                resolver(unresolved_mark, top_level_mark, false),
                visit_mut_pass(cjs_optimizer(
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
                        "#,
                    ),
                    unresolved_ctxt,
                )),
            )
        },
        &input,
        &output,
        FixtureTestConfig {
            module: Some(true),
            ..Default::default()
        },
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

            (
                resolver(unresolved_mark, top_level_mark, false),
                named_import_transform(json(
                    r#"
                    {
                        "packages": ["foo", "bar"]
                    }
                    "#,
                )),
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

            (
                resolver(unresolved_mark, top_level_mark, false),
                optimize_barrel(json(
                    r#"
                        {
                            "wildcard": false
                        }
                    "#,
                )),
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

            (
                resolver(unresolved_mark, top_level_mark, false),
                optimize_barrel(json(
                    r#"
                        {
                            "wildcard": true
                        }
                    "#,
                )),
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

            (
                resolver(unresolved_mark, top_level_mark, false),
                optimize_server_react(optimize_server_react::Config {
                    optimize_use_state: true,
                }),
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

            (
                resolver(unresolved_mark, top_level_mark, false),
                visit_mut_pass(pure_magic(tr.comments.clone())),
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
                    pragma: Some(Arc::new("__jsx".into())),
                    pragma_frag: Some(Arc::new("__jsxFrag".into())),
                    throw_if_namespace: false.into(),
                    development: false.into(),
                    ..Default::default()
                },
                top_level_mark,
                unresolved_mark,
            );
            (
                swc_core::ecma::transforms::base::resolver(unresolved_mark, top_level_mark, true),
                next_transform_strip_page_exports(mode, Default::default()),
                jsx,
            )
        },
        input,
        output,
        FixtureTestConfig {
            module: Some(true),
            ..Default::default()
        },
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

#[fixture("tests/fixture/debug-fn-name/**/input.js")]
fn test_debug_name(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");

    test_fixture(
        syntax(),
        &|_| {
            let top_level_mark = Mark::fresh(Mark::root());
            let unresolved_mark = Mark::fresh(Mark::root());

            (
                swc_core::ecma::transforms::base::resolver(unresolved_mark, top_level_mark, true),
                debug_fn_name(),
            )
        },
        &input,
        &output,
        Default::default(),
    );
}

#[fixture("tests/fixture/edge-assert/**/input.js")]
fn test_edge_assert(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");

    test_fixture(
        syntax(),
        &|t| {
            let top_level_mark = Mark::fresh(Mark::root());
            let unresolved_mark = Mark::fresh(Mark::root());

            (
                swc_core::ecma::transforms::base::resolver(unresolved_mark, top_level_mark, true),
                lint_to_fold(warn_for_edge_runtime(
                    t.cm.clone(),
                    ExprCtx {
                        is_unresolved_ref_safe: false,
                        unresolved_ctxt: SyntaxContext::empty().apply_mark(unresolved_mark),
                        in_strict: false,
                        remaining_depth: 4,
                    },
                    true,
                    true,
                )),
            )
        },
        &input,
        &output,
        FixtureTestConfig {
            allow_error: true,
            module: Some(true),
            ..Default::default()
        },
    );
}

#[fixture("tests/fixture/source-maps/**/input.js")]
fn test_source_maps(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    test_fixture(
        syntax(),
        &|_tr| {
            (
                resolver(Mark::new(), Mark::new(), false),
                server_actions(
                    &FileName::Real("/app/item.js".into()),
                    server_actions::Config {
                        is_react_server_layer: true,
                        use_cache_enabled: true,
                        hash_salt: "".into(),
                        cache_kinds: FxHashSet::from_iter([]),
                    },
                    _tr.comments.as_ref().clone(),
                    Default::default(),
                ),
            )
        },
        &input,
        &output,
        FixtureTestConfig {
            module: Some(true),
            sourcemap: true,
            ..Default::default()
        },
    );
}

fn lint_to_fold<R>(r: R) -> impl Pass
where
    R: Visit,
{
    visit_pass(r)
}
