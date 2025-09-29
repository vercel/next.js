/*
Copyright (c) 2017 The swc Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
*/

use anyhow::Context;
use napi::bindgen_prelude::*;
use serde::Serialize;
use swc_core::{
    base::{config::JsMinifyOptions, try_with_handler},
    common::{FileName, GLOBALS, errors::ColorConfig},
};

use crate::{get_compiler, util::MapErr};

pub struct MinifyTask {
    c: swc_core::base::Compiler,
    code: Option<String>,
    opts: JsMinifyOptions,
}

// Same as the swc_core::base::TransformOutput, but using our napi-rs v2's derived #[napi], while
// swc is already on napi-rs v3.
#[napi_derive::napi(object)]
#[derive(Debug, Serialize)]
pub struct TransformOutput {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub map: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    pub diagnostics: std::vec::Vec<String>,
}

impl From<swc_core::base::TransformOutput> for TransformOutput {
    fn from(other: swc_core::base::TransformOutput) -> Self {
        Self {
            code: other.code,
            map: other.map,
            output: other.output,
            diagnostics: other.diagnostics,
        }
    }
}

#[napi]
impl Task for MinifyTask {
    type Output = TransformOutput;

    type JsValue = TransformOutput;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let code = self.code.take().unwrap_or_default();

        try_with_handler(
            self.c.cm.clone(),
            swc_core::base::HandlerOpts {
                color: ColorConfig::Never,
                skip_filename: true,
            },
            |handler| {
                GLOBALS.set(&Default::default(), || {
                    let fm = self.c.cm.new_source_file(FileName::Anon.into(), code);

                    self.c.minify(fm, handler, &self.opts, Default::default())
                })
            },
        )
        .map(TransformOutput::from)
        .map_err(|e| e.to_pretty_error())
        .convert_err()
    }

    fn resolve(&mut self, _: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn minify(
    input: Buffer,
    opts: Buffer,
    signal: Option<AbortSignal>,
) -> napi::Result<AsyncTask<MinifyTask>> {
    let code = String::from_utf8(input.into())
        .context("failed to convert input to string")
        .convert_err()?;
    let opts = serde_json::from_slice(&opts)?;

    let c = get_compiler();

    let task = MinifyTask {
        c,
        code: Some(code),
        opts,
    };

    Ok(AsyncTask::with_optional_signal(task, signal))
}

#[napi]
pub fn minify_sync(input: Buffer, opts: Buffer) -> napi::Result<TransformOutput> {
    let code = String::from_utf8(input.into())
        .context("failed to convert input to string")
        .convert_err()?;
    let opts = serde_json::from_slice(&opts)?;

    let c = get_compiler();

    let fm = c.cm.new_source_file(FileName::Anon.into(), code);

    try_with_handler(
        c.cm.clone(),
        swc_core::base::HandlerOpts {
            color: ColorConfig::Never,
            skip_filename: true,
        },
        |handler| {
            GLOBALS.set(&Default::default(), || {
                c.minify(fm, handler, &opts, Default::default())
            })
        },
    )
    .map(TransformOutput::from)
    .map_err(|e| e.to_pretty_error())
    .convert_err()
}
