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
    util::{deserialize_json, CtxtExt, MapErr},
};
use anyhow::{anyhow, bail, Context as _, Error};
use fxhash::FxHashSet;
use napi::{CallContext, Env, JsBoolean, JsBuffer, JsObject, JsString, JsUnknown, Status, Task};
use next_swc::{custom_before_pass, TransformOptions};
use std::fs::read_to_string;
use std::{
    cell::RefCell,
    convert::TryFrom,
    panic::{catch_unwind, AssertUnwindSafe},
    rc::Rc,
    sync::Arc,
};
use swc::{try_with_handler, Compiler, TransformOutput};
use swc_common::{errors::ColorConfig, FileName, SourceFile};
use swc_ecmascript::ast::Program;
use swc_ecmascript::transforms::pass::noop;

/// Input to transform
#[derive(Debug)]
pub enum Input {
    /// Raw source code.
    Source { src: String },
    /// Get source code from filename in options
    FromFilename,
}

pub struct TransformTask {
    pub c: Arc<Compiler>,
    pub input: Input,
    pub options: String,
}

impl Task for TransformTask {
    type Output = (TransformOutput, FxHashSet<String>);
    type JsValue = JsObject;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let eliminated_packages: Rc<RefCell<fxhash::FxHashSet<String>>> = Default::default();
        let res = catch_unwind(AssertUnwindSafe(|| {
            try_with_handler(
                self.c.cm.clone(),
                swc::HandlerOpts {
                    color: ColorConfig::Never,
                    skip_filename: true,
                },
                |handler| {
                    self.c.run(|| {
                        let options: TransformOptions = deserialize_json(&self.options)?;
                        let fm = match &self.input {
                            Input::Source { src } => {
                                let filename = if options.swc.filename.is_empty() {
                                    FileName::Anon
                                } else {
                                    FileName::Real(options.swc.filename.clone().into())
                                };

                                self.c.cm.new_source_file(filename, src.to_string())
                            }
                            Input::FromFilename => {
                                let filename = &options.swc.filename;
                                if filename.is_empty() {
                                    bail!("no filename is provided via options");
                                }

                                self.c.cm.new_source_file(
                                    FileName::Real(filename.into()),
                                    read_to_string(filename).with_context(|| {
                                        format!("Failed to read source code from {}", filename)
                                    })?,
                                )
                            }
                        };
                        let options = options.patch(&fm);

                        let cm = self.c.cm.clone();
                        let file = fm.clone();

                        self.c.process_js_with_custom_pass(
                            fm,
                            None,
                            handler,
                            &options.swc,
                            |_, comments| {
                                custom_before_pass(
                                    cm,
                                    file,
                                    &options,
                                    comments.clone(),
                                    eliminated_packages.clone(),
                                )
                            },
                            |_, _| noop(),
                        )
                    })
                },
            )
        }))
        .map_err(|err| {
            if let Some(s) = err.downcast_ref::<String>() {
                anyhow!("failed to process {}", s)
            } else {
                anyhow!("failed to process")
            }
        });

        match res {
            Ok(res) => res
                .map(|o| (o, eliminated_packages.replace(Default::default())))
                .convert_err(),
            Err(err) => Err(napi::Error::new(
                Status::GenericFailure,
                format!("{:?}", err),
            )),
        }
    }

    fn resolve(
        self,
        env: Env,
        (output, eliminated_packages): Self::Output,
    ) -> napi::Result<Self::JsValue> {
        complete_output(&env, output, eliminated_packages)
    }
}

