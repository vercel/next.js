use turbo_binding::turbo::{
    tasks::{NothingVc, StatsType, TurboTasks, TurboTasksBackendApi},
    tasks_memory::MemoryBackend,
};

pub fn register() {
    turbo_binding::turbo::tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}

pub struct NextBuildOptions {
    pub dir: Option<String>,
    pub memory_limit: Option<usize>,
    pub full_stats: Option<bool>,
}

pub async fn next_build(options: NextBuildOptions) -> anyhow::Result<()> {
    register();
    let tt = TurboTasks::new(MemoryBackend::new(
        options.memory_limit.map_or(usize::MAX, |l| l * 1024 * 1024),
    ));
    let stats_type = match options.full_stats {
        Some(true) => StatsType::Full,
        _ => StatsType::Essential,
    };
    tt.set_stats_type(stats_type);
    let task = tt.spawn_root_task(move || {
        Box::pin(async move {
            // run next build here
            Ok(NothingVc::new().into())
        })
    });
    tt.wait_task_completion(task, true).await?;
    Ok(())
}
