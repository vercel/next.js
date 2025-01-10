use std::sync::Arc;

use anyhow::Context as _;
use napi::bindgen_prelude::*;
use swc_core::{
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
            let c =
                swc_core::base::Compiler::new(Arc::new(SourceMap::new(FilePathMapping::empty())));

            let options: ParseOptions = serde_json::from_slice(self.options.as_ref())?;
            let comments = c.comments().clone();
            let comments: Option<&dyn Comments> = if options.comments {
                Some(&comments)
            } else {
                None
            };
            let fm =
                c.cm.new_source_file(self.filename.clone().into(), self.src.clone());
            let program = try_with_handler(
                c.cm.clone(),
                swc_core::base::HandlerOpts {
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
