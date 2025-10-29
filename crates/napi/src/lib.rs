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
#![feature(iter_intersperse)]

#[macro_use]
extern crate napi_derive;

use std::sync::Arc;

use napi::bindgen_prelude::*;
use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::{
    atoms::Atom,
    base::{Compiler, TransformOutput},
    common::{FilePathMapping, SourceMap},
};

#[cfg(not(target_arch = "wasm32"))]
pub mod css;
pub mod lockfile;
pub mod mdx;
pub mod minify;
#[cfg(not(target_arch = "wasm32"))]
pub mod next_api;
pub mod parse;
pub mod react_compiler;
pub mod rspack;
pub mod transform;
#[cfg(not(target_arch = "wasm32"))]
pub mod turbo_trace_server;
#[cfg(not(target_arch = "wasm32"))]
pub mod turbopack;
pub mod util;

#[cfg(not(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc")))]
#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

#[cfg(feature = "__internal_dhat-heap")]
#[global_allocator]
static ALLOC: dhat::Alloc = dhat::Alloc;

#[cfg(not(target_arch = "wasm32"))]
#[napi::module_init]
fn init() {
    use std::{
        cell::RefCell,
        panic::{set_hook, take_hook},
        thread::available_parallelism,
        time::{Duration, Instant},
    };

    thread_local! {
        static LAST_SWC_ATOM_GC_TIME: RefCell<Option<Instant>> = const { RefCell::new(None) };
    }

    use tokio::runtime::Builder;
    use turbo_tasks::panic_hooks::handle_panic;
    use turbo_tasks_malloc::TurboMalloc;

    let prev_hook = take_hook();
    set_hook(Box::new(move |info| {
        handle_panic(info);
        prev_hook(info);
    }));

    let worker_threads = available_parallelism().map(|n| n.get()).unwrap_or(1);

    let rt = Builder::new_multi_thread()
        .enable_all()
        .on_thread_stop(|| {
            TurboMalloc::thread_stop();
        })
        .on_thread_park(|| {
            LAST_SWC_ATOM_GC_TIME.with_borrow_mut(|cell| {
                if cell.is_none_or(|t| t.elapsed() > Duration::from_secs(2)) {
                    swc_core::ecma::atoms::hstr::global_atom_store_gc();
                    *cell = Some(Instant::now());
                }
            });
        })
        .worker_threads(worker_threads)
        // Avoid a limit on threads to avoid deadlocks due to usage of block_in_place
        .max_blocking_threads(usize::MAX - worker_threads)
        // Avoid the extra lifo slot to avoid stalling tasks when doing cpu-heavy work
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
