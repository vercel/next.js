#![feature(impl_trait_in_bindings)]

mod config_shared;
mod handle_externals;
mod next_externals_plugin;

use napi::bindgen_prelude::*;
use rspack_binding_builder_macros::register_plugin;
use rspack_core::BoxPlugin;
use rspack_regex::RspackRegex;
use rustc_hash::FxHashMap;

use crate::{
    config_shared::{EsmExternalsConfig, ExperimentalConfig, NextConfigComplete},
    next_externals_plugin::{NextExternalsPlugin, NextExternalsPluginOptions},
};

#[macro_use]
extern crate napi_derive;
extern crate rspack_binding_builder;

#[derive(Debug)]
#[napi(object, object_to_js = false)]
pub struct NapiExperimentalConfig {
    pub esm_externals: Option<Either<String, bool>>,
}

impl From<NapiExperimentalConfig> for ExperimentalConfig {
    fn from(value: NapiExperimentalConfig) -> Self {
        ExperimentalConfig {
            esm_externals: match value.esm_externals {
                Some(esm_externals) => match esm_externals {
                    Either::A(s) => {
                        if s == "loose" {
                            EsmExternalsConfig::Loose
                        } else {
                            EsmExternalsConfig::Strict
                        }
                    }
                    Either::B(b) => {
                        if b {
                            EsmExternalsConfig::Strict
                        } else {
                            EsmExternalsConfig::None
                        }
                    }
                },
                None => EsmExternalsConfig::None,
            },
        }
    }
}

#[derive(Debug)]
#[napi(object, object_to_js = false)]
pub struct NapiNextConfigComplete {
    pub experimental: NapiExperimentalConfig,
    pub bundle_pages_router_dependencies: Option<bool>,
}

impl From<NapiNextConfigComplete> for NextConfigComplete {
    fn from(value: NapiNextConfigComplete) -> Self {
        let NapiNextConfigComplete {
            experimental,
            bundle_pages_router_dependencies,
        } = value;
        NextConfigComplete {
            experimental: experimental.into(),
            bundle_pages_router_dependencies,
        }
    }
}

#[derive(Debug)]
#[napi(object, object_to_js = false)]
pub struct NapiNextExternalsPluginOptions {
    pub compiler_type: String,
    pub config: NapiNextConfigComplete,
    #[napi(ts_type = "RegExp")]
    pub opt_out_bundling_package_regex: RspackRegex,
    pub final_transpile_packages: Vec<String>,
    pub dir: String,
    #[napi(ts_type = "Record<string, string>")]
    pub default_overrides: FxHashMap<String, String>,
}

impl From<NapiNextExternalsPluginOptions> for NextExternalsPluginOptions {
    fn from(value: NapiNextExternalsPluginOptions) -> Self {
        let NapiNextExternalsPluginOptions {
            compiler_type,
            config,
            opt_out_bundling_package_regex,
            final_transpile_packages,
            dir,
            default_overrides,
        } = value;
        NextExternalsPluginOptions {
            compiler_type,
            config: config.into(),
            opt_out_bundling_package_regex,
            final_transpile_packages,
            dir,
            default_overrides,
        }
    }
}

register_plugin!("NextExternalsPlugin", |env: Env, object: Unknown<'_>| {
    let napi_options: NapiNextExternalsPluginOptions =
        unsafe { FromNapiValue::from_napi_value(env.raw(), object.raw())? };
    Ok(Box::new(NextExternalsPlugin::new(napi_options.into())) as BoxPlugin)
});
