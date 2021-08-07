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
    amp_attributes::amp_attributes,
    complete_output, get_compiler,
    hook_optimizer::hook_optimizer,
    next_dynamic::next_dynamic,
    next_ssg::next_ssg,
    util::{CtxtExt, MapErr},
};
use anyhow::{bail, Error};
use napi::{CallContext, Env, JsBoolean, JsObject, JsString, Task};
use std::sync::Arc;
use swc::config::{BuiltConfig, Options};
use swc::{Compiler, TransformOutput};
use swc_common::{chain, comments::Comment, BytePos, FileName, SourceFile};
use swc_ecmascript::ast::Program;
use swc_ecmascript::transforms::helpers::{self, Helpers};
use swc_ecmascript::utils::HANDLER;
use swc_ecmascript::visit::FoldWith;

/// Input to transform
#[derive(Debug)]
pub enum Input {
    /// json string
    Program(String),
    /// Raw source code.
    Source(Arc<SourceFile>),
}

pub struct TransformTask {
    pub c: Arc<Compiler>,
    pub input: Input,
    pub options: Options,
}

impl Task for TransformTask {
    type Output = TransformOutput;
    type JsValue = JsObject;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        self.c
            .run(|| match self.input {
                Input::Program(ref s) => {
                    let program: Program =
                        serde_json::from_str(&s).expect("failed to deserialize Program");
                    // TODO: Source map
                    self.c.process_js(program, &self.options)
                }

                Input::Source(ref s) => process_js_custom(&self.c, s.clone(), &self.options),
            })
            .convert_err()
    }

    fn resolve(self, env: Env, result: Self::Output) -> napi::Result<Self::JsValue> {
        complete_output(&env, result)
    }
}

/// returns `compiler, (src / path), options, plugin, callback`
pub fn schedule_transform<F>(cx: CallContext, op: F) -> napi::Result<JsObject>
where
    F: FnOnce(&Arc<Compiler>, String, bool, Options) -> TransformTask,
{
    let c = get_compiler(&cx);

    let s = cx.get::<JsString>(0)?.into_utf8()?.as_str()?.to_owned();
    let is_module = cx.get::<JsBoolean>(1)?;
    let options: Options = cx.get_deserialized(2)?;

    let task = op(&c, s, is_module.get_value()?, options);

    cx.env.spawn(task).map(|t| t.promise_object())
}

pub fn exec_transform<F>(cx: CallContext, op: F) -> napi::Result<JsObject>
where
    F: FnOnce(&Compiler, String, &Options) -> Result<Arc<SourceFile>, Error>,
{
    let c = get_compiler(&cx);

    let s = cx.get::<JsString>(0)?.into_utf8()?;
    let is_module = cx.get::<JsBoolean>(1)?;
    let options: Options = cx.get_deserialized(2)?;

    let output = c.run(|| -> napi::Result<_> {
        if is_module.get_value()? {
            let program: Program =
                serde_json::from_str(s.as_str()?).expect("failed to deserialize Program");
            c.process_js(program, &options).convert_err()
        } else {
            let fm = op(&c, s.as_str()?.to_string(), &options).expect("failed to create fm");
            c.process_js_file(fm, &options).convert_err()
        }
    })?;

    complete_output(cx.env, output)
}

#[js_function(4)]
pub fn transform(cx: CallContext) -> napi::Result<JsObject> {
    schedule_transform(cx, |c, src, is_module, options| {
        let input = if is_module {
            Input::Program(src)
        } else {
            Input::Source(c.cm.new_source_file(
                if options.filename.is_empty() {
                    FileName::Anon
                } else {
                    FileName::Real(options.filename.clone().into())
                },
                src,
            ))
        };

        TransformTask {
            c: c.clone(),
            input,
            options,
        }
    })
}

#[js_function(4)]
pub fn transform_sync(cx: CallContext) -> napi::Result<JsObject> {
    exec_transform(cx, |c, src, options| {
        Ok(c.cm.new_source_file(
            if options.filename.is_empty() {
                FileName::Anon
            } else {
                FileName::Real(options.filename.clone().into())
            },
            src,
        ))
    })
}

fn process_js_custom(
    compiler: &Arc<Compiler>,
    source: Arc<SourceFile>,
    options: &Options,
) -> Result<TransformOutput, Error> {
    let config = compiler.run(|| compiler.config_for_file(options, &source.name))?;
    let config = match config {
        Some(v) => v,
        None => {
            bail!("cannot process file because it's ignored by .swcrc")
        }
    };
    let config = BuiltConfig {
        pass: chain!(
            hook_optimizer(),
            next_ssg(),
            amp_attributes(),
            next_dynamic(source.name.clone()),
            config.pass
        ),
        syntax: config.syntax,
        target: config.target,
        minify: config.minify,
        external_helpers: config.external_helpers,
        source_maps: config.source_maps,
        input_source_map: config.input_source_map,
        is_module: config.is_module,
        output_path: config.output_path,
    };
    //let orig = compiler.get_orig_src_map(&source,
    // &options.config.input_source_map)?;
    let program = compiler.parse_js(
        source.clone(),
        config.target,
        config.syntax,
        config.is_module,
        true,
    )?;

    //compiler.process_js_inner(program, orig.as_ref(), config)

    compiler.run(|| {
        if config.minify {
            let preserve_excl = |_: &BytePos, vc: &mut Vec<Comment>| -> bool {
                vc.retain(|c: &Comment| c.text.starts_with("!"));
                !vc.is_empty()
            };
            compiler.comments().leading.retain(preserve_excl);
            compiler.comments().trailing.retain(preserve_excl);
        }
        let mut pass = config.pass;
        let program = helpers::HELPERS.set(&Helpers::new(config.external_helpers), || {
            HANDLER.set(&compiler.handler, || {
                // Fold module
                program.fold_with(&mut pass)
            })
        });

        compiler.print(
            &program,
            config.output_path,
            config.target,
            config.source_maps,
            None, // TODO: figure out sourcemaps
            config.minify,
        )
    })
}
