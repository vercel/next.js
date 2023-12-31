#![feature(type_alias_impl_trait)]
#![feature(arbitrary_self_types)]

use turbopack_binding::turbo::{
    tasks::{run_once, TransientInstance, TurboTasks},
    tasks_memory::MemoryBackend,
};

pub mod build_options;
pub(crate) mod next_app;
pub(crate) mod next_build;
pub(crate) mod next_pages;

use anyhow::Result;
use turbo_tasks::{StatsType, TurboTasksBackendApi};

pub use self::build_options::BuildOptions;

pub async fn build(options: BuildOptions) -> Result<()> {
    #[cfg(feature = "tokio_console")]
    console_subscriber::init();
    register();

    setup_tracing();

    let tt = TurboTasks::new(MemoryBackend::new(
        options.memory_limit.map_or(usize::MAX, |l| l * 1024 * 1024),
    ));

    let stats_type = match options.full_stats {
        true => StatsType::Full,
        false => StatsType::Essential,
    };
    tt.set_stats_type(stats_type);

    run_once(tt, async move {
        next_build::next_build(TransientInstance::new(options)).await?;

        Ok(())
    })
    .await?;

    Ok(())
}

fn setup_tracing() {
    use tracing_subscriber::{prelude::*, EnvFilter, Registry};

    let subscriber = Registry::default();

    let stdout_log = tracing_subscriber::fmt::layer().pretty();
    let subscriber = subscriber.with(stdout_log);

    let subscriber = subscriber.with(EnvFilter::from_default_env());

    subscriber.init();
}

pub fn register() {
    turbopack_binding::turbo::tasks::register();
    turbopack_binding::turbo::tasks_fs::register();
    turbopack_binding::turbopack::turbopack::register();
    turbopack_binding::turbopack::core::register();
    turbopack_binding::turbopack::node::register();
    turbopack_binding::turbopack::dev::register();
    turbopack_binding::turbopack::build::register();
    next_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
