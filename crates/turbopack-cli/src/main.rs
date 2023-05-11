#![feature(future_join)]
#![feature(min_specialization)]

use anyhow::Result;
use clap::Parser;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Registry};
use turbopack_cli::{arguments::Arguments, register};

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

fn main() {
    use turbo_tasks_malloc::TurboMalloc;

    let subscriber = Registry::default();

    #[cfg(target_os = "macos")]
    let subscriber = subscriber.with(tracing_signpost::SignpostLayer::new());

    let stdout_log = tracing_subscriber::fmt::layer().pretty();
    let subscriber = subscriber.with(stdout_log);

    let subscriber = subscriber.with(EnvFilter::from_default_env());

    subscriber.init();

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
