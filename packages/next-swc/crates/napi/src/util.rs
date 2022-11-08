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

use std::{cell::RefCell, env, path::PathBuf};

use anyhow::anyhow;
use napi::bindgen_prelude::{External, Status};
#[cfg(feature = "crash-report")]
use sentry::{init, types::Dsn, ClientInitGuard, ClientOptions};
use tracing_chrome::{ChromeLayerBuilder, FlushGuard};
use tracing_subscriber::{filter, prelude::*, util::SubscriberInitExt, Layer};

static TARGET_TRIPLE: &str = include_str!(concat!(env!("OUT_DIR"), "/triple.txt"));
#[allow(unused)]
static PACKAGE_VERSION: &str = include_str!(concat!(env!("OUT_DIR"), "/package.txt"));

#[napi]
pub fn get_target_triple() -> String {
    TARGET_TRIPLE.to_owned()
}

pub trait MapErr<T>: Into<Result<T, anyhow::Error>> {
    fn convert_err(self) -> napi::Result<T> {
        self.into()
            .map_err(|err| napi::Error::new(Status::GenericFailure, format!("{:?}", err)))
    }
}

impl<T> MapErr<T> for Result<T, anyhow::Error> {}

/// Initialize tracing subscriber to emit traces. This configures subscribers
/// for Trace Event Format (https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview).
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

#[cfg(all(
    all(target_os = "windows", target_arch = "aarch64"),
    feature = "crash-report"
))]
#[napi]
pub fn init_crash_reporter() -> External<RefCell<Option<usize>>> {
    let guard: Option<usize> = None;
    let guard_cell = RefCell::new(guard);
    External::new(guard_cell)
}

/// Initialize crash reporter to collect unexpected native next-swc crashes.
#[cfg(all(
    not(all(target_os = "windows", target_arch = "aarch64")),
    feature = "crash-report"
))]
#[napi]
pub fn init_crash_reporter() -> External<RefCell<Option<ClientInitGuard>>> {
    use std::{borrow::Cow, str::FromStr};

    // Attempts to follow https://nextjs.org/telemetry's debug behavior.
    // However, this is techinically not identical to the behavior of the telemetry
    // itself as sentry's debug option does not provides full payuload output.
    let debug = env::var("NEXT_TELEMETRY_DEBUG").map_or_else(|_| false, |v| v == "1");

    let guard = {
        let dsn = if debug {
            None
        } else {
            Dsn::from_str(
                "https://7619e5990e3045cda747e50e6ed087a7@o205439.ingest.sentry.io/6528434",
            )
            .ok()
        };

        Some(init(ClientOptions {
            release: Some(Cow::Borrowed(PACKAGE_VERSION)),
            dsn,
            debug,
            // server_name includes device host name, which _can_ be considered as PII depends on
            // the machine name.
            server_name: Some(Cow::Borrowed("[REDACTED]")),
            ..Default::default()
        }))
    };

    let guard_cell = RefCell::new(guard);
    External::new(guard_cell)
}

#[cfg(all(
    all(target_os = "windows", target_arch = "aarch64"),
    feature = "crash-report"
))]
#[napi]
pub fn teardown_crash_reporter(guard_external: External<RefCell<Option<usize>>>) {
    let guard_cell = &*guard_external;

    if let Some(guard) = guard_cell.take() {
        drop(guard);
    }
}

/// Trying to drop crash reporter guard if exists. This is the way to hold
/// guards to not to be dropped immediately after crash reporter is initialized
/// in napi context.
#[cfg(all(
    not(all(target_os = "windows", target_arch = "aarch64")),
    feature = "crash-report"
))]
#[napi]
pub fn teardown_crash_reporter(guard_external: External<RefCell<Option<ClientInitGuard>>>) {
    let guard_cell = &*guard_external;

    if let Some(guard) = guard_cell.take() {
        drop(guard);
    }
}
