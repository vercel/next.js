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
use crate::{
    complete_output, get_compiler,
    util::{CtxtExt, MapErr},
};
use fxhash::FxHashMap;
use napi::{CallContext, JsObject, Task};
use serde::Deserialize;
use std::sync::Arc;
use swc::{try_with_handler, TransformOutput};
use swc_common::{errors::ColorConfig, sync::Lrc, FileName, SourceFile, SourceMap};

struct MinifyTask {
    c: Arc<swc::Compiler>,
    code: MinifyTarget,
    opts: swc::config::JsMinifyOptions,
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
            MinifyTarget::Single(code) => cm.new_source_file(FileName::Anon, code.clone()),
            MinifyTarget::Map(codes) => {
                assert_eq!(
                    codes.len(),
                    1,
                    "swc.minify does not support concatenating multiple files yet"
                );

                let (filename, code) = codes.iter().next().unwrap();

                cm.new_source_file(FileName::Real(filename.clone().into()), code.clone())
            }
        }
    }
}

impl Task for MinifyTask {
    type Output = TransformOutput;

    type JsValue = JsObject;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        try_with_handler(
            self.c.cm.clone(),
            swc::HandlerOpts {
                color: ColorConfig::Never,
                skip_filename: true,
            },
            |handler| {
                let fm = self.code.to_file(self.c.cm.clone());

                self.c.minify(fm, handler, &self.opts)
            },
        )
        .convert_err()
    }

    fn resolve(self, env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        complete_output(&env, output, Default::default())
    }
}

#[js_function(2)]
pub fn minify(cx: CallContext) -> napi::Result<JsObject> {
    let code = cx.get_deserialized(0)?;
    let opts = cx.get_deserialized(1)?;

    let c = get_compiler(&cx);

    let task = MinifyTask { c, code, opts };

    cx.env.spawn(task).map(|t| t.promise_object())
}

#[js_function(2)]
pub fn minify_sync(cx: CallContext) -> napi::Result<JsObject> {
    let code: MinifyTarget = cx.get_deserialized(0)?;
    let opts = cx.get_deserialized(1)?;

    let c = get_compiler(&cx);

    let fm = code.to_file(c.cm.clone());

    let output = try_with_handler(
        c.cm.clone(),
        swc::HandlerOpts {
            color: ColorConfig::Never,
            skip_filename: true,
        },
        |handler| c.minify(fm, handler, &opts),
    )
    .convert_err()?;

    complete_output(cx.env, output, Default::default())
}
