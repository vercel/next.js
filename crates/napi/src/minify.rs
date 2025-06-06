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

use napi::bindgen_prelude::*;
use rustc_hash::FxHashMap;
use serde::Deserialize;
use swc_core::{
    base::{TransformOutput, config::JsMinifyOptions, try_with_handler},
    common::{FileName, GLOBALS, SourceFile, SourceMap, errors::ColorConfig, sync::Lrc},
};

use crate::{get_compiler, util::MapErr};

pub struct MinifyTask {
    c: swc_core::base::Compiler,
    code: MinifyTarget,
    opts: JsMinifyOptions,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum MinifyTarget {
    /// Code to minify.
    Single(String),
    /// `{ filename: code }`
    Map(FxHashMap<String, String>),
}

impl MinifyTarget {
    fn to_file(&self, cm: Lrc<SourceMap>) -> Lrc<SourceFile> {
        match self {
            MinifyTarget::Single(code) => cm.new_source_file(FileName::Anon.into(), code.clone()),
            MinifyTarget::Map(codes) => {
                assert_eq!(
                    codes.len(),
                    1,
                    "swc.minify does not support concatenating multiple files yet"
                );

                let (filename, code) = codes.iter().next().unwrap();

                cm.new_source_file(FileName::Real(filename.clone().into()).into(), code.clone())
            }
        }
    }
}

#[napi]
impl Task for MinifyTask {
    type Output = TransformOutput;

    type JsValue = TransformOutput;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        try_with_handler(
            self.c.cm.clone(),
            swc_core::base::HandlerOpts {
                color: ColorConfig::Never,
                skip_filename: true,
            },
            |handler| {
                GLOBALS.set(&Default::default(), || {
                    let fm = self.code.to_file(self.c.cm.clone());

                    self.c.minify(fm, handler, &self.opts, Default::default())
                })
            },
        )
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
    let code = serde_json::from_slice(&input)?;
    let opts = serde_json::from_slice(&opts)?;

    let c = get_compiler();

    let task = MinifyTask { c, code, opts };

    Ok(AsyncTask::with_optional_signal(task, signal))
}

#[napi]
pub fn minify_sync(input: Buffer, opts: Buffer) -> napi::Result<TransformOutput> {
    let code: MinifyTarget = serde_json::from_slice(&input)?;
    let opts = serde_json::from_slice(&opts)?;

    let c = get_compiler();

    let fm = code.to_file(c.cm.clone());

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
    .map_err(|e| e.to_pretty_error())
    .convert_err()
}
