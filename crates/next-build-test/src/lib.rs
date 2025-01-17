#![feature(future_join)]
#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::{str::FromStr, time::Instant};

use anyhow::{Context, Result};
use futures_util::{StreamExt, TryStreamExt};
use next_api::{
    project::{ProjectContainer, ProjectOptions},
    route::{Endpoint, Route},
};
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadConsistency, TransientInstance, TurboTasks, Vc};
use turbo_tasks_malloc::TurboMalloc;
use turbo_tasks_memory::MemoryBackend;

pub async fn main_inner(
    tt: &TurboTasks<MemoryBackend>,
    strat: Strategy,
    factor: usize,
    limit: usize,
    files: Option<Vec<String>>,
) -> Result<()> {
    register();

    let path = std::env::current_dir()?.join("project_options.json");
    let mut file = std::fs::File::open(&path)
        .with_context(|| format!("loading file at {}", path.display()))?;

    let mut options: ProjectOptions = serde_json::from_reader(&mut file)?;

    if matches!(strat, Strategy::Development { .. }) {
        options.dev = true;
        options.watch.enable = true;
    } else {
        options.dev = false;
        options.watch.enable = false;
    }

    let project = tt
        .run_once(async {
            let project = ProjectContainer::new("next-build-test".into(), options.dev);
            let project = project.resolve().await?;
            project.initialize(options).await?;
            Ok(project)
        })
        .await?;

    tracing::info!("collecting endpoints");
    let entrypoints = tt
        .run_once(async move { project.entrypoints().await })
        .await?;

    let mut routes = if let Some(files) = files {
        tracing::info!("builing only the files:");
        for file in &files {
            tracing::info!("  {}", file);
        }

        // filter out the files that are not in the list
        // we expect this to be small so linear search OK
        Box::new(files.into_iter().filter_map(|f| {
            entrypoints
                .routes
                .iter()
                .find(|(name, _)| f.as_str() == name.as_str())
                .map(|(name, route)| (name.clone(), route.clone()))
        })) as Box<dyn Iterator<Item = _> + Send + Sync>
    } else {
        Box::new(entrypoints.routes.clone().into_iter())
    };

    if strat.randomized() {
        routes = Box::new(shuffle(routes))
    }

    let start = Instant::now();
    let count = render_routes(tt, routes, strat, factor, limit).await?;
    tracing::info!("rendered {} pages in {:?}", count, start.elapsed());

    if count == 0 {
        tracing::info!("No pages found, these pages exist:");
        for (route, _) in entrypoints.routes.iter() {
            tracing::info!("  {}", route);
        }
    }

    if matches!(strat, Strategy::Development { .. }) {
        hmr(tt, project).await?;
    }

    Ok(())
}

pub fn register() {
    next_api::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}

#[derive(PartialEq, Copy, Clone)]
pub enum Strategy {
    Sequential { randomized: bool },
    Concurrent,
    Parallel { randomized: bool },
    Development { randomized: bool },
}

impl std::fmt::Display for Strategy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Strategy::Sequential { randomized: false } => write!(f, "sequential"),
            Strategy::Sequential { randomized: true } => write!(f, "sequential-randomized"),
            Strategy::Concurrent => write!(f, "concurrent"),
            Strategy::Parallel { randomized: false } => write!(f, "parallel"),
            Strategy::Parallel { randomized: true } => write!(f, "parallel-randomized"),
            Strategy::Development { randomized: false } => write!(f, "development"),
            Strategy::Development { randomized: true } => write!(f, "development-randomized"),
        }
    }
}

impl FromStr for Strategy {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        match s {
            "sequential" => Ok(Strategy::Sequential { randomized: false }),
            "sequential-randomized" => Ok(Strategy::Sequential { randomized: true }),
            "concurrent" => Ok(Strategy::Concurrent),
            "parallel" => Ok(Strategy::Parallel { randomized: false }),
            "parallel-randomized" => Ok(Strategy::Parallel { randomized: true }),
            "development" => Ok(Strategy::Development { randomized: false }),
            "development-randomized" => Ok(Strategy::Development { randomized: true }),
            _ => Err(anyhow::anyhow!("invalid strategy")),
        }
    }
}

