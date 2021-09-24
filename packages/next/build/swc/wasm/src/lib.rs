use anyhow::{Context, Error};
use next_swc_core::{
    amp_attributes::amp_attributes, hook_optimizer::hook_optimizer, next_dynamic::next_dynamic,
    next_ssg::next_ssg, styled_jsx::styled_jsx,
};
use once_cell::sync::Lazy;
use serde::Deserialize;
use std::{path::PathBuf, sync::Arc};
use swc::{ecmascript::transforms::pass::noop, try_with_handler, Compiler};
use swc_common::{chain, pass::Optional, FileName, FilePathMapping, SourceMap};
use utils::set_panic_hook;
use wasm_bindgen::prelude::*;

mod utils;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformOptions {
    #[serde(flatten)]
    pub swc: swc::config::Options,

    #[serde(default)]
    pub disable_next_ssg: bool,

    #[serde(default)]
    pub pages_dir: Option<PathBuf>,
}

fn convert_err(err: Error) -> JsValue {
    format!("{:?}", err).into()
}

#[wasm_bindgen(js_name = "transformSync")]
pub fn transform_sync(s: &str, opts: JsValue) -> Result<JsValue, JsValue> {
    set_panic_hook();

    let c = compiler();

    try_with_handler(c.cm.clone(), |handler| {
        let options: TransformOptions = opts.into_serde().context("failed to parse options")?;

        let filename = if options.swc.filename.is_empty() {
            FileName::Anon
        } else {
            FileName::Real(options.swc.filename.clone().into())
        };

        let fm = c.cm.new_source_file(filename.clone(), s.into());

        let before_pass = chain!(
            hook_optimizer(),
            Optional::new(next_ssg(), !options.disable_next_ssg),
            amp_attributes(),
            next_dynamic(filename, options.pages_dir.clone()),
            styled_jsx()
        );
        let out = c
            .process_js_with_custom_pass(fm, &handler, &options.swc, before_pass, noop())
            .context("failed to process js file")?;

        Ok(JsValue::from_serde(&out).context("failed to serialize json")?)
    })
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
