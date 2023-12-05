use std::sync::Arc;

use anyhow::{Context, Error};
use js_sys::JsString;
use next_custom_transforms::chain_transforms::{custom_before_pass, TransformOptions};
use next_page_static_info::collect_exports;
use once_cell::sync::Lazy;
use regex::Regex;
use swc_core::common::Mark;
use turbopack_binding::swc::core::{
    base::{
        config::{JsMinifyOptions, ParseOptions},
        try_with_handler, Compiler,
    },
    common::{
        comments::{Comments, SingleThreadedComments},
        errors::ColorConfig,
        FileName, FilePathMapping, SourceMap, GLOBALS,
    },
    ecma::transforms::base::pass::noop,
};
use wasm_bindgen::{prelude::*, JsCast};
use wasm_bindgen_futures::future_to_promise;

pub mod mdx;

/// A regex pattern to determine if is_dynamic_metadata_route should continue to
/// parse the page or short circuit and return false.
static DYNAMIC_METADATA_ROUTE_SHORT_CURCUIT: Lazy<Regex> =
    Lazy::new(|| Regex::new("generateImageMetadata|generateSitemaps").unwrap());

fn convert_err(err: Error) -> JsValue {
    format!("{:?}", err).into()
}

#[wasm_bindgen(js_name = "minifySync")]
pub fn minify_sync(s: JsString, opts: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let c = compiler();

    let opts: JsMinifyOptions = serde_wasm_bindgen::from_value(opts)?;

    let value = try_with_handler(
        c.cm.clone(),
        turbopack_binding::swc::core::base::HandlerOpts {
            color: ColorConfig::Never,
            skip_filename: false,
        },
        |handler| {
            GLOBALS.set(&Default::default(), || {
                let fm = c.cm.new_source_file(FileName::Anon, s.into());
                let program = c
                    .minify(fm, handler, &opts)
                    .context("failed to minify file")?;

                Ok(program)
            })
        },
    )
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
pub fn transform_sync(s: JsValue, opts: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let c = compiler();
    let mut opts: TransformOptions = serde_wasm_bindgen::from_value(opts)?;

    let s = s.dyn_into::<js_sys::JsString>();
    let out = try_with_handler(
        c.cm.clone(),
        turbopack_binding::swc::core::base::HandlerOpts {
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
                                FileName::Anon
                            } else {
                                FileName::Real(opts.swc.filename.clone().into())
                            },
                            s.into(),
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
                                )
                            },
                            |_| noop(),
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
    .map_err(convert_err)?;

    Ok(serde_wasm_bindgen::to_value(&out)?)
}

#[wasm_bindgen(js_name = "transform")]
pub fn transform(s: JsValue, opts: JsValue) -> js_sys::Promise {
    // TODO: This'll be properly scheduled once wasm have standard backed thread
    // support.
    future_to_promise(async { transform_sync(s, opts) })
}

#[wasm_bindgen(js_name = "parseSync")]
pub fn parse_sync(s: JsString, opts: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let c = turbopack_binding::swc::core::base::Compiler::new(Arc::new(SourceMap::new(
        FilePathMapping::empty(),
    )));
    let opts: ParseOptions = serde_wasm_bindgen::from_value(opts)?;

    try_with_handler(
        c.cm.clone(),
        turbopack_binding::swc::core::base::HandlerOpts {
            ..Default::default()
        },
        |handler| {
            c.run(|| {
                GLOBALS.set(&Default::default(), || {
                    let fm = c.cm.new_source_file(FileName::Anon, s.into());

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
    .map_err(convert_err)
}

#[wasm_bindgen(js_name = "parse")]
pub fn parse(s: JsString, opts: JsValue) -> js_sys::Promise {
    // TODO: This'll be properly scheduled once wasm have standard backed thread
    // support.
    future_to_promise(async { parse_sync(s, opts) })
}

/// Detect if metadata routes is a dynamic route, which containing
/// generateImageMetadata or generateSitemaps as export
/// Unlike native bindings, caller should provide the contents of the pages
/// sine our wasm bindings does not have access to the file system
#[wasm_bindgen(js_name = "isDynamicMetadataRoute")]
pub fn is_dynamic_metadata_route(page_file_path: String, page_contents: String) -> js_sys::Promise {
    // Returning promise to conform existing interfaces
    future_to_promise(async move {
        if !DYNAMIC_METADATA_ROUTE_SHORT_CURCUIT.is_match(&page_contents) {
            return Ok(JsValue::from(false));
        }

        collect_exports(&page_contents, &page_file_path)
            .map(|exports_info| {
                JsValue::from(
                    !exports_info.generate_image_metadata.unwrap_or_default()
                        || !exports_info.generate_sitemaps.unwrap_or_default(),
                )
            })
            .map_err(|e| JsValue::from_str(format!("{:?}", e).as_str()))
    })
}

/// Get global sourcemap
fn compiler() -> Arc<Compiler> {
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    Arc::new(Compiler::new(cm))
}
