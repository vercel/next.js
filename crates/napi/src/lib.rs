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
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

#[macro_use]
extern crate napi_derive;

use std::{
    panic::set_hook,
    sync::{Arc, Once},
};

use backtrace::Backtrace;
use napi::bindgen_prelude::*;
use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::{
    atoms::Atom,
    base::{Compiler, TransformOutput},
    common::{FilePathMapping, SourceMap},
};
#[cfg(not(target_arch = "wasm32"))]
pub mod css;
pub mod mdx;
pub mod minify;
#[cfg(not(target_arch = "wasm32"))]
pub mod next_api;
pub mod parse;
pub mod transform;
#[cfg(not(target_arch = "wasm32"))]
pub mod turbo_trace_server;
#[cfg(not(target_arch = "wasm32"))]
pub mod turbopack;
pub mod util;

// Declare build-time information variables generated in build.rs
shadow_rs::shadow!(build);

#[cfg(not(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc")))]
#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

#[cfg(feature = "__internal_dhat-heap")]
#[global_allocator]
static ALLOC: dhat::Alloc = dhat::Alloc;

#[cfg(not(target_arch = "wasm32"))]
#[napi::module_init]

fn init() {
    use tokio::runtime::Builder;
    use turbo_tasks_malloc::TurboMalloc;

    set_hook(Box::new(|panic_info| {
        util::log_internal_error_and_inform(&format!(
            "Panic: {}\nBacktrace: {:?}",
            panic_info,
            Backtrace::new()
        ));
    }));
    let rt = Builder::new_multi_thread()
        .enable_all()
        .on_thread_stop(|| {
            TurboMalloc::thread_stop();
        })
        .disable_lifo_slot()
        .build()
        .unwrap();
    create_custom_tokio_runtime(rt);
}

#[inline]
fn get_compiler() -> Compiler {
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    Compiler::new(cm)
}

pub fn complete_output(
    env: &Env,
    output: TransformOutput,
    eliminated_packages: FxHashSet<Atom>,
    use_cache_telemetry_tracker: FxHashMap<String, usize>,
) -> napi::Result<Object> {
    let mut js_output = env.create_object()?;
    js_output.set_named_property("code", env.create_string_from_std(output.code)?)?;
    if let Some(map) = output.map {
        js_output.set_named_property("map", env.create_string_from_std(map)?)?;
    }
    if !eliminated_packages.is_empty() {
        js_output.set_named_property(
            "eliminatedPackages",
            env.create_string_from_std(serde_json::to_string(&eliminated_packages)?)?,
        )?;
    }
    if !use_cache_telemetry_tracker.is_empty() {
        js_output.set_named_property(
            "useCacheTelemetryTracker",
            env.create_string_from_std(serde_json::to_string(
                &use_cache_telemetry_tracker
                    .iter()
                    .map(|(k, v)| (k.clone(), *v))
                    .collect::<Vec<_>>(),
            )?)?,
        )?;
    }

    Ok(js_output)
}

static REGISTER_ONCE: Once = Once::new();

#[cfg(not(target_arch = "wasm32"))]
fn register() {
    REGISTER_ONCE.call_once(|| {
        ::next_api::register();
        next_core::register();
        include!(concat!(env!("OUT_DIR"), "/register.rs"));
    });
}

#[cfg(target_arch = "wasm32")]
fn register() {
    //noop
}
