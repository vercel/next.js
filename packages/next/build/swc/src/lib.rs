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
use napi::{CallContext, Env, JsObject, JsUndefined};
use serde::Deserialize;
use std::{env, panic::set_hook, path::PathBuf, sync::Arc};
use swc::{Compiler, TransformOutput};
use swc_common::{self, chain, pass::Optional, sync::Lazy, FileName, FilePathMapping, SourceMap};
use swc_ecmascript::visit::Fold;

pub mod amp_attributes;
pub mod hook_optimizer;
pub mod minify;
pub mod next_dynamic;
pub mod next_ssg;
pub mod page_config;
pub mod styled_jsx;
mod transform;
mod util;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformOptions {
    #[serde(flatten)]
    pub swc: swc::config::Options,

    #[serde(default)]
    pub disable_next_ssg: bool,

    #[serde(default)]
    pub disable_page_config: bool,

    #[serde(default)]
    pub pages_dir: Option<PathBuf>,

    #[serde(default)]
    pub is_page_file: bool,

    #[serde(default)]
    pub is_development: bool,
}

pub fn custom_before_pass(name: &FileName, opts: &TransformOptions) -> impl Fold {
    chain!(
        styled_jsx::styled_jsx(),
        hook_optimizer::hook_optimizer(),
        Optional::new(next_ssg::next_ssg(), !opts.disable_next_ssg),
        amp_attributes::amp_attributes(),
        next_dynamic::next_dynamic(name.clone(), opts.pages_dir.clone()),
        Optional::new(
            page_config::page_config(opts.is_development, opts.is_page_file),
            !opts.disable_page_config
        )
    )
}

static COMPILER: Lazy<Arc<Compiler>> = Lazy::new(|| {
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    Arc::new(Compiler::new(cm.clone()))
});

#[module_exports]
fn init(mut exports: JsObject) -> napi::Result<()> {
    if cfg!(debug_assertions) || env::var("SWC_DEBUG").unwrap_or_default() == "1" {
        set_hook(Box::new(|panic_info| {
            let backtrace = Backtrace::new();
            println!("Panic: {:?}\nBacktrace: {:?}", panic_info, backtrace);
        }));
    }

    exports.create_named_method("transform", transform::transform)?;
    exports.create_named_method("transformSync", transform::transform_sync)?;

    exports.create_named_method("minify", minify::minify)?;
    exports.create_named_method("minifySync", minify::minify_sync)?;

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

pub fn complete_output(env: &Env, output: TransformOutput) -> napi::Result<JsObject> {
    env.to_js_value(&output)?.coerce_to_object()
}

pub type ArcCompiler = Arc<Compiler>;
