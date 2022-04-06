use anyhow::{Context, Error};
use next_swc::{custom_before_pass, TransformOptions};
use once_cell::sync::Lazy;
use std::sync::Arc;
use swc::{config::JsMinifyOptions, try_with_handler, Compiler};
use swc_common::{errors::ColorConfig, FileName, FilePathMapping, SourceMap};
use swc_ecmascript::transforms::pass::noop;
use wasm_bindgen::prelude::*;

fn convert_err(err: Error) -> JsValue {
    format!("{:?}", err).into()
}

#[wasm_bindgen(js_name = "minifySync")]
pub fn minify_sync(s: &str, opts: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let c = compiler();

    try_with_handler(
        c.cm.clone(),
        swc::HandlerOpts {
            color: ColorConfig::Never,
            skip_filename: false,
        },
        |handler| {
            let opts: JsMinifyOptions = opts.into_serde().context("failed to parse options")?;

            let fm = c.cm.new_source_file(FileName::Anon, s.into());
            let program = c
                .minify(fm, handler, &opts)
                .context("failed to minify file")?;

            JsValue::from_serde(&program).context("failed to serialize json")
        },
    )
    .map_err(convert_err)
}

#[wasm_bindgen(js_name = "transformSync")]
pub fn transform_sync(s: &str, opts: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let c = compiler();

    try_with_handler(
        c.cm.clone(),
        swc::HandlerOpts {
            color: ColorConfig::Never,
            skip_filename: false,
        },
        |handler| {
            let opts: TransformOptions = opts.into_serde().context("failed to parse options")?;

            let fm = c.cm.new_source_file(
                if opts.swc.filename.is_empty() {
                    FileName::Anon
                } else {
                    FileName::Real(opts.swc.filename.clone().into())
                },
                s.into(),
            );
            let cm = c.cm.clone();
            let file = fm.clone();
            let out = c
                .process_js_with_custom_pass(
                    fm,
                    None,
                    handler,
                    &opts.swc,
                    |_, comments| {
                        custom_before_pass(cm, file, &opts, comments.clone(), Default::default())
                    },
                    |_, _| noop(),
                )
                .context("failed to process js file")?;

            JsValue::from_serde(&out).context("failed to serialize json")
        },
    )
    .map_err(convert_err)
}

/// Get global sourcemap
fn compiler() -> Arc<Compiler> {
    static C: Lazy<Arc<Compiler>> = Lazy::new(|| {
        let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

        Arc::new(Compiler::new(cm))
    });

    C.clone()
}
