use std::{collections::HashMap, sync::Arc};

use anyhow::{Context, Error};
use js_sys::JsString;
use next_custom_transforms::{
    chain_transforms::{custom_before_pass, TransformOptions},
    transforms::page_static_info::{
        build_ast_from_source, collect_exports, collect_rsc_module_info,
        extract_expored_const_values, Const, ExportInfo, RscModuleInfo,
    },
};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use swc_core::common::Mark;
use turbopack_binding::swc::core::{
    base::{config::JsMinifyOptions, try_with_handler, Compiler},
    common::{
        comments::SingleThreadedComments, errors::ColorConfig, FileName, FilePathMapping,
        SourceMap, GLOBALS,
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

/// A regex pattern to determine if get_page_static_info should continue to
/// parse the page or short circuit and return default.
static PAGE_STATIC_INFO_SHORT_CURCUIT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        "runtime|preferredRegion|getStaticProps|getServerSideProps|generateStaticParams|export \
         const",
    )
    .unwrap()
});

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

        let parsed = if let Ok(parsed) = build_ast_from_source(&page_contents, &page_file_path) {
            parsed
        } else {
            return Ok(JsValue::null());
        };

        let (source_ast, _) = parsed;
        collect_exports(&source_ast)
            .map(|exports_info| {
                exports_info
                    .map(|exports_info| {
                        JsValue::from(
                            !exports_info.generate_image_metadata.unwrap_or_default()
                                || !exports_info.generate_sitemaps.unwrap_or_default(),
                        )
                    })
                    .unwrap_or_default()
            })
            .map_err(|e| JsValue::from_str(format!("{:?}", e).as_str()))
    })
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticPageInfo {
    pub exports_info: Option<ExportInfo>,
    pub extracted_values: HashMap<String, serde_json::Value>,
    pub rsc_info: Option<RscModuleInfo>,
    pub warnings: Vec<String>,
}

#[wasm_bindgen(js_name = "getPageStaticInfo")]
pub fn get_page_static_info(page_file_path: String, page_contents: String) -> js_sys::Promise {
    future_to_promise(async move {
        if !PAGE_STATIC_INFO_SHORT_CURCUIT.is_match(&page_contents) {
            return Ok(JsValue::null());
        }

        let parsed = if let Ok(parsed) = build_ast_from_source(&page_contents, &page_file_path) {
            parsed
        } else {
            return Ok(JsValue::null());
        };

        let (source_ast, comments) = parsed;
        let exports_info = collect_exports(&source_ast)
            .map_err(|e| JsValue::from_str(format!("{:?}", e).as_str()))?;

        match exports_info {
            None => Ok(JsValue::null()),
            Some(exports_info) => {
                let rsc_info = collect_rsc_module_info(&comments, true);

                let mut properties_to_extract = exports_info.extra_properties.clone();
                properties_to_extract.insert("config".to_string());

                let mut exported_const_values =
                    extract_expored_const_values(&source_ast, properties_to_extract);

                let mut extracted_values = HashMap::new();
                let mut warnings = vec![];

                for (key, value) in exported_const_values.drain() {
                    match value {
                        Some(Const::Value(v)) => {
                            extracted_values.insert(key.clone(), v);
                        }
                        Some(Const::Unsupported(msg)) => {
                            warnings.push(msg);
                        }
                        _ => {}
                    }
                }

                let ret = StaticPageInfo {
                    exports_info: Some(exports_info),
                    extracted_values,
                    rsc_info: Some(rsc_info),
                    warnings,
                };

                let s = serde_json::to_string(&ret)
                    .map(|s| JsValue::from_str(&s))
                    .unwrap_or(JsValue::null());

                Ok(s)
            }
        }
    })
}

/// Get global sourcemap
fn compiler() -> Arc<Compiler> {
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    Arc::new(Compiler::new(cm))
}
