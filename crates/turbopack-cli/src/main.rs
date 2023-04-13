#![feature(future_join)]
#![feature(min_specialization)]

use anyhow::Result;
use clap::Parser;
use turbopack_cli::{arguments::Arguments, register};

#[global_allocator]
static ALLOC: turbo_malloc::TurboMalloc = turbo_malloc::TurboMalloc;

fn main() {
    use turbo_malloc::TurboMalloc;

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .on_thread_stop(|| {
            TurboMalloc::thread_stop();
        })
        .build()
        .unwrap()
        .block_on(main_inner())
        .unwrap()
}

async fn main_inner() -> Result<()> {
    register();
    let args = Arguments::parse();

    match args {
        Arguments::Dev(args) => turbopack_cli::dev::start_server(&args).await,
    }
}
