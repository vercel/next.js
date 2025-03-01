use std::path::{Path, PathBuf};

use next_custom_transforms::chain_transforms::{custom_before_pass, TransformOptions};
use serde::de::DeserializeOwned;
use swc_core::{
    base::Compiler,
    common::{comments::SingleThreadedComments, Mark},
    ecma::{
        ast::noop_pass,
        parser::{Syntax, TsSyntax},
    },
};
use testing::{NormalizedOutput, Tester};

#[testing::fixture("tests/full/**/input.js")]
fn full(input: PathBuf) {
    test(&input, true);
}

#[testing::fixture("tests/loader/**/input.js")]
fn loader(input: PathBuf) {
    test(&input, false);
}

fn test(input: &Path, minify: bool) {
    let output = input.parent().unwrap().join("output.js");

    Tester::new()
        .print_errors(|cm, handler| {
            let c = Compiler::new(cm.clone());

            let fm = cm.load_file(input).expect("failed to load file");

            let options = TransformOptions {
                lint_codemod_comments: true,
                swc: swc_core::base::config::Options {
                    swcrc: true,
                    output_path: Some(output.clone()),

                    config: swc_core::base::config::Config {
                        is_module: Some(swc_core::base::config::IsModule::Bool(true)),

                        jsc: swc_core::base::config::JscConfig {
                            minify: if minify {
                                Some(assert_json("{ \"compress\": true, \"mangle\": true }"))
                            } else {
                                None
                            },
                            syntax: Some(Syntax::Typescript(TsSyntax {
                                tsx: true,
                                ..Default::default()
                            })),
                            external_helpers: true.into(),
                            ..Default::default()
                        },
                        ..Default::default()
                    },
                    ..Default::default()
                },
                disable_next_ssg: false,
                disable_page_config: false,
                pages_dir: None,
                is_page_file: false,
                is_development: true,
                is_server_compiler: false,
                server_components: None,
                styled_components: Some(assert_json("{}")),
                styled_jsx: assert_json("{}"),
                remove_console: None,
                react_remove_properties: None,
                relay: None,
                shake_exports: None,
                emotion: Some(assert_json("{}")),
                modularize_imports: None,
                font_loaders: None,
                app_dir: None,
                server_actions: None,
                cjs_require_optimizer: None,
                auto_modularize_imports: None,
                optimize_barrel_exports: None,
                optimize_server_react: None,
                prefer_esm: false,
                debug_function_name: false,
            };

            let unresolved_mark = Mark::new();
            let mut options = options.patch(&fm);
            options.swc.unresolved_mark = Some(unresolved_mark);

            let comments = SingleThreadedComments::default();
            match c.process_js_with_custom_pass(
                fm.clone(),
                None,
                &handler,
                &options.swc,
                comments.clone(),
                |_| {
                    custom_before_pass(
                        cm.clone(),
                        fm.clone(),
                        &options,
                        comments.clone(),
                        Default::default(),
                        unresolved_mark,
                        Default::default(),
                    )
                },
                |_| noop_pass(),
            ) {
                Ok(v) => {
                    NormalizedOutput::from(v.code)
                        .compare_to_file(output)
                        .unwrap();
                }
                Err(err) => panic!("Error: {:?}", err),
            };

            Ok(())
        })
        .map(|_| ())
        .expect("failed");
}

/// Using this, we don't have to break code by adding field.s
fn assert_json<T>(json_str: &str) -> T
where
    T: DeserializeOwned,
{
    serde_json::from_str(json_str).expect("failed to deserialize")
}
