use napi::{Env, bindgen_prelude::Object};
use napi_derive::napi;
use next_core::next_config::lightningcss_feature_names_to_mask;

#[napi(js_name = "lightningCssTransform")]
#[allow(dead_code)]
pub fn transform<'env>(
    env: &'env Env,
    opts: Object<'_>,
) -> napi::Result<napi::bindgen_prelude::Unknown<'env>> {
    turbopack_lightningcss_napi::transform(env, opts)
}

#[napi(js_name = "lightningCssTransformStyleAttribute")]
#[allow(dead_code)]
pub fn transform_style_attribute<'env>(
    env: &'env Env,
    opts: Object<'_>,
) -> napi::Result<napi::bindgen_prelude::Unknown<'env>> {
    turbopack_lightningcss_napi::transform_style_attribute(env, opts)
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
