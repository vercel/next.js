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
#![feature(async_fn_in_trait)]

#[macro_use]
extern crate napi_derive;

use std::{
    env,
    panic::set_hook,
    sync::{Arc, Once},
};

use backtrace::Backtrace;
use fxhash::FxHashSet;
use napi::bindgen_prelude::*;
use shadow_rs::shadow;
use turbopack_binding::swc::core::{
    base::{Compiler, TransformOutput},
    common::{sync::Lazy, FilePathMapping, SourceMap},
};

pub mod app_structure;
pub mod mdx;
pub mod minify;
pub mod next_api;
pub mod parse;
pub mod transform;
pub mod turbopack;
pub mod turbotrace;
pub mod util;

// don't use turbo malloc (`mimalloc`) on linux-musl-aarch64 because of the
// compile error
#[cfg(not(any(
    all(target_os = "linux", target_env = "musl", target_arch = "aarch64"),
    feature = "__internal_dhat-heap",
    feature = "__internal_dhat-ad-hoc"
)))]
#[global_allocator]
static ALLOC: turbopack_binding::turbo::malloc::TurboMalloc =
    turbopack_binding::turbo::malloc::TurboMalloc;

#[cfg(feature = "__internal_dhat-heap")]
#[global_allocator]
static ALLOC: dhat::Alloc = dhat::Alloc;

static COMPILER: Lazy<Arc<Compiler>> = Lazy::new(|| {
    let cm = Arc::new(SourceMap::new(FilePathMapping::empty()));

    Arc::new(Compiler::new(cm))
});

shadow!(build);

#[napi::module_init]
fn init() {
    if cfg!(debug_assertions) || env::var("SWC_DEBUG").unwrap_or_default() == "1" {
        set_hook(Box::new(|panic_info| {
            let backtrace = Backtrace::new();
            println!("Panic: {:?}\nBacktrace: {:?}", panic_info, backtrace);
        }));
    }

    println!("debug:{}", shadow_rs::is_debug()); // check if this is a debug build. e.g 'true/false'
    println!("branch:{}", shadow_rs::branch()); // get current project branch. e.g 'master/develop'
    println!("tag:{}", shadow_rs::tag()); // get current project tag. e.g 'v1.3.5'
    println!("git_clean:{}", shadow_rs::git_clean()); // get current project clean. e.g 'true/false'
    println!("git_status_file:{}", shadow_rs::git_status_file()); // get current project statue file. e.g '  * examples/builtin_fn.rs (dirty)'

    println!("{}", build::VERSION); //print version const
    println!("{}", build::CLAP_LONG_VERSION); //print CLAP_LONG_VERSION const
    println!("{}", build::BRANCH); //master
    println!("{}", build::SHORT_COMMIT); //8405e28e
    println!("{}", build::COMMIT_HASH); //8405e28e64080a09525a6cf1b07c22fcaf71a5c5
    println!("{}", build::COMMIT_DATE); //2021-08-04 12:34:03 +00:00
    println!("{}", build::COMMIT_AUTHOR); //baoyachi
    println!("{}", build::COMMIT_EMAIL); //xxx@gmail.com

    println!("{}", build::BUILD_OS); //macos-x86_64
    println!("{}", build::RUST_VERSION); //rustc 1.45.0 (5c1f21c3b 2020-07-13)
    println!("{}", build::RUST_CHANNEL); //stable-x86_64-apple-darwin (default)
    println!("{}", build::CARGO_VERSION); //cargo 1.45.0 (744bd1fbb 2020-06-15)
    println!("{}", build::PKG_VERSION); //0.3.13
    println!("{}", build::CARGO_TREE); //like command:cargo tree
    println!("{}", build::CARGO_MANIFEST_DIR); // /User/baoyachi/shadow-rs/ |

    println!("{}", build::PROJECT_NAME); //shadow-rs
    println!("{}", build::BUILD_TIME); //2020-08-16 14:50:25
    println!("{}", build::BUILD_RUST_CHANNEL); //debug
    println!("{}", build::GIT_CLEAN); //false
    println!("{}", build::GIT_STATUS_FILE);
}

#[inline]
fn get_compiler() -> Arc<Compiler> {
    COMPILER.clone()
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

fn register() {
    REGISTER_ONCE.call_once(|| {
        ::next_api::register();
        next_core::register();
        include!(concat!(env!("OUT_DIR"), "/register.rs"));
    });
}

#[cfg(all(feature = "native-tls", feature = "rustls-tls"))]
compile_error!("You can't enable both `native-tls` and `rustls-tls`");

#[cfg(all(not(feature = "native-tls"), not(feature = "rustls-tls")))]
compile_error!("You have to enable one of the TLS backends: `native-tls` or `rustls-tls`");
