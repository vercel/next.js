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
    env,
    fs::OpenOptions,
    io::{self, BufRead, Write},
    path::PathBuf,
    sync::Mutex,
    time::Instant,
};

use anyhow::anyhow;
use napi::bindgen_prelude::{External, Status};
use once_cell::sync::Lazy;
use owo_colors::OwoColorize;
use terminal_hyperlink::Hyperlink;
use tracing_chrome::{ChromeLayerBuilder, FlushGuard};
use tracing_subscriber::{Layer, filter, prelude::*, util::SubscriberInitExt};
use turbopack_core::error::PrettyPrintError;

static LOG_THROTTLE: Mutex<Option<Instant>> = Mutex::new(None);
static LOG_DIVIDER: &str = "---------------------------";
static PANIC_LOG: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = env::temp_dir();
    path.push(format!("next-panic-{:x}.log", rand::random::<u128>()));
    path
});

pub fn log_internal_error_and_inform(internal_error: &anyhow::Error) {
    if cfg!(debug_assertions)
        || env::var("SWC_DEBUG") == Ok("1".to_string())
        || env::var("CI").is_ok_and(|v| !v.is_empty())
        // Next's run-tests unsets CI and sets NEXT_TEST_CI
        || env::var("NEXT_TEST_CI").is_ok_and(|v| !v.is_empty())
    {
        eprintln!(
            "{}: An unexpected Turbopack error occurred:\n{}",
            "FATAL".red().bold(),
            PrettyPrintError(internal_error)
        );
        return;
    }

    // hold open this mutex guard to prevent concurrent writes to the file!
    let mut last_error_time = LOG_THROTTLE.lock().unwrap();
    if let Some(last_error_time) = last_error_time.as_ref() {
        if last_error_time.elapsed().as_secs() < 1 {
            // Throttle panic logging to once per second
            return;
        }
    }
    *last_error_time = Some(Instant::now());

    let size = std::fs::metadata(PANIC_LOG.as_path()).map(|m| m.len());
    if let Ok(size) = size {
        if size > 512 * 1024 {
            // Truncate the earliest error from log file if it's larger than 512KB
            let new_lines = {
                let log_read = OpenOptions::new()
                    .read(true)
                    .open(PANIC_LOG.as_path())
                    .unwrap_or_else(|_| panic!("Failed to open {}", PANIC_LOG.to_string_lossy()));

                io::BufReader::new(&log_read)
                    .lines()
                    .skip(1)
                    .skip_while(|line| match line {
                        Ok(line) => !line.starts_with(LOG_DIVIDER),
                        Err(_) => false,
                    })
                    .collect::<Vec<_>>()
            };

            let mut log_write = OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(PANIC_LOG.as_path())
                .unwrap_or_else(|_| panic!("Failed to open {}", PANIC_LOG.to_string_lossy()));

            for line in new_lines {
                match line {
                    Ok(line) => {
                        writeln!(log_write, "{line}").unwrap();
                    }
                    Err(_) => {
                        break;
                    }
                }
            }
        }
    }

    let mut log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(PANIC_LOG.as_path())
        .unwrap_or_else(|_| panic!("Failed to open {}", PANIC_LOG.to_string_lossy()));

    let internal_error_str: String = PrettyPrintError(internal_error).to_string();
    writeln!(log_file, "{}\n{}", LOG_DIVIDER, &internal_error_str).unwrap();

    let title = format!(
        "Turbopack Error: {}",
        internal_error_str.lines().next().unwrap_or("Unknown")
    );
    let version_str = format!(
        "Turbopack version: `{}`\nNext.js version: `{}`",
        env!("VERGEN_GIT_DESCRIBE"),
        env!("NEXTJS_VERSION")
    );
    let new_discussion_url = if supports_hyperlinks::supports_hyperlinks() {
        "clicking here.".hyperlink(
            format!(
                "https://github.com/vercel/next.js/discussions/new?category=turbopack-error-report&title={}&body={}&labels=Turbopack,Turbopack%20Panic%20Backtrace",
                &urlencoding::encode(&title),
                &urlencoding::encode(&format!("{}\n\nError message:\n```\n{}\n```", &version_str, &internal_error_str))
            )
        )
    } else {
        format!(
            "clicking here: https://github.com/vercel/next.js/discussions/new?category=turbopack-error-report&title={}&body={}&labels=Turbopack,Turbopack%20Panic%20Backtrace",
            &urlencoding::encode(&title),
            &urlencoding::encode(&format!("{}\n\nError message:\n```\n{}\n```", &version_str, &title))
        )
    };

    eprintln!(
        "\n-----\n{}: An unexpected Turbopack error occurred. A panic log has been written to \
         {}.\n\nTo help make Turbopack better, report this error by {}\n-----\n",
        "FATAL".red().bold(),
        PANIC_LOG.to_string_lossy(),
        &new_discussion_url
    );
}

#[napi]
pub fn get_target_triple() -> &'static str {
    env!("VERGEN_CARGO_TARGET_TRIPLE")
}

pub trait MapErr<T>: Into<Result<T, anyhow::Error>> {
    fn convert_err(self) -> napi::Result<T> {
        self.into()
            .map_err(|err| napi::Error::new(Status::GenericFailure, format!("{err:?}")))
    }
}

impl<T> MapErr<T> for Result<T, anyhow::Error> {}

/// An opaque type potentially wrapping a [`dhat::Profiler`] instance. If we
/// were not compiled with dhat support, this is an empty struct.
#[cfg(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc"))]
#[non_exhaustive]
pub struct DhatProfilerGuard(dhat::Profiler);

/// An opaque type potentially wrapping a [`dhat::Profiler`] instance. If we
/// were not compiled with dhat support, this is an empty struct.
///
/// [`dhat::Profiler`]: https://docs.rs/dhat/latest/dhat/struct.Profiler.html
#[cfg(not(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc")))]
#[non_exhaustive]
pub struct DhatProfilerGuard;

impl DhatProfilerGuard {
    /// Constructs an instance if we were compiled with dhat support.
    pub fn try_init() -> Option<Self> {
        #[cfg(feature = "__internal_dhat-heap")]
        {
            println!("[dhat-heap]: Initializing heap profiler");
            Some(Self(dhat::Profiler::new_heap()))
        }
        #[cfg(feature = "__internal_dhat-ad-hoc")]
        {
            println!("[dhat-ad-hoc]: Initializing ad-hoc profiler");
            Some(Self(dhat::Profiler::new_ad_hoc()))
        }
        #[cfg(not(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc")))]
        {
            None
        }
    }
}

impl Drop for DhatProfilerGuard {
    fn drop(&mut self) {
        #[cfg(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc"))]
        println!("[dhat]: Teardown profiler");
    }
}

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