/// returns `compiler, (src / path), options, plugin, callback`
pub fn schedule_transform<F>(cx: CallContext, op: F) -> napi::Result<JsObject>
where
    F: FnOnce(&Arc<Compiler>, Input, bool, String) -> TransformTask,
{
    let c = get_compiler(&cx);

    let unknown_src = cx.get::<JsUnknown>(0)?;
    let src = match unknown_src.get_type()? {
        napi::ValueType::String => napi::Result::Ok(Input::Source {
            src: JsString::try_from(unknown_src)?
                .into_utf8()?
                .as_str()?
                .to_owned(),
        }),
        napi::ValueType::Object => napi::Result::Ok(Input::Source {
            src: String::from_utf8_lossy(JsBuffer::try_from(unknown_src)?.into_value()?.as_ref())
                .to_string(),
        }),
        napi::ValueType::Undefined => napi::Result::Ok(Input::FromFilename),
        _ => Err(napi::Error::new(
            Status::GenericFailure,
            "first argument must be a String or Buffer".to_string(),
        )),
    }?;
    let is_module = cx.get::<JsBoolean>(1)?;
    let options = cx.get_buffer_as_string(2)?;

    let task = op(&c, src, is_module.get_value()?, options);

    cx.env.spawn(task).map(|t| t.promise_object())
}

pub fn exec_transform<F>(cx: CallContext, op: F) -> napi::Result<JsObject>
where
    F: FnOnce(&Compiler, String, &TransformOptions) -> Result<Arc<SourceFile>, Error>,
{
    let c = get_compiler(&cx);

    let s = cx.get::<JsString>(0)?.into_utf8()?;
    let is_module = cx.get::<JsBoolean>(1)?;
    let mut options: TransformOptions = cx.get_deserialized(2)?;
    options.swc.swcrc = false;

    let output = try_with_handler(
        c.cm.clone(),
        swc::HandlerOpts {
            color: ColorConfig::Never,
            skip_filename: true,
        },
        |handler| {
            c.run(|| {
                if is_module.get_value()? {
                    let program: Program = serde_json::from_str(s.as_str()?)
                        .context("failed to deserialize Program")?;
                    c.process_js(handler, program, &options.swc)
                } else {
                    let fm =
                        op(&c, s.as_str()?.to_string(), &options).context("failed to load file")?;
                    c.process_js_file(fm, handler, &options.swc)
                }
            })
        },
    )
    .convert_err()?;

    complete_output(cx.env, output, Default::default())
}

#[js_function(4)]
pub fn transform(cx: CallContext) -> napi::Result<JsObject> {
    schedule_transform(cx, |c, input, _, options| TransformTask {
        c: c.clone(),
        input,
        options,
    })
}

#[js_function(4)]
pub fn transform_sync(cx: CallContext) -> napi::Result<JsObject> {
    exec_transform(cx, |c, src, options| {
        Ok(c.cm.new_source_file(
            if options.swc.filename.is_empty() {
                FileName::Anon
            } else {
                FileName::Real(options.swc.filename.clone().into())
            },
            src,
        ))
    })
}

#[test]
fn test_deser() {
    const JSON_STR: &str = r#"{"jsc":{"parser":{"syntax":"ecmascript","dynamicImport":true,"jsx":true},"transform":{"react":{"runtime":"automatic","pragma":"React.createElement","pragmaFrag":"React.Fragment","throwIfNamespace":true,"development":false,"useBuiltins":true}},"target":"es5"},"filename":"/Users/timneutkens/projects/next.js/packages/next/dist/client/next.js","sourceMaps":false,"sourceFileName":"/Users/timneutkens/projects/next.js/packages/next/dist/client/next.js"}"#;

    let tr: TransformOptions = serde_json::from_str(JSON_STR).unwrap();

    println!("{:#?}", tr);
}

#[test]
fn test_deserialize_transform_regenerator() {
    const JSON_STR: &str = r#"{"jsc":{"parser":{"syntax":"ecmascript","dynamicImport":true,"jsx":true},"transform":{ "regenerator": { "importPath": "foo" }, "react":{"runtime":"automatic","pragma":"React.createElement","pragmaFrag":"React.Fragment","throwIfNamespace":true,"development":false,"useBuiltins":true}},"target":"es5"},"filename":"/Users/timneutkens/projects/next.js/packages/next/dist/client/next.js","sourceMaps":false,"sourceFileName":"/Users/timneutkens/projects/next.js/packages/next/dist/client/next.js"}"#;

    let tr: TransformOptions = serde_json::from_str(JSON_STR).unwrap();

    println!("{:#?}", tr);
}