impl Strategy {
    pub fn randomized(&self) -> bool {
        match self {
            Strategy::Sequential { randomized } => *randomized,
            Strategy::Concurrent => false,
            Strategy::Parallel { randomized } => *randomized,
            Strategy::Development { randomized } => *randomized,
        }
    }
}

pub fn shuffle<'a, T: 'a>(items: impl Iterator<Item = T>) -> impl Iterator<Item = T> {
    use rand::{seq::SliceRandom, SeedableRng};
    let mut rng = rand::rngs::SmallRng::from_seed([0; 32]);
    let mut input = items.collect::<Vec<_>>();
    input.shuffle(&mut rng);
    input.into_iter()
}

pub async fn render_routes(
    tt: &TurboTasks<MemoryBackend>,
    routes: impl Iterator<Item = (RcStr, Route)>,
    strategy: Strategy,
    factor: usize,
    limit: usize,
) -> Result<usize> {
    tracing::info!(
        "rendering routes with {} parallel and strat {}",
        factor,
        strategy
    );

    let stream = tokio_stream::iter(routes)
        .map(move |(name, route)| async move {
            tracing::info!("{name}...");
            let start = Instant::now();

            let memory = TurboMalloc::memory_usage();

            tt.run_once({
                let name = name.clone();
                async move {
                    match route {
                        Route::Page {
                            html_endpoint,
                            data_endpoint: _,
                        } => {
                            html_endpoint.write_to_disk().await?;
                        }
                        Route::PageApi { endpoint } => {
                            endpoint.write_to_disk().await?;
                        }
                        Route::AppPage(routes) => {
                            for route in routes {
                                route.html_endpoint.write_to_disk().await?;
                            }
                        }
                        Route::AppRoute {
                            original_name: _,
                            endpoint,
                        } => {
                            endpoint.write_to_disk().await?;
                        }
                        Route::Conflict => {
                            tracing::info!("WARN: conflict {}", name);
                        }
                    }
                    Ok(())
                }
            })
            .await?;

            let duration = start.elapsed();
            let memory_after = TurboMalloc::memory_usage();
            if matches!(strategy, Strategy::Sequential { .. }) {
                if memory_after > memory {
                    tracing::info!(
                        "{name} {:?} {} MiB (memory usage increased by {} MiB)",
                        duration,
                        memory_after / 1024 / 1024,
                        (memory_after - memory) / 1024 / 1024
                    );
                } else {
                    tracing::info!(
                        "{name} {:?} {} MiB (memory usage decreased by {} MiB)",
                        duration,
                        memory_after / 1024 / 1024,
                        (memory - memory_after) / 1024 / 1024
                    );
                }
            } else {
                tracing::info!("{name} {:?} {} MiB", duration, memory_after / 1024 / 1024);
            }

            Ok::<_, anyhow::Error>(())
        })
        .take(limit)
        .buffer_unordered(factor)
        .try_collect::<Vec<_>>()
        .await?;

    Ok(stream.len())
}

async fn hmr(tt: &TurboTasks<MemoryBackend>, project: Vc<ProjectContainer>) -> Result<()> {
    tracing::info!("HMR...");
    let session = TransientInstance::new(());
    let idents = tt
        .run_once(async move { project.hmr_identifiers().await })
        .await?;
    let start = Instant::now();
    for ident in idents {
        if !ident.ends_with(".js") {
            continue;
        }
        let session = session.clone();
        let start = Instant::now();
        let task = tt.spawn_root_task(move || {
            let session = session.clone();
            async move {
                let project = project.project();
                let state = project.hmr_version_state(ident.clone(), session);
                project.hmr_update(ident.clone(), state).await?;
                Ok(Vc::<()>::cell(()))
            }
        });
        tt.wait_task_completion(task, ReadConsistency::Strong)
            .await?;
        let e = start.elapsed();
        if e.as_millis() > 10 {
            tracing::info!("HMR: {:?} {:?}", ident, e);
        }
    }
    tracing::info!("HMR {:?}", start.elapsed());

    Ok(())
}
