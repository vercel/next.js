use napi::{CallContext, JsObject, JsUnknown};
use napi_derive::{js_function, module_exports};

#[js_function(1)]
fn transform(ctx: CallContext) -> napi::Result<JsUnknown> {
    lightningcss_napi::transform(ctx)
}

#[js_function(1)]
fn transform_style_attribute(ctx: CallContext) -> napi::Result<JsUnknown> {
    lightningcss_napi::transform_style_attribute(ctx)
}

#[js_function(1)]
pub fn bundle(ctx: CallContext) -> napi::Result<JsUnknown> {
    lightningcss_napi::bundle(ctx)
}

#[cfg(not(target_arch = "wasm32"))]
#[js_function(1)]
pub fn bundle_async(ctx: CallContext) -> napi::Result<JsObject> {
    lightningcss_napi::bundle_async(ctx)
}

#[cfg_attr(not(target_arch = "wasm32"), module_exports)]
fn init(mut exports: JsObject) -> napi::Result<()> {
    exports.create_named_method("lightningCssTransform", transform)?;
    exports.create_named_method(
        "lightningCssTransformStyleAttribute",
        transform_style_attribute,
    )?;
    exports.create_named_method("lightningCssTransformBundleSync", bundle)?;
    #[cfg(not(target_arch = "wasm32"))]
    {
        exports.create_named_method("lightningCssTransformBundle", bundle_async)?;
    }

    Ok(())
}
