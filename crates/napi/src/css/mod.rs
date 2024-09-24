use napi::{CallContext, JsObject, JsUnknown};
use napi_derive::{js_function, module_exports};

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

#[cfg_attr(not(target_arch = "wasm32"), module_exports)]
fn init(mut exports: JsObject) -> napi::Result<()> {
    exports.create_named_method("lightningCssTransform", transform)?;
    exports.create_named_method(
        "lightningCssTransformStyleAttribute",
        transform_style_attribute,
    )?;

    Ok(())
}
