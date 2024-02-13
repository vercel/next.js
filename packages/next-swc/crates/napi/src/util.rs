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

use std::{cell::RefCell, path::PathBuf};

use anyhow::anyhow;
use napi::bindgen_prelude::{External, Status};
use tracing_chrome::{ChromeLayerBuilder, FlushGuard};
use tracing_subscriber::{filter, prelude::*, util::SubscriberInitExt, Layer};

#[napi]
pub fn get_target_triple() -> String {
    crate::build::BUILD_TARGET.to_string()
}

pub trait MapErr<T>: Into<Result<T, anyhow::Error>> {
    fn convert_err(self) -> napi::Result<T> {
        self.into()
            .map_err(|err| napi::Error::new(Status::GenericFailure, format!("{:?}", err)))
    }
}

impl<T> MapErr<T> for Result<T, anyhow::Error> {}

#[cfg(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc"))]
#[napi]
pub fn init_heap_profiler() -> napi::Result<External<RefCell<Option<dhat::Profiler>>>> {
    #[cfg(feature = "__internal_dhat-heap")]
    {
        println!("[dhat-heap]: Initializing heap profiler");
        let _profiler = dhat::Profiler::new_heap();
        return Ok(External::new(RefCell::new(Some(_profiler))));
    }

    #[cfg(feature = "__internal_dhat-ad-hoc")]
    {
        println!("[dhat-ad-hoc]: Initializing ad-hoc profiler");
        let _profiler = dhat::Profiler::new_ad_hoc();
        return Ok(External::new(RefCell::new(Some(_profiler))));
    }
}

#[cfg(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc"))]
#[napi]
pub fn teardown_heap_profiler(guard_external: External<RefCell<Option<dhat::Profiler>>>) {
    let guard_cell = &*guard_external;

    if let Some(guard) = guard_cell.take() {
        println!("[dhat]: Teardown profiler");
        drop(guard);
    }
}

#[cfg(not(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc")))]
#[napi]
pub fn init_heap_profiler() -> napi::Result<External<RefCell<Option<u32>>>> {
    Ok(External::new(RefCell::new(Some(0))))
}

#[cfg(not(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc")))]
#[napi]
pub fn teardown_heap_profiler(_guard_external: External<RefCell<Option<u32>>>) {}

/// Initialize tracing subscriber to emit traces. This configures subscribers
/// for Trace Event Format <https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview>.
#[napi]
pub fn init_custom_trace_subscriber(
    trace_out_file_path: Option<String>,
) -> napi::Result<External<RefCell<Option<FlushGuard>>>> {
    let trace_out_file_path = trace_out_file_path.map(PathBuf::from);

    let mut layer = ChromeLayerBuilder::new().include_args(true);
    if let Some(trace_out_file) = trace_out_file_path {
        let dir = trace_out_file
            .parent()
            .ok_or_else(|| anyhow!("Not able to find path to the trace output"))
            .convert_err()?;
        std::fs::create_dir_all(dir)?;

        layer = layer.file(trace_out_file);
    }

    let (chrome_layer, guard) = layer.build();
    tracing_subscriber::registry()
        .with(chrome_layer.with_filter(filter::filter_fn(|metadata| {
            !metadata.target().contains("cranelift") && !metadata.name().contains("log ")
        })))
        .try_init()
        .expect("Failed to register tracing subscriber");

    let guard_cell = RefCell::new(Some(guard));
    Ok(External::new(guard_cell))
}

/// Teardown currently running tracing subscriber to flush out remaining traces.
/// This should be called when parent node.js process exits, otherwise generated
/// trace may drop traces in the buffer.
#[napi]
pub fn teardown_trace_subscriber(guard_external: External<RefCell<Option<FlushGuard>>>) {
    let guard_cell = &*guard_external;

    if let Some(guard) = guard_cell.take() {
        drop(guard);
    }
}
