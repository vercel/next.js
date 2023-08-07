use js_sys::JsString;
use turbopack_binding::features::mdxjs::{compile, Options};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

#[wasm_bindgen(js_name = "mdxCompileSync")]
pub fn mdx_compile_sync(value: JsString, opts: JsValue) -> Result<JsValue, JsValue> {
    let value: String = value.into();
    let option: Options = serde_wasm_bindgen::from_value(opts)?;

    compile(value.as_str(), &option)
        .map(|v| serde_wasm_bindgen::to_value(&v).expect("Should able to convert to JsValue"))
        .map_err(|v| serde_wasm_bindgen::to_value(&v).expect("Should able to convert to JsValue"))
}

#[wasm_bindgen(js_name = "mdxCompile")]
pub fn mdx_compile(value: JsString, opts: JsValue) -> js_sys::Promise {
    // TODO: This'll be properly scheduled once wasm have standard backed thread
    // support.
    future_to_promise(async { mdx_compile_sync(value, opts) })
}
