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

use std::sync::Arc;

use swc_core::{
    base::Compiler,
    common::{FilePathMapping, SourceMap},
};

pub mod code_frame;
// Backed by lightningcss, which is native-only.
#[cfg(not(target_arch = "wasm32"))]
pub mod css;
pub mod lockfile;
pub mod mdx;
pub mod minify;
pub mod next_api;
pub mod parse;
// Backed by swc_ecma_react_compiler, which is native-only.
#[cfg(not(target_arch = "wasm32"))]
pub mod react_compiler;
pub mod rspack;
pub mod transform;
pub mod turbo_trace_server;
pub mod turbopack;
pub mod util;

pub use transform::TransformOutputResult;

#[cfg(not(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc")))]
#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

#[cfg(feature = "__internal_dhat-heap")]
#[global_allocator]
static ALLOC: dhat::Alloc = dhat::Alloc;

#[cfg(not(target_arch = "wasm32"))]
#[napi_derive::module_init]
fn init() {
    use std::{
        cell::RefCell,
        panic::{set_hook, take_hook},
        time::{Duration, Instant},
    };

    thread_local! {
        static LAST_SWC_ATOM_GC_TIME: RefCell<Option<Instant>> = const { RefCell::new(None) };
    }

    use napi::bindgen_prelude::create_custom_tokio_runtime;
    use tokio::runtime::Builder;
    use turbo_tasks::{panic_hooks::handle_panic, parallel::available_parallelism};
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
            TurboMalloc::thread_park();
        })
        .worker_threads(worker_threads)
        // Avoid a limit on threads to avoid deadlocks due to usage of block_in_place
        .max_blocking_threads(usize::MAX - worker_threads)
        // Avoid the extra lifo slot to avoid stalling tasks when doing cpu-heavy work
        .disable_lifo_slot()
        .build()
        .unwrap();
    create_custom_tokio_runtime(rt);

    // napi v2 permanently entered its tokio runtime context on the addon's main thread. Both
    // these bindings and turbo-tasks (e.g. `PriorityRunner`) schedule tokio work from
    // synchronous N-API calls and rely on that ambient context. napi v3 no longer provides it,
    // so restore it: capture the runtime handle (this also forces napi to adopt the custom
    // runtime registered above) and enter it for the lifetime of this thread.
    //
    // TODO: Leaking the guard keeps the runtime alive for the whole process, so tokio never shuts
    // down. Fix the callers that rely on an ambient runtime handle so that this can be dropped.
    let handle =
        napi::bindgen_prelude::within_runtime_if_available(tokio::runtime::Handle::current);
    std::mem::forget(Box::leak(Box::new(handle)).enter());
}

#[inline]
fn get_compiler() -> Compiler {
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    Compiler::new(cm)
}
