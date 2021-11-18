use next_swc::disallow_re_export_all_in_page::disallow_re_export_all_in_page;
use std::fs::read_to_string;
use std::path::{Path, PathBuf};
use swc::Compiler;
use swc_ecmascript::visit::Fold;
use swc_ecmascript::{
    parser::{Syntax, TsConfig},
    transforms::pass::noop,
};
use testing::{fixture, run_test};

#[fixture("tests/errors/re-export-all-in-page/**/input.js")]
fn re_export_all_in_page(input: PathBuf) {
    test_stderr(&input, disallow_re_export_all_in_page(true));
}

#[allow(unused_must_use)]
fn test_stderr(input: &Path, transform: impl Fold) {
    let res = run_test(false, |cm, handler| {
        let c = Compiler::new(cm.clone());
        let fm = cm.load_file(input).expect("Failed to load input file");

        let option = swc::config::Options {
            swcrc: true,
            is_module: true,
            output_path: None,
            config: swc::config::Config {
                jsc: swc::config::JscConfig {
                    minify: None,
                    syntax: Some(Syntax::Typescript(TsConfig {
                        tsx: true,
                        dynamic_import: true,
                        ..Default::default()
                    })),
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        };

        c.process_js_with_custom_pass(
            fm.clone(),
            None,
            &handler,
            &option,
            |_| transform,
            |_| noop(),
        );

        // Always return Err to make run_test return errors emitted by HANDLER
        Err(()) as Result<(), ()>
    })
    .unwrap_err();

    let output = read_to_string(input.parent().unwrap().join("output.txt"))
        .expect("Failed to read output file");
    assert_eq!(res.to_string(), output);
}
