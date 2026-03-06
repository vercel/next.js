use napi::{CallContext, JsObject, JsUnknown};
use napi_derive::{js_function, module_exports, napi};
use next_core::next_config::lightningcss_feature_names_to_mask;

#[allow(clippy::not_unsafe_ptr_arg_deref)]
#[js_function(1)]
fn transform(ctx: CallContext) -> napi::Result<JsUnknown> {
    lightningcss_napi::transform(ctx)
}

#[allow(clippy::not_unsafe_ptr_arg_deref)]
#[js_function(1)]
fn transform_style_attribute(ctx: CallContext) -> napi::Result<JsUnknown> {
    lightningcss_napi::transform_style_attribute(ctx)
}

/// Convert an array of dash-case feature name strings to a lightningcss
/// `Features` bitmask (u32). Called from the webpack lightningcss-loader to
/// avoid duplicating the name-to-bit mapping in JavaScript.
#[napi]
#[allow(dead_code)]
fn lightningcss_feature_names_to_mask_napi(names: Vec<String>) -> napi::Result<u32> {
    lightningcss_feature_names_to_mask(&names)
        .map_err(|e| napi::Error::from_reason(format!("{}", e)))
}

#[cfg_attr(not(target_arch = "wasm32"), module_exports)]
fn init(mut exports: JsObject) -> napi::Result<()> {
    exports.create_named_method("lightningCssTransform", transform)?;
    exports.create_named_method(
        "lightningCssTransformStyleAttribute",
        transform_style_attribute,
    )?;

    Ok(())
}
