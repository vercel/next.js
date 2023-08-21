use std::{
    convert::{TryFrom, TryInto},
    path::PathBuf,
};

use anyhow::Context;
use napi::bindgen_prelude::*;
use next_build::{
    build as turbo_next_build, build_options::BuildContext, BuildOptions as NextBuildOptions,
};
use next_core::next_config::{Rewrite, Rewrites, RouteHas};
use next_dev::{devserver_options::DevServerOptions, start_server};

use crate::util::MapErr;

#[napi]
pub async fn start_turbo_dev(options: Buffer) -> napi::Result<()> {
    let options: DevServerOptions = serde_json::from_slice(&options)?;
    start_server(&options).await.convert_err()
}

#[napi(object, object_to_js = false)]
#[derive(Debug)]
pub struct NextBuildContext {
    // Added by Next.js for next build --turbo specifically.
    /// The root directory of the workspace.
    pub root: Option<String>,

    /// The project's directory.
    pub dir: Option<String>,

    /// The build ID.
    pub build_id: Option<String>,

    /// The rewrites, as computed by Next.js.
    pub rewrites: Option<NapiRewrites>,
    // TODO(alexkirsz) These are detected directly by Turbopack for now.
    // pub app_dir: Option<String>,
    // pub pages_dir: Option<String>,
    // TODO(alexkirsz) These are used to generate route types.
    // pub original_rewrites: Option<Rewrites>,
    // pub original_redirects: Option<Vec<Redirect>>,
}

impl TryFrom<NextBuildContext> for NextBuildOptions {
    type Error = napi::Error;

    fn try_from(value: NextBuildContext) -> Result<Self> {
        Ok(Self {
            dir: value.dir.map(PathBuf::try_from).transpose()?,
            root: value.root.map(PathBuf::try_from).transpose()?,
            log_level: None,
            show_all: true,
            log_detail: true,
            full_stats: true,
            memory_limit: None,
            build_context: Some(BuildContext {
                build_id: value
                    .build_id
                    .context("NextBuildContext must provide a build ID")?,
                rewrites: value
                    .rewrites
                    .context("NextBuildContext must provide rewrites")?
                    .into(),
            }),
        })
    }
}

/// Keep in sync with [`next_core::next_config::Rewrites`]
#[napi(object, object_to_js = false)]
#[derive(Debug)]
pub struct NapiRewrites {
    pub fallback: Vec<NapiRewrite>,
    pub after_files: Vec<NapiRewrite>,
    pub before_files: Vec<NapiRewrite>,
}

impl From<NapiRewrites> for Rewrites {
    fn from(val: NapiRewrites) -> Self {
        Rewrites {
            fallback: val
                .fallback
                .into_iter()
                .map(|rewrite| rewrite.into())
                .collect(),
            after_files: val
                .after_files
                .into_iter()
                .map(|rewrite| rewrite.into())
                .collect(),
            before_files: val
                .before_files
                .into_iter()
                .map(|rewrite| rewrite.into())
                .collect(),
        }
    }
}

/// Keep in sync with [`next_core::next_config::Rewrite`]
#[napi(object, object_to_js = false)]
#[derive(Debug)]
pub struct NapiRewrite {
    pub source: String,
    pub destination: String,
    pub base_path: Option<bool>,
    pub locale: Option<bool>,
    pub has: Option<Vec<NapiRouteHas>>,
    pub missing: Option<Vec<NapiRouteHas>>,
}

impl From<NapiRewrite> for Rewrite {
    fn from(val: NapiRewrite) -> Self {
        Rewrite {
            source: val.source,
            destination: val.destination,
            base_path: val.base_path,
            locale: val.locale,
            has: val
                .has
                .map(|has| has.into_iter().map(|has| has.into()).collect()),
            missing: val
                .missing
                .map(|missing| missing.into_iter().map(|missing| missing.into()).collect()),
        }
    }
}

/// Keep in sync with [`next_core::next_config::RouteHas`]
#[derive(Debug)]
pub enum NapiRouteHas {
    Header { key: String, value: Option<String> },
    Query { key: String, value: Option<String> },
    Cookie { key: String, value: Option<String> },
    Host { value: String },
}

impl FromNapiValue for NapiRouteHas {
    unsafe fn from_napi_value(env: sys::napi_env, napi_val: sys::napi_value) -> Result<Self> {
        let object = Object::from_napi_value(env, napi_val)?;
        let type_ = object.get_named_property::<String>("type")?;
        Ok(match type_.as_str() {
            "header" => NapiRouteHas::Header {
                key: object.get_named_property("key")?,
                value: object.get_named_property("value")?,
            },
            "query" => NapiRouteHas::Query {
                key: object.get_named_property("key")?,
                value: object.get_named_property("value")?,
            },
            "cookie" => NapiRouteHas::Cookie {
                key: object.get_named_property("key")?,
                value: object.get_named_property("value")?,
            },
            "host" => NapiRouteHas::Host {
                value: object.get_named_property("value")?,
            },
            _ => {
                return Err(napi::Error::new(
                    Status::GenericFailure,
                    format!("invalid type for RouteHas: {}", type_),
                ))
            }
        })
    }
}

impl From<NapiRouteHas> for RouteHas {
    fn from(val: NapiRouteHas) -> Self {
        match val {
            NapiRouteHas::Header { key, value } => RouteHas::Header { key, value },
            NapiRouteHas::Query { key, value } => RouteHas::Query { key, value },
            NapiRouteHas::Cookie { key, value } => RouteHas::Cookie { key, value },
            NapiRouteHas::Host { value } => RouteHas::Host { value },
        }
    }
}

#[napi]
pub async fn next_build(ctx: NextBuildContext) -> napi::Result<()> {
    turbo_next_build(ctx.try_into()?).await.convert_err()
}

#[napi]
pub async fn experimental_turbo(_unused: Buffer) -> napi::Result<()> {
    unimplemented!("__experimental_turbo is not yet implemented");
}
