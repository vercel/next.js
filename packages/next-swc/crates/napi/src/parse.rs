use std::sync::Arc;

use anyhow::Context as _;
use napi::{bindgen_prelude::*, JsObject};
use next_page_static_info::{collect_exports, ExportInfo};
use once_cell::sync::Lazy;
use regex::Regex;
use turbopack_binding::swc::core::{
    base::{config::ParseOptions, try_with_handler},
    common::{
        comments::Comments, errors::ColorConfig, FileName, FilePathMapping, SourceMap, GLOBALS,
    },
};

use crate::util::MapErr;

pub struct ParseTask {
    pub filename: FileName,
    pub src: String,
    pub options: Buffer,
}

#[napi]
impl Task for ParseTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        GLOBALS.set(&Default::default(), || {
            let c = turbopack_binding::swc::core::base::Compiler::new(Arc::new(SourceMap::new(
                FilePathMapping::empty(),
            )));

            let options: ParseOptions = serde_json::from_slice(self.options.as_ref())?;
            let comments = c.comments().clone();
            let comments: Option<&dyn Comments> = if options.comments {
                Some(&comments)
            } else {
                None
            };
            let fm =
                c.cm.new_source_file(self.filename.clone(), self.src.clone());
            let program = try_with_handler(
                c.cm.clone(),
                turbopack_binding::swc::core::base::HandlerOpts {
                    color: ColorConfig::Never,
                    skip_filename: false,
                },
                |handler| {
                    c.parse_js(
                        fm,
                        handler,
                        options.target,
                        options.syntax,
                        options.is_module,
                        comments,
                    )
                },
            )
            .convert_err()?;

            let ast_json = serde_json::to_string(&program)
                .context("failed to serialize Program")
                .convert_err()?;

            Ok(ast_json)
        })
    }

    fn resolve(&mut self, _env: Env, result: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(result)
    }
}

#[napi]
pub fn parse(
    src: String,
    options: Buffer,
    filename: Option<String>,
    signal: Option<AbortSignal>,
) -> AsyncTask<ParseTask> {
    let filename = if let Some(value) = filename {
        FileName::Real(value.into())
    } else {
        FileName::Anon
    };
    AsyncTask::with_optional_signal(
        ParseTask {
            filename,
            src,
            options,
        },
        signal,
    )
}

/// wrap read file to suppress errors conditionally.
fn read_file_wrapped_err(path: &str, raise_err: bool) -> Result<String> {
    let ret = std::fs::read_to_string(path).map_err(|e| {
        napi::Error::new(
            Status::GenericFailure,
            format!("Next.js ERROR: Failed to read file {}:\n{:#?}", path, e),
        )
    });

    match ret {
        Ok(_) | Err(_) if raise_err => ret,
        _ => Ok("".to_string()),
    }
}

/// A regex pattern to determine if is_dynamic_metadata_route should continue to
/// parse the page or short circuit and return false.
static DYNAMIC_METADATA_ROUTE_SHORT_CURCUIT: Lazy<Regex> =
    Lazy::new(|| Regex::new("generateImageMetadata|generateSitemaps").unwrap());

pub struct DetectMetadataRouteTask {
    page_file_path: String,
}

#[napi]
impl Task for DetectMetadataRouteTask {
    type Output = Option<ExportInfo>;
    type JsValue = Object;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let file_content = read_file_wrapped_err(self.page_file_path.as_str(), true)?;

        if !DYNAMIC_METADATA_ROUTE_SHORT_CURCUIT.is_match(file_content.as_str()) {
            return Ok(None);
        }

        collect_exports(&file_content, &self.page_file_path)
            .map(Some)
            .convert_err()
    }

    fn resolve(&mut self, env: Env, exports_info: Self::Output) -> napi::Result<Self::JsValue> {
        let mut ret = env.create_object()?;

        let mut warnings = env.create_array(0)?;

        match exports_info {
            Some(exports_info) => {
                let is_dynamic_metadata_route =
                    !exports_info.generate_image_metadata.unwrap_or_default()
                        || !exports_info.generate_sitemaps.unwrap_or_default();
                ret.set_named_property(
                    "isDynamicMetadataRoute",
                    env.get_boolean(is_dynamic_metadata_route),
                )?;

                for (key, message) in exports_info.warnings {
                    let mut warning_obj = env.create_object()?;
                    warning_obj.set_named_property("key", env.create_string(&key)?)?;
                    warning_obj.set_named_property("message", env.create_string(&message)?)?;
                    warnings.insert(warning_obj)?;
                }
                ret.set_named_property("warnings", warnings)?;
            }
            None => {
                ret.set_named_property("warnings", warnings)?;
                ret.set_named_property("isDynamicMetadataRoute", env.get_boolean(false))?;
            }
        }

        Ok(ret)
    }
}

/// Detect if metadata routes is a dynamic route, which containing
/// generateImageMetadata or generateSitemaps as export
#[napi]
pub fn is_dynamic_metadata_route(page_file_path: String) -> AsyncTask<DetectMetadataRouteTask> {
    AsyncTask::new(DetectMetadataRouteTask { page_file_path })
}

#[napi(object, object_to_js = false)]
pub struct CollectPageStaticInfoOption {
    pub page_file_path: String,
    pub next_config: JsObject, // NextConfig
    pub is_dev: Option<bool>,
    pub page: Option<String>,
    pub page_type: String, //'pages' | 'app' | 'root'
}

pub struct CollectPageStaticInfoTask {}

#[napi]
impl Task for CollectPageStaticInfoTask {
    type Output = bool;
    type JsValue = bool;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        Ok(false)
    }

    fn resolve(&mut self, _env: Env, result: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(result)
    }
}

#[napi]
pub fn get_page_static_info(
    _option: CollectPageStaticInfoOption,
) -> AsyncTask<CollectPageStaticInfoTask> {
    AsyncTask::new(CollectPageStaticInfoTask {})
}
