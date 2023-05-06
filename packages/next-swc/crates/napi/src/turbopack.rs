use std::convert::TryFrom;

use napi::bindgen_prelude::*;
use next_build::{next_build as turbo_next_build, NextBuildOptions};
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
    pub dir: Option<String>,
    pub app_dir: Option<String>,
    pub pages_dir: Option<String>,
    pub rewrites: Option<Rewrites>,
    pub original_rewrites: Option<Rewrites>,
    pub original_redirects: Option<Vec<Redirect>>,
}

#[napi(object, object_to_js = false)]
#[derive(Debug)]
pub struct Rewrites {
    pub fallback: Vec<Rewrite>,
    pub after_files: Vec<Rewrite>,
    pub before_files: Vec<Rewrite>,
}

#[napi(object, object_to_js = false)]
#[derive(Debug)]
pub struct Rewrite {
    pub source: String,
    pub destination: String,
}

#[napi(object, object_to_js = false)]
#[derive(Debug)]
pub struct Redirect {
    pub source: String,
    pub destination: String,
    pub permanent: Option<bool>,
    pub status_code: Option<u32>,
    pub has: Option<RouteHas>,
    pub missing: Option<RouteHas>,
}

#[derive(Debug)]
pub struct RouteHas {
    pub r#type: RouteType,
    pub key: Option<String>,
    pub value: Option<String>,
}

#[derive(Debug)]
pub enum RouteType {
    Header,
    Query,
    Cookie,
    Host,
}

impl TryFrom<String> for RouteType {
    type Error = napi::Error;

    fn try_from(value: String) -> Result<Self> {
        match value.as_str() {
            "header" => Ok(RouteType::Header),
            "query" => Ok(RouteType::Query),
            "cookie" => Ok(RouteType::Cookie),
            "host" => Ok(RouteType::Host),
            _ => Err(napi::Error::new(
                napi::Status::InvalidArg,
                "Invalid route type",
            )),
        }
    }
}

impl FromNapiValue for RouteHas {
    unsafe fn from_napi_value(env: sys::napi_env, napi_val: sys::napi_value) -> Result<Self> {
        let object = Object::from_napi_value(env, napi_val)?;
        let r#type = object.get_named_property::<String>("type")?;
        Ok(RouteHas {
            r#type: RouteType::try_from(r#type)?,
            key: object.get("key")?,
            value: object.get("value")?,
        })
    }
}

impl From<NextBuildContext> for NextBuildOptions {
    fn from(value: NextBuildContext) -> Self {
        Self {
            dir: value.dir,
            memory_limit: None,
            full_stats: None,
        }
    }
}

#[napi]
pub async fn next_build(ctx: NextBuildContext) -> napi::Result<()> {
    turbo_next_build(ctx.into()).await.convert_err()
}
