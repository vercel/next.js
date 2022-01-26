use crate::{
  get_compiler,
  util::{deserialize_json, CtxtExt, MapErr},
};
use anyhow::Context as _;
use napi::{CallContext, Either, Env, JsObject, JsString, JsUndefined, Task};
use std::{sync::Arc};
use swc::{try_with_handler, config::ParseOptions, Compiler};
use swc_common::FileName;
use swc_ecmascript::ast::Program;

pub struct ParseTask {
  pub c: Arc<Compiler>,
  pub filename: FileName,
  pub src: String,
  pub options: String,
}

pub fn complete_parse<'a>(env: &Env, program: Program, _c: &Compiler) -> napi::Result<JsString> {
  let s = serde_json::to_string(&program)
      .context("failed to serialize Program")
      .convert_err()?;
  env.create_string_from_std(s)
}

impl Task for ParseTask {
  type Output = Program;
  type JsValue = JsString;

  fn compute(&mut self) -> napi::Result<Self::Output> {
      let options: ParseOptions = deserialize_json(&self.options).convert_err()?;
      let fm = self
          .c
          .cm
          .new_source_file(self.filename.clone(), self.src.clone());
      let program = try_with_handler(self.c.cm.clone(), false, |handler| {
          self.c.parse_js(
              fm,
              &handler,
              options.target,
              options.syntax,
              options.is_module,
              options.comments,
          )
      })
      .convert_err()?;

      Ok(program)
  }

  fn resolve(self, env: Env, result: Self::Output) -> napi::Result<Self::JsValue> {
      complete_parse(&env, result, &self.c)
  }
}

#[js_function(3)]
pub fn parse(ctx: CallContext) -> napi::Result<JsObject> {
    let c = get_compiler(&ctx);
    let src = ctx.get_deserialized(0)?;
    let options = ctx.get_buffer_as_string(1)?;
    let filename = ctx.get::<Either<JsString, JsUndefined>>(2)?;
    let filename = if let Either::A(value) = filename {
        FileName::Real(value.into_utf8()?.as_str()?.to_owned().into())
    } else {
        FileName::Anon
    };

    ctx.env
        .spawn(ParseTask {
            c: c.clone(),
            filename,
            src,
            options,
        })
        .map(|t| t.promise_object())
}
