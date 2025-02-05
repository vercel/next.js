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
};

use anyhow::{anyhow, bail, Context as _};
use napi::bindgen_prelude::*;
use next_custom_transforms::chain_transforms::{custom_before_pass, TransformOptions};
use once_cell::sync::Lazy;
use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::{
    atoms::Atom,
    base::{try_with_handler, Compiler, TransformOutput},
    common::{comments::SingleThreadedComments, errors::ColorConfig, FileName, Mark, GLOBALS},
    ecma::ast::noop_pass,
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
    pub c: Compiler,
    pub input: Input,
    pub options: Buffer,
}

fn skip_filename() -> bool {
    fn check(name: &str) -> bool {
        let v = std::env::var(name);
        let v = match v {
            Ok(v) => v,
            Err(_) => return false,
        };

        !v.is_empty() && v != "0"
    }

    static SKIP_FILENAME: Lazy<bool> = Lazy::new(|| {
        check("NEXT_TEST_MODE") || check("__NEXT_TEST_MODE") || check("NEXT_TEST_JOB")
    });

    *SKIP_FILENAME
}

impl Task for TransformTask {
    type Output = (TransformOutput, FxHashSet<Atom>, FxHashMap<String, usize>);
    type JsValue = Object;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        GLOBALS.set(&Default::default(), || {
            let eliminated_packages: Rc<RefCell<FxHashSet<Atom>>> = Default::default();
            let use_cache_telemetry_tracker: Rc<RefCell<FxHashMap<String, usize>>> =
                Default::default();

            let res = catch_unwind(AssertUnwindSafe(|| {
                try_with_handler(
                    self.c.cm.clone(),
                    swc_core::base::HandlerOpts {
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

                                    self.c.cm.new_source_file(filename.into(), src.to_string())
                                }
                                Input::FromFilename => {
                                    let filename = &options.swc.filename;
                                    if filename.is_empty() {
                                        bail!("no filename is provided via options");
                                    }

                                    self.c.cm.new_source_file(
                                        FileName::Real(filename.into()).into(),
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
                                        use_cache_telemetry_tracker.clone(),
                                    )
                                },
                                |_| noop_pass(),
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
                    .map(|o| {
                        (
                            o,
                            eliminated_packages.replace(Default::default()),
                            Rc::into_inner(use_cache_telemetry_tracker)
                                .expect(
                                    "All other copies of use_cache_telemetry_tracker should be \
                                     dropped by this point",
                                )
                                .into_inner(),
                        )
                    })
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
        (output, eliminated_packages, use_cache_telemetry_tracker): Self::Output,
    ) -> napi::Result<Self::JsValue> {
        complete_output(
            &env,
            output,
            eliminated_packages,
            use_cache_telemetry_tracker,
        )
    }
}

#[napi]
pub fn transform(
    src: Either3<String, Buffer, Undefined>,
    _is_module: bool,
    options: Buffer,
    signal: Option<AbortSignal>,
) -> napi::Result<AsyncTask<TransformTask>> {
    let c = get_compiler();

    let input = match src {
        Either3::A(src) => Input::Source { src },
        Either3::B(src) => Input::Source {
            src: String::from_utf8_lossy(&src).to_string(),
        },
        Either3::C(_) => Input::FromFilename,
    };

    let task = TransformTask { c, input, options };
    Ok(AsyncTask::with_optional_signal(task, signal))
}

#[napi]
pub fn transform_sync(
    env: Env,
    src: Either3<String, Buffer, Undefined>,
    _is_module: bool,
    options: Buffer,
) -> napi::Result<Object> {
    let c = get_compiler();

    let input = match src {
        Either3::A(src) => Input::Source { src },
        Either3::B(src) => Input::Source {
            src: String::from_utf8_lossy(&src).to_string(),
        },
        Either3::C(_) => Input::FromFilename,
    };

    let mut task = TransformTask { c, input, options };
    let output = task.compute()?;
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
