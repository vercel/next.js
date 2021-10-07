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
  get_compiler,
  util::{CtxtExt, MapErr},
};
use anyhow::Context as _;
use napi::{CallContext, Either, Env, JsObject, JsString, JsUndefined, Task};
use std::{
  path::{Path, PathBuf},
  sync::Arc,
};
use swc::{config::ParseOptions, try_with_handler, Compiler};
use swc_common::{FileName, SourceFile};
use swc_ecma_ast::Program;

// ----- Parsing -----

pub struct ParseTask {
  pub c: Arc<Compiler>,
  pub fm: Arc<SourceFile>,
  pub options: ParseOptions,
}

pub struct ParseFileTask {
  pub c: Arc<Compiler>,
  pub path: PathBuf,
  pub options: ParseOptions,
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
      let program = try_with_handler(self.c.cm.clone(), |handler| {
          self.c.parse_js(
              self.fm.clone(),
              &handler,
              self.options.target,
              self.options.syntax,
              self.options.is_module,
              self.options.comments,
          )
      })
      .convert_err()?;

      Ok(program)
  }

  fn resolve(self, env: Env, result: Self::Output) -> napi::Result<Self::JsValue> {
      complete_parse(&env, result, &self.c)
  }
}

impl Task for ParseFileTask {
  type Output = Program;
  type JsValue = JsString;

  fn compute(&mut self) -> napi::Result<Self::Output> {
      try_with_handler(self.c.cm.clone(), |handler| {
          self.c.run(|| {
              let fm = self
                  .c
                  .cm
                  .load_file(&self.path)
                  .context("failed to read module")?;

              self.c.parse_js(
                  fm,
                  handler,
                  self.options.target,
                  self.options.syntax,
                  self.options.is_module,
                  self.options.comments,
              )
          })
      })
      .convert_err()
  }

  fn resolve(self, env: Env, result: Self::Output) -> napi::Result<Self::JsValue> {
      complete_parse(&env, result, &self.c)
  }
}

#[js_function(3)]
pub fn parse(ctx: CallContext) -> napi::Result<JsObject> {
  let c = get_compiler(&ctx);
  let src = ctx.get::<JsString>(0)?.into_utf8()?;
  let options: ParseOptions = ctx.get_deserialized(1)?;
  let filename = ctx.get::<Either<JsString, JsUndefined>>(2)?;
  let filename = if let Either::A(value) = filename {
      FileName::Real(value.into_utf8()?.as_str()?.to_owned().into())
  } else {
      FileName::Anon
  };

  let fm = c.cm.new_source_file(filename, src.as_str()?.to_string());

  ctx.env
      .spawn(ParseTask {
          c: c.clone(),
          fm,
          options,
      })
      .map(|t| t.promise_object())
}

#[js_function(3)]
pub fn parse_sync(cx: CallContext) -> napi::Result<JsString> {
  let c = get_compiler(&cx);

  let src = cx.get::<JsString>(0)?.into_utf8()?.as_str()?.to_owned();
  let options: ParseOptions = cx.get_deserialized(1)?;
  let filename = cx.get::<Either<JsString, JsUndefined>>(2)?;
  let filename = if let Either::A(value) = filename {
      FileName::Real(value.into_utf8()?.as_str()?.to_owned().into())
  } else {
      FileName::Anon
  };

  let program = try_with_handler(c.cm.clone(), |handler| {
      c.run(|| {
          let fm = c.cm.new_source_file(filename, src);
          c.parse_js(
              fm,
              handler,
              options.target,
              options.syntax,
              options.is_module,
              options.comments,
          )
      })
  })
  .convert_err()?;

  complete_parse(&cx.env, program, &c)
}

#[js_function(2)]
pub fn parse_file_sync(cx: CallContext) -> napi::Result<JsString> {
  let c = get_compiler(&cx);
  let path = cx.get::<JsString>(0)?.into_utf8()?;
  let options: ParseOptions = cx.get_deserialized(1)?;

  let program = {
      try_with_handler(c.cm.clone(), |handler| {
          let fm =
              c.cm.load_file(Path::new(path.as_str()?))
                  .expect("failed to read program file");

          c.parse_js(
              fm,
              handler,
              options.target,
              options.syntax,
              options.is_module,
              options.comments,
          )
      })
  }
  .convert_err()?;

  complete_parse(cx.env, program, &c)
}

#[js_function(2)]
pub fn parse_file(cx: CallContext) -> napi::Result<JsObject> {
  let c = get_compiler(&cx);
  let path = PathBuf::from(cx.get::<JsString>(0)?.into_utf8()?.as_str()?);
  let options: ParseOptions = cx.get_deserialized(1)?;

  cx.env
      .spawn(ParseFileTask { c, path, options })
      .map(|t| t.promise_object())
}
