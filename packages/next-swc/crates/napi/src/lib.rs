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

#![recursion_limit = "2048"]
//#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;
/// Explicit extern crate to use allocator.
extern crate swc_node_base;

use backtrace::Backtrace;
use fxhash::FxHashSet;
use napi::{CallContext, Env, JsObject, JsUndefined};
use std::{env, panic::set_hook, sync::Arc};
use swc::{Compiler, TransformOutput};
use swc_common::{self, sync::Lazy, FilePathMapping, SourceMap};

mod bundle;
mod minify;
mod parse;
mod transform;
mod util;

static COMPILER: Lazy<Arc<Compiler>> = Lazy::new(|| {
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    Arc::new(Compiler::new(cm))
});

#[module_exports]
fn init(mut exports: JsObject) -> napi::Result<()> {
    if cfg!(debug_assertions) || env::var("SWC_DEBUG").unwrap_or_default() == "1" {
        set_hook(Box::new(|panic_info| {
            let backtrace = Backtrace::new();
            println!("Panic: {:?}\nBacktrace: {:?}", panic_info, backtrace);
        }));
    }

    exports.create_named_method("bundle", bundle::bundle)?;

    exports.create_named_method("transform", transform::transform)?;
    exports.create_named_method("transformSync", transform::transform_sync)?;

    exports.create_named_method("minify", minify::minify)?;
    exports.create_named_method("minifySync", minify::minify_sync)?;

    exports.create_named_method("parse", parse::parse)?;

    exports.create_named_method("getTargetTriple", util::get_target_triple)?;

    Ok(())
}

fn get_compiler(_ctx: &CallContext) -> Arc<Compiler> {
    COMPILER.clone()
}

#[js_function]
fn construct_compiler(ctx: CallContext) -> napi::Result<JsUndefined> {
    // TODO: Assign swc::Compiler
    ctx.env.get_undefined()
}

pub fn complete_output(
    env: &Env,
    output: TransformOutput,
    eliminated_packages: FxHashSet<String>,
) -> napi::Result<JsObject> {
    let mut js_output = env.create_object()?;
    js_output.set_named_property("code", env.create_string_from_std(output.code)?)?;
    if let Some(map) = output.map {
        js_output.set_named_property("map", env.create_string_from_std(map)?)?;
    }
    if !eliminated_packages.is_empty() {
        js_output.set_named_property(
            "eliminatedPackages",
            env.create_string_from_std(serde_json::to_string(
                &eliminated_packages.into_iter().collect::<Vec<String>>(),
            )?)?,
        )?;
    }
    Ok(js_output)
}

pub type ArcCompiler = Arc<Compiler>;
