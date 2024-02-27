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

use std::{
    cell::RefCell,
    fs::read_to_string,
    panic::{catch_unwind, AssertUnwindSafe},
    rc::Rc,
    sync::Arc,
};

use anyhow::{anyhow, bail, Context as _};
use fxhash::FxHashSet;
use napi::bindgen_prelude::*;
use next_custom_transforms::chain_transforms::{custom_before_pass, TransformOptions};
use turbopack_binding::swc::core::{
    base::{try_with_handler, Compiler, TransformOutput},
    common::{comments::SingleThreadedComments, errors::ColorConfig, FileName, Mark, GLOBALS},
    ecma::transforms::base::pass::noop,
};

use crate::{complete_output, get_compiler, util::MapErr};

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
    pub options: Vec<u8>,
}

#[inline]
fn skip_filename() -> bool {
    cfg!(debug_assertions)
}

fn run_in_context<F, Ret>(op: F) -> Ret
where
    F: FnOnce() -> Ret,
{
    GLOBALS.set(&Default::default(), op)
}

impl Task for TransformTask {
    type Output = (TransformOutput, FxHashSet<String>);
    type JsValue = Object;

    fn compute(&mut self) -> Result<Self::Output> {
        run_in_context(|| {
            let eliminated_packages: Rc<RefCell<fxhash::FxHashSet<String>>> = Default::default();
            let res = catch_unwind(AssertUnwindSafe(|| {
                try_with_handler(
                    self.c.cm.clone(),
                    turbopack_binding::swc::core::base::HandlerOpts {
                        color: ColorConfig::Always,
                        skip_filename: skip_filename(),
                    },
                    |handler| {
                        self.c.run(|| {
                            let options: TransformOptions = serde_json::from_slice(&self.options)?;
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
                            let unresolved_mark = Mark::new();
                            let mut options = options.patch(&fm);
                            options.swc.unresolved_mark = Some(unresolved_mark);

                            let cm = self.c.cm.clone();
                            let file = fm.clone();

                            let comments = SingleThreadedComments::default();
                            self.c.process_js_with_custom_pass(
                                fm,
                                None,
                                handler,
                                &options.swc,
                                comments.clone(),
                                |_| {
                                    custom_before_pass(
                                        cm,
                                        file,
                                        &options,
                                        comments.clone(),
                                        eliminated_packages.clone(),
                                        unresolved_mark,
                                    )
                                },
                                |_| noop(),
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
        })
    }

    fn resolve(
        &mut self,
        env: Env,
        (output, eliminated_packages): Self::Output,
    ) -> Result<Self::JsValue> {
        complete_output(&env, output, eliminated_packages)
    }
}

#[napi]
pub fn transform(
    env: Env,
    src: Either3<String, Buffer, Undefined>,
    _is_module: bool,
    options: Buffer,
) -> Result<Object> {
    let c = get_compiler();

    let input = match src {
        Either3::A(src) => Input::Source { src },
        Either3::B(src) => Input::Source {
            src: String::from_utf8_lossy(&src).to_string(),
        },
        Either3::C(_) => Input::FromFilename,
    };

    let options = options.to_vec();

    let mut task = TransformTask { c, input, options };

    env.execute_tokio_future(
        async move { task.compute() },
        |env, (output, eliminated_packages)| complete_output(env, output, eliminated_packages),
    )
}

#[napi]
pub fn transform_sync(
    env: Env,
    src: Either3<String, Buffer, Undefined>,
    _is_module: bool,
    options: Buffer,
) -> Result<Object> {
    let c = get_compiler();

    let input = match src {
        Either3::A(src) => Input::Source { src },
        Either3::B(src) => Input::Source {
            src: String::from_utf8_lossy(&src).to_string(),
        },
        Either3::C(_) => Input::FromFilename,
    };

    let options = options.to_vec();

    let mut task = TransformTask { c, input, options };

    let output = block_on(async { task.compute() })?;

    task.resolve(env, output)
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
