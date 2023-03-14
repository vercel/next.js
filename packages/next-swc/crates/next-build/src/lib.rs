#![feature(min_specialization)]

pub(crate) mod build_options;
pub(crate) mod next_build;
pub(crate) mod next_pages;

use anyhow::Result;
use turbo_tasks::{run_once, TransientInstance, TurboTasks};
use turbo_tasks_memory::MemoryBackend;

pub use crate::build_options::BuildOptions;

pub async fn build(options: BuildOptions) -> Result<()> {
    #[cfg(feature = "tokio_console")]
    console_subscriber::init();
    register();

    let tt = TurboTasks::new(MemoryBackend::new(
        options.memory_limit.map_or(usize::MAX, |l| l * 1024 * 1024),
    ));

    run_once(tt, async move {
        next_build::next_build(TransientInstance::new(options)).await?;

        Ok(())
    })
    .await?;

    Ok(())
}

pub fn register() {
    turbo_tasks_fs::register();
    turbopack::register();
    turbopack_core::register();
    turbopack_node::register();
    turbopack_dev::register();
    turbopack_build::register();
    next_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
