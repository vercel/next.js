#![feature(future_join)]
#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::{str::FromStr, time::Instant};

use anyhow::{Context, Result};
use futures_util::{StreamExt, TryStreamExt};
use next_api::{
    project::{ProjectContainer, ProjectOptions},
    route::{Endpoint, EndpointOutputPaths, Route, endpoint_write_to_disk},
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ReadConsistency, ResolvedVc, TransientInstance, TurboTasks, Vc, get_effects};
use turbo_tasks_backend::{NoopBackingStorage, TurboTasksBackend};
use turbo_tasks_malloc::TurboMalloc;

pub async fn main_inner(
    tt: &TurboTasks<TurboTasksBackend<NoopBackingStorage>>,
    strategy: Strategy,
    factor: usize,
    limit: usize,
    files: Option<Vec<String>>,
) -> Result<()> {
    let path = std::env::current_dir()?.join("project_options.json");
    let mut file = std::fs::File::open(&path)
        .with_context(|| format!("loading file at {}", path.display()))?;

    let mut options: ProjectOptions = serde_json::from_reader(&mut file)?;

    if matches!(strategy, Strategy::Development { .. }) {
        options.dev = true;
        options.watch.enable = true;
    } else {
        options.dev = false;
        options.watch.enable = false;
    }

    let project = tt
        .run(async {
            let project = ProjectContainer::new(rcstr!("next-build-test"), options.dev);
            let project = project.to_resolved().await?;
            project.initialize(options).await?;
            Ok(project)
        })
        .await?;

    tracing::info!("collecting endpoints");
    let entrypoints = tt.run(async move { project.entrypoints().await }).await?;

    let mut routes = if let Some(files) = files {
        tracing::info!("building only the files:");
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

    if strategy.randomized() {
        routes = Box::new(shuffle(routes))
    }

    let start = Instant::now();
    let count = render_routes(tt, routes, strategy, factor, limit).await?;
    tracing::info!("rendered {} pages in {:?}", count, start.elapsed());

    if count == 0 {
        tracing::info!("No pages found, these pages exist:");
        for (route, _) in entrypoints.routes.iter() {
            tracing::info!("  {}", route);
        }
    }

    if matches!(strategy, Strategy::Development { .. }) {
        hmr(tt, *project).await?;
    }

    Ok(())
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
    use rand::{SeedableRng, seq::SliceRandom};
    let mut rng = rand::rngs::SmallRng::from_seed([0; 32]);
    let mut input = items.collect::<Vec<_>>();
    input.shuffle(&mut rng);
    input.into_iter()
}

pub async fn render_routes(
    tt: &TurboTasks<TurboTasksBackend<NoopBackingStorage>>,
    routes: impl Iterator<Item = (RcStr, Route)>,
    strategy: Strategy,
    factor: usize,
    limit: usize,
) -> Result<usize> {
    tracing::info!(
        "rendering routes with {} parallel and strategy {}",
        factor,
        strategy
    );

    let stream = tokio_stream::iter(routes)
        .map(move |(name, route)| async move {
            tracing::info!("{name}...");
            let start = Instant::now();

            let memory = TurboMalloc::memory_usage();

            tt.run({
                let name = name.clone();
                async move {
                    match route {
                        Route::Page {
                            html_endpoint,
                            data_endpoint: _,
                        } => {
                            endpoint_write_to_disk_with_effects(*html_endpoint).await?;
                        }
                        Route::PageApi { endpoint } => {
                            endpoint_write_to_disk_with_effects(*endpoint).await?;
                        }
                        Route::AppPage(routes) => {
                            for route in routes {
                                endpoint_write_to_disk_with_effects(*route.html_endpoint).await?;
                            }
                        }
                        Route::AppRoute {
                            original_name: _,
                            endpoint,
                        } => {
                            endpoint_write_to_disk_with_effects(*endpoint).await?;
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

#[turbo_tasks::function]
async fn endpoint_write_to_disk_with_effects(
    endpoint: ResolvedVc<Box<dyn Endpoint>>,
) -> Result<Vc<EndpointOutputPaths>> {
    let op = endpoint_write_to_disk_operation(endpoint);
    let result = op.resolve_strongly_consistent().await?;
    get_effects(op).await?.apply().await?;
    Ok(*result)
}

#[turbo_tasks::function(operation)]
pub fn endpoint_write_to_disk_operation(
    endpoint: ResolvedVc<Box<dyn Endpoint>>,
) -> Vc<EndpointOutputPaths> {
    endpoint_write_to_disk(*endpoint)
}

async fn hmr(
    tt: &TurboTasks<TurboTasksBackend<NoopBackingStorage>>,
    project: Vc<ProjectContainer>,
) -> Result<()> {
    tracing::info!("HMR...");
    let session = TransientInstance::new(());
    let idents = tt
        .run(async move { project.hmr_identifiers().await })
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
