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

#[macro_use]
extern crate napi_derive;

use std::{
    env,
    io::prelude::*,
    panic::set_hook,
    sync::{Arc, Mutex, Once},
    time::Instant,
};

use backtrace::Backtrace;
use fxhash::FxHashSet;
use napi::bindgen_prelude::*;
use owo_colors::OwoColorize;
use turbopack_binding::swc::core::{
    base::{Compiler, TransformOutput},
    common::{FilePathMapping, SourceMap},
};

#[cfg(not(target_arch = "wasm32"))]
pub mod app_structure;
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
#[cfg(not(target_arch = "wasm32"))]
pub mod turbotrace;
pub mod util;

// Declare build-time information variables generated in build.rs
shadow_rs::shadow!(build);

#[cfg(not(any(feature = "__internal_dhat-heap", feature = "__internal_dhat-ad-hoc")))]
#[global_allocator]
static ALLOC: turbopack_binding::turbo::malloc::TurboMalloc =
    turbopack_binding::turbo::malloc::TurboMalloc;

static LOG_THROTTLE: Mutex<Option<Instant>> = Mutex::new(None);
static LOG_FILE_PATH: &str = ".next/turbopack.log";

#[cfg(feature = "__internal_dhat-heap")]
#[global_allocator]
static ALLOC: dhat::Alloc = dhat::Alloc;

#[cfg(not(target_arch = "wasm32"))]
#[napi::module_init]

fn init() {
    use std::{fs::OpenOptions, io};

    set_hook(Box::new(|panic_info| {
        // hold open this mutex guard to prevent concurrent writes to the file!
        let mut last_error_time = LOG_THROTTLE.lock().unwrap();
        if let Some(last_error_time) = last_error_time.as_ref() {
            if last_error_time.elapsed().as_secs() < 1 {
                // Throttle panic logging to once per second
                return;
            }
        }
        *last_error_time = Some(Instant::now());

        let backtrace = Backtrace::new();
        let info = format!("Panic: {}\nBacktrace: {:?}", panic_info, backtrace);
        if cfg!(debug_assertions) || env::var("SWC_DEBUG") == Ok("1".to_string()) {
            eprintln!("{}", info);
        } else {
            let size = std::fs::metadata(LOG_FILE_PATH).map(|m| m.len());
            if let Ok(size) = size {
                if size > 512 * 1024 {
                    // Truncate the earliest error from log file if it's larger than 512KB
                    let new_lines = {
                        let log_read = OpenOptions::new()
                            .read(true)
                            .open(LOG_FILE_PATH)
                            .unwrap_or_else(|_| panic!("Failed to open {}", LOG_FILE_PATH));

                        io::BufReader::new(&log_read)
                            .lines()
                            .skip(1)
                            .skip_while(|line| match line {
                                Ok(line) => !line.starts_with("Panic:"),
                                Err(_) => false,
                            })
                            .collect::<Vec<_>>()
                    };

                    let mut log_write = OpenOptions::new()
                        .create(true)
                        .truncate(true)
                        .write(true)
                        .open(LOG_FILE_PATH)
                        .unwrap_or_else(|_| panic!("Failed to open {}", LOG_FILE_PATH));

                    for line in new_lines {
                        match line {
                            Ok(line) => {
                                writeln!(log_write, "{}", line).unwrap();
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
                .open(LOG_FILE_PATH)
                .unwrap_or_else(|_| panic!("Failed to open {}", LOG_FILE_PATH));

            writeln!(log_file, "{}", info).unwrap();
            eprintln!("{}: An unexpected Turbopack error occurred. Please report the content of {} to https://github.com/vercel/next.js/issues/new", "FATAL".red().bold(), LOG_FILE_PATH);
        }
    }));
}

#[inline]
fn get_compiler() -> Arc<Compiler> {
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    Arc::new(Compiler::new(cm))
}

pub fn complete_output(
    env: &Env,
    output: TransformOutput,
    eliminated_packages: FxHashSet<String>,
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
    Ok(js_output)
}

pub type ArcCompiler = Arc<Compiler>;

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
