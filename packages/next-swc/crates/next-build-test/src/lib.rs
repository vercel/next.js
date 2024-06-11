#![feature(future_join)]
#![feature(min_specialization)]
#![feature(arbitrary_self_types)]

use std::{str::FromStr, time::Instant};

use anyhow::{Context, Result};
use futures_util::{StreamExt, TryStreamExt};
use next_api::{
    project::{ProjectContainer, ProjectOptions},
    route::{Endpoint, Route},
};
use turbo_tasks::{RcStr, TransientInstance, TurboTasks, Vc};
use turbopack_binding::turbo::tasks_memory::MemoryBackend;

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

    if matches!(strat, Strategy::Development) {
        options.dev = true;
        options.watch = true;
    } else {
        options.dev = false;
        options.watch = false;
    }

    let project = tt
        .run_once(async { Ok(ProjectContainer::new(options)) })
        .await?;

    tracing::info!("collecting endpoints");
    let entrypoints = tt
        .run_once(async move { Ok(project.entrypoints().await?) })
        .await?;

    let routes = if let Some(files) = files {
        tracing::info!("builing only the files:");
        for file in &files {
            tracing::info!("  {}", file);
        }

        // filter out the files that are not in the list
        // we expect this to be small so linear search OK
        Box::new(
            entrypoints
                .routes
                .clone()
                .into_iter()
                .filter(move |(name, _)| files.iter().any(|f| f.as_str() == name.as_str())),
        ) as Box<dyn Iterator<Item = _> + Send + Sync>
    } else {
        Box::new(shuffle(entrypoints.routes.clone().into_iter()))
    };

    let count = render_routes(tt, routes, strat, factor, limit).await?;
    tracing::info!("rendered {} pages", count);

    if matches!(strat, Strategy::Development) {
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
    Sequential,
    Concurrent,
    Parallel,
    Development,
}

impl std::fmt::Display for Strategy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Strategy::Sequential => write!(f, "sequential"),
            Strategy::Concurrent => write!(f, "concurrent"),
            Strategy::Parallel => write!(f, "parallel"),
            Strategy::Development => write!(f, "development"),
        }
    }
}

impl FromStr for Strategy {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        match s {
            "sequential" => Ok(Strategy::Sequential),
            "concurrent" => Ok(Strategy::Concurrent),
            "parallel" => Ok(Strategy::Parallel),
            "development" => Ok(Strategy::Development),
            _ => Err(anyhow::anyhow!("invalid strategy")),
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

            tt.run_once({
                let name = name.clone();
                async move {
                    Ok(match route {
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
                    })
                }
            })
            .await?;

            tracing::info!("{name} {:?}", start.elapsed());

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
        .run_once(async move { Ok(project.hmr_identifiers().await?) })
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
                project
                    .hmr_update(
                        ident.clone(),
                        project.hmr_version_state(ident.clone(), session),
                    )
                    .await?;
                Ok(Vc::<()>::cell(()))
            }
        });
        tt.wait_task_completion(task, true).await?;
        let e = start.elapsed();
        if e.as_millis() > 10 {
            tracing::info!("HMR: {:?} {:?}", ident, e);
        }
    }
    tracing::info!("HMR {:?}", start.elapsed());

    Ok(())
}
