use std::{fmt::Debug, sync::Arc};

use anyhow::Context;
use js_sys::JsString;
use next_custom_transforms::chain_transforms::{custom_before_pass, TransformOptions};
use rustc_hash::FxHashMap;
use swc_core::{
    base::{
        config::{JsMinifyOptions, ParseOptions},
        try_with_handler, Compiler,
    },
    common::{
        comments::{Comments, SingleThreadedComments},
        errors::ColorConfig,
        FileName, FilePathMapping, Mark, SourceMap, GLOBALS,
    },
    ecma::ast::noop_pass,
};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

pub mod mdx;

fn convert_err(err: impl Debug) -> JsError {
    JsError::new(&format!("{err:?}"))
}

#[wasm_bindgen(js_name = "minifySync")]
pub fn minify_sync(s: JsString, opts: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let c = compiler();

    let opts: JsMinifyOptions = serde_wasm_bindgen::from_value(opts)?;

    let value = try_with_handler(
        c.cm.clone(),
        swc_core::base::HandlerOpts {
            color: ColorConfig::Never,
            skip_filename: false,
        },
        |handler| {
            GLOBALS.set(&Default::default(), || {
                let fm = c.cm.new_source_file(FileName::Anon.into(), String::from(s));
                let program = c
                    .minify(fm, handler, &opts, Default::default())
                    .context("failed to minify file")?;

                Ok(program)
            })
        },
    )
    .map_err(|e| e.to_pretty_error())
    .map_err(convert_err)?;

    Ok(serde_wasm_bindgen::to_value(&value)?)
}

#[wasm_bindgen(js_name = "minify")]
pub fn minify(s: JsString, opts: JsValue) -> js_sys::Promise {
    // TODO: This'll be properly scheduled once wasm have standard backed thread
    // support.
    future_to_promise(async { minify_sync(s, opts) })
}

#[wasm_bindgen(js_name = "transformSync")]
pub fn transform_sync(s: JsValue, opts: JsValue) -> Result<JsValue, JsError> {
    console_error_panic_hook::set_once();

    let c = compiler();
    let mut opts: TransformOptions = serde_wasm_bindgen::from_value(opts)?;

    let s = s.dyn_into::<js_sys::JsString>();
    let out = try_with_handler(
        c.cm.clone(),
        swc_core::base::HandlerOpts {
            color: ColorConfig::Never,
            skip_filename: false,
        },
        |handler| {
            GLOBALS.set(&Default::default(), || {
                let unresolved_mark = Mark::new();
                opts.swc.unresolved_mark = Some(unresolved_mark);

                let out = match s {
                    Ok(s) => {
                        let fm = c.cm.new_source_file(
                            if opts.swc.filename.is_empty() {
                                FileName::Anon.into()
                            } else {
                                FileName::Real(opts.swc.filename.clone().into()).into()
                            },
                            String::from(s),
                        );
                        let cm = c.cm.clone();
                        let file = fm.clone();
                        let comments = SingleThreadedComments::default();
                        c.process_js_with_custom_pass(
                            fm,
                            None,
                            handler,
                            &opts.swc,
                            comments.clone(),
                            |_| {
                                custom_before_pass(
                                    cm,
                                    file,
                                    &opts,
                                    comments.clone(),
                                    Default::default(),
                                    unresolved_mark,
                                    Default::default(),
                                )
                            },
                            |_| noop_pass(),
                        )
                        .context("failed to process js file")?
                    }
                    Err(v) => c.process_js(
                        handler,
                        serde_wasm_bindgen::from_value(v).expect(""),
                        &opts.swc,
                    )?,
                };

                Ok(out)
            })
        },
    )
    .map_err(|e| e.to_pretty_error())
    .map_err(convert_err)?;

    Ok(serde_wasm_bindgen::to_value(&out)?)
}

#[wasm_bindgen(js_name = "transform")]
pub fn transform(s: JsValue, opts: JsValue) -> js_sys::Promise {
    // TODO: This'll be properly scheduled once wasm have standard backed thread
    // support.
    future_to_promise(async { Ok(transform_sync(s, opts)?) })
}

#[wasm_bindgen(js_name = "parseSync")]
pub fn parse_sync(s: JsString, opts: JsValue) -> Result<JsValue, JsError> {
    console_error_panic_hook::set_once();

    let c = swc_core::base::Compiler::new(Arc::new(SourceMap::new(FilePathMapping::empty())));
    let opts: ParseOptions = serde_wasm_bindgen::from_value(opts)?;

    try_with_handler(
        c.cm.clone(),
        swc_core::base::HandlerOpts {
            ..Default::default()
        },
        |handler| {
            c.run(|| {
                GLOBALS.set(&Default::default(), || {
                    let fm = c.cm.new_source_file(FileName::Anon.into(), String::from(s));

                    let cmts = c.comments().clone();
                    let comments = if opts.comments {
                        Some(&cmts as &dyn Comments)
                    } else {
                        None
                    };

                    let program = c
                        .parse_js(
                            fm,
                            handler,
                            opts.target,
                            opts.syntax,
                            opts.is_module,
                            comments,
                        )
                        .context("failed to parse code")?;

                    let s = serde_json::to_string(&program).unwrap();
                    Ok(JsValue::from_str(&s))
                })
            })
        },
    )
    .map_err(|e| e.to_pretty_error())
    .map_err(convert_err)
}

#[wasm_bindgen(js_name = "parse")]
pub fn parse(s: JsString, opts: JsValue) -> js_sys::Promise {
    // TODO: This'll be properly scheduled once wasm have standard backed thread
    // support.
    future_to_promise(async { Ok(parse_sync(s, opts)?) })
}

/// Get global sourcemap
fn compiler() -> Arc<Compiler> {
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    Arc::new(Compiler::new(cm))
}

#[wasm_bindgen(js_name = "expandNextJsTemplate")]
pub fn expand_next_js_template(
    content: Box<[u8]>,
    template_path: &str,
    next_package_dir_path: &str,
    replacements: JsValue,
    injections: JsValue,
    imports: JsValue,
) -> Result<String, JsError> {
    next_taskless::expand_next_js_template(
        str::from_utf8(&content).map_err(convert_err)?,
        template_path,
        next_package_dir_path,
        serde_wasm_bindgen::from_value::<FxHashMap<String, String>>(replacements)?
            .iter()
            .map(|(k, v)| (&**k, &**v)),
        serde_wasm_bindgen::from_value::<FxHashMap<String, String>>(injections)?
            .iter()
            .map(|(k, v)| (&**k, &**v)),
        serde_wasm_bindgen::from_value::<FxHashMap<String, Option<String>>>(imports)?
            .iter()
            .map(|(k, v)| (&**k, v.as_deref())),
    )
    .map_err(convert_err)
}
