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
use napi::{CallContext, JsObject, JsString, Task};
use std::sync::Arc;
use swc::TransformOutput;
use swc_common::FileName;

struct MinifyTask {
  c: Arc<swc::Compiler>,
  code: String,
  opts: swc::config::JsMinifyOptions,
}

impl Task for MinifyTask {
  type Output = TransformOutput;

  type JsValue = JsObject;

  fn compute(&mut self) -> napi::Result<Self::Output> {
    let fm = self.c.cm.new_source_file(FileName::Anon, self.code.clone());

    self.c.minify(fm, &self.opts).convert_err()
  }

  fn resolve(self, env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
    complete_output(&env, output)
  }
}

#[js_function(2)]
pub fn minify(cx: CallContext) -> napi::Result<JsObject> {
  let code = cx.get::<JsString>(0)?.into_utf8()?.into_owned()?;
  let opts = cx.get_deserialized(1)?;

  let c = get_compiler(&cx);

  let task = MinifyTask { c, code, opts };

  cx.env.spawn(task).map(|t| t.promise_object())
}

#[js_function(2)]
pub fn minify_sync(cx: CallContext) -> napi::Result<JsObject> {
  let code = cx.get::<JsString>(0)?.into_utf8()?.into_owned()?;
  let opts = cx.get_deserialized(1)?;

  let c = get_compiler(&cx);

  let fm = c.cm.new_source_file(FileName::Anon, code.clone());

  let output = c.minify(fm, &opts).convert_err()?;

  complete_output(&cx.env, output)
}
