#![feature(min_specialization)]

use std::sync::Arc;

use anyhow::Result;
use clap::Parser;
use node_file_trace::{start, Args};
use turbo_tasks::TurboTasks;
use turbo_tasks_memory::MemoryBackend;

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

#[tokio::main]
async fn main() -> Result<()> {
    #[cfg(feature = "tokio_console")]
    console_subscriber::init();
    let args = Arc::new(Args::parse());
    let should_print = matches!(&*args, Args::Print { .. });
    let turbo_tasks = TurboTasks::new(MemoryBackend::new(
        args.common().memory_limit.unwrap_or(usize::MAX),
    ));
    let result = start(args, turbo_tasks, None, None).await?;
    if should_print {
        for file in result.iter() {
            println!("{}", file);
        }
    }
    Ok(())
}
