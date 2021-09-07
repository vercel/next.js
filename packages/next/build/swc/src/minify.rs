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
