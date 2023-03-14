use turbo_binding::turbo::{
    tasks::{run_once, TransientInstance, TurboTasks},
    tasks_memory::MemoryBackend,
};

pub mod build_options;
pub(crate) mod next_build;
pub(crate) mod next_pages;

use anyhow::Result;

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
    turbo_binding::turbo::tasks::register();
    turbo_binding::turbo::tasks_fs::register();
    turbo_binding::turbopack::turbopack::register();
    turbo_binding::turbopack::core::register();
    turbo_binding::turbopack::node::register();
    turbo_binding::turbopack::dev::register();
    turbo_binding::turbopack::build::register();
    next_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
