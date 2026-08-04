#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::{str::FromStr, time::Instant};

use anyhow::{Context, Result, bail};
#[cfg(not(feature = "sync"))]
use futures_util::{StreamExt, TryStreamExt};
#[cfg(not(feature = "sync"))]
use next_api::project::HmrTarget;
use next_api::{
    entrypoints::Entrypoints,
    project::{ProjectContainer, ProjectOptions},
    route::{Endpoint, EndpointOutputPaths, Route, endpoint_write_to_disk},
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Effects, ReadRef, ResolvedVc, TurboTasks, Vc, read_strongly_consistent_and_apply_effects,
    take_effects,
};
#[cfg(not(feature = "sync"))]
use turbo_tasks::{ReadConsistency, TransientInstance};
use turbo_tasks_backend::TurboTasksBackend;
#[cfg(not(feature = "sync"))]
use turbo_tasks_malloc::TurboMalloc;

#[cfg(not(feature = "sync"))]
pub async fn main_inner(
    tt: &TurboTasks<TurboTasksBackend>,
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
            let container_op = ProjectContainer::new_operation(rcstr!("next.js"), options.dev);
            ProjectContainer::initialize(container_op, options).await?;
            container_op.resolve().strongly_consistent().await
        })
        .await?;

    tracing::info!("collecting endpoints");

    #[turbo_tasks::function(operation, root)]
    fn project_entrypoints_operation(project: ResolvedVc<ProjectContainer>) -> Vc<Entrypoints> {
        project.entrypoints()
    }
    let entrypoints = tt
        .run(async move {
            project_entrypoints_operation(project)
                .read_strongly_consistent()
                .await
        })
        .await?;

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
        hmr(tt, project).await?;
    }

    Ok(())
}

// ---- Sync (no-tokio) production build driver ----
//
// Mirrors the async `main_inner`/`render_routes`/`endpoint_write_to_disk_with_apply`
// above, but drives everything through the sync engine's `run_sync` + `read!`
// (no futures, no `.await`, no tokio runtime — tokio only survives at the node-pool
// I/O edge). Only the sequential strategy is supported; the concurrent/parallel
// tokio-stream paths and dev HMR remain async-only.
#[cfg(feature = "sync")]
pub fn main_inner(
    tt: &TurboTasks<TurboTasksBackend>,
    strategy: Strategy,
    _factor: usize,
    limit: usize,
    files: Option<Vec<String>>,
) -> Result<()> {
    use turbo_tasks::read;

    if matches!(strategy, Strategy::Development { .. }) {
        bail!("the sync build does not support the `development` strategy (dev/HMR is async-only)");
    }

    let path = std::env::current_dir()?.join("project_options.json");
    let mut file = std::fs::File::open(&path)
        .with_context(|| format!("loading file at {}", path.display()))?;
    let mut options: ProjectOptions = serde_json::from_reader(&mut file)?;
    options.dev = false;
    options.watch.enable = false;

    let project = tt.run_sync(move || {
        let container_op = ProjectContainer::new_operation(rcstr!("next.js"), options.dev);
        read!(ProjectContainer::initialize(container_op, options))?;
        read!(container_op.resolve().strongly_consistent())
    })?;

    tracing::info!("collecting endpoints");

    #[turbo_tasks::function(operation, root)]
    fn project_entrypoints_operation(project: ResolvedVc<ProjectContainer>) -> Vc<Entrypoints> {
        project.entrypoints()
    }
    let entrypoints = tt.run_sync(move || {
        read!(project_entrypoints_operation(project).read_strongly_consistent())
    })?;

    let routes: Box<dyn Iterator<Item = (RcStr, Route)> + Send + Sync> = if let Some(files) = files
    {
        tracing::info!("building only the files:");
        for file in &files {
            tracing::info!("  {}", file);
        }
        Box::new(files.into_iter().filter_map(|f| {
            entrypoints
                .routes
                .iter()
                .find(|(name, _)| f.as_str() == name.as_str())
                .map(|(name, route)| (name.clone(), route.clone()))
        }))
    } else {
        Box::new(entrypoints.routes.clone().into_iter())
    };
    let routes: Box<dyn Iterator<Item = (RcStr, Route)> + Send + Sync> = if strategy.randomized() {
        Box::new(shuffle(routes))
    } else {
        routes
    };

    let start = Instant::now();
    let count = render_routes(tt, routes, strategy, limit)?;
    tracing::info!("rendered {} pages in {:?}", count, start.elapsed());

    if count == 0 {
        tracing::info!("No pages found, these pages exist:");
        for (route, _) in entrypoints.routes.iter() {
            tracing::info!("  {}", route);
        }
    }

    Ok(())
}

#[cfg(feature = "sync")]
pub fn render_routes(
    tt: &TurboTasks<TurboTasksBackend>,
    routes: impl Iterator<Item = (RcStr, Route)>,
    strategy: Strategy,
    limit: usize,
) -> Result<usize> {
    let items: Vec<(RcStr, Route)> = routes.take(limit).collect();
    let count = items.len();

    // Concurrent driver: every route is an independent root, so building them together gives
    // the pool that many independent demand chains. This is the sync counterpart of the async
    // driver's `buffer_unordered(factor)`, and it matters more here than it does there: a sync
    // worker cannot suspend on a dependency, so the number of chains in flight *is* the
    // achievable parallelism.
    //
    // The outer `run_sync` both bootstraps the fan-out onto the worker pool and binds the
    // `TURBO_TASKS` scope `sync_parallel_map` needs (calling it bare from the main thread
    // panics with "sync task-local accessed outside of a scope"). Each route still gets its
    // own `run_sync` root Once task — same isolation as the sequential driver below.
    if !matches!(strategy, Strategy::Sequential { .. }) {
        tracing::info!("rendering {count} routes (sync, concurrent)");
        let start = Instant::now();
        let this = tt.pin();
        let results = tt.run_sync(move || {
            Ok(turbo_tasks::sync_parallel_map(
                items,
                move |(name, route)| {
                    let this = this.clone();
                    this.run_sync(move || render_one(name, route))
                },
            ))
        })?;
        for r in results {
            r?;
        }
        tracing::info!("rendered {count} routes in {:?}", start.elapsed());
        return Ok(count);
    }

    tracing::info!("rendering routes (sync, sequential)");
    let mut count = 0;
    for (name, route) in items {
        tracing::info!("{name}...");
        let start = Instant::now();
        let name_for_task = name.clone();
        tt.run_sync(move || {
            match route {
                Route::Page {
                    html_endpoint,
                    data_endpoint: _,
                } => {
                    endpoint_write_to_disk_with_apply(html_endpoint)?;
                }
                Route::PageApi { endpoint } => {
                    endpoint_write_to_disk_with_apply(endpoint)?;
                }
                Route::AppPage(routes) => {
                    for route in routes {
                        endpoint_write_to_disk_with_apply(route.html_endpoint)?;
                    }
                }
                Route::AppRoute {
                    original_name: _,
                    endpoint,
                } => {
                    endpoint_write_to_disk_with_apply(endpoint)?;
                }
                Route::Conflict => {
                    tracing::info!("WARN: conflict {}", name_for_task);
                }
            }
            Ok(())
        })?;
        count += 1;
        tracing::info!("{name} {:?}", start.elapsed());
    }
    Ok(count)
}

/// One route's build, shared by the sequential and concurrent sync drivers.
#[cfg(feature = "sync")]
fn render_one(name: RcStr, route: Route) -> Result<()> {
    match route {
        Route::Page {
            html_endpoint,
            data_endpoint: _,
        } => {
            endpoint_write_to_disk_with_apply(html_endpoint)?;
        }
        Route::PageApi { endpoint } => {
            endpoint_write_to_disk_with_apply(endpoint)?;
        }
        Route::AppPage(routes) => {
            for route in routes {
                endpoint_write_to_disk_with_apply(route.html_endpoint)?;
            }
        }
        Route::AppRoute {
            original_name: _,
            endpoint,
        } => {
            endpoint_write_to_disk_with_apply(endpoint)?;
        }
        Route::Conflict => {
            tracing::info!("WARN: conflict {}", name);
        }
    }
    Ok(())
}

#[cfg(feature = "sync")]
fn endpoint_write_to_disk_with_apply(
    endpoint: ResolvedVc<Box<dyn Endpoint>>,
) -> Result<ReadRef<EndpointOutputPaths>> {
    use turbo_tasks::read;

    #[turbo_tasks::function(operation, root)]
    fn inner_operation(endpoint: ResolvedVc<Box<dyn Endpoint>>) -> Vc<EndpointOutputPaths> {
        endpoint_write_to_disk(*endpoint)
    }

    #[turbo_tasks::value(serialization = "skip")]
    struct WithEffects {
        output_paths: ReadRef<EndpointOutputPaths>,
        effects: Effects,
    }

    #[turbo_tasks::function(operation, root)]
    fn inner_operation_with_effects(
        endpoint: ResolvedVc<Box<dyn Endpoint>>,
    ) -> Result<Vc<WithEffects>> {
        let op = inner_operation(endpoint);
        // Surface turbopack build Issues (opt-in via TURBO_PRINT_ISSUES=1); see the
        // async counterpart. Peeked before propagating so a failing build shows its
        // real cause.
        let read_result = read!(op.read_strongly_consistent());
        if std::env::var("TURBO_PRINT_ISSUES").is_ok() {
            use turbopack_core::issue::{CollectibleIssuesExt, IssueFilter};
            for issue in read!(
                op.peek_issues()
                    .get_plain_issues(&IssueFilter::everything())
            )?
            .iter()
            {
                eprintln!(
                    "== TURBOPACK ISSUE [{:?} @ {:?}] {}\n   title: {:?}\n   description: {:?}",
                    issue.severity, issue.stage, issue.file_path, issue.title, issue.description
                );
            }
        }
        let output_paths = read_result?;
        let effects = read!(take_effects(op))?;
        Ok(WithEffects {
            output_paths,
            effects,
        }
        .cell())
    }

    let op = inner_operation_with_effects(endpoint);
    let read = read!(read_strongly_consistent_and_apply_effects(op, |v| &v.effects))?;
    Ok(read.output_paths.clone())
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
            _ => bail!("invalid strategy"),
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

#[cfg(not(feature = "sync"))]
pub async fn render_routes(
    tt: &TurboTasks<TurboTasksBackend>,
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
                            endpoint_write_to_disk_with_apply(html_endpoint).await?;
                        }
                        Route::PageApi { endpoint } => {
                            endpoint_write_to_disk_with_apply(endpoint).await?;
                        }
                        Route::AppPage(routes) => {
                            for route in routes {
                                endpoint_write_to_disk_with_apply(route.html_endpoint).await?;
                            }
                        }
                        Route::AppRoute {
                            original_name: _,
                            endpoint,
                        } => {
                            endpoint_write_to_disk_with_apply(endpoint).await?;
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

#[cfg(not(feature = "sync"))]
async fn endpoint_write_to_disk_with_apply(
    endpoint: ResolvedVc<Box<dyn Endpoint>>,
) -> Result<ReadRef<EndpointOutputPaths>> {
    #[turbo_tasks::function(operation, root)]
    fn inner_operation(endpoint: ResolvedVc<Box<dyn Endpoint>>) -> Vc<EndpointOutputPaths> {
        // we must wrap this in an operation so we can get the Effects collectibles
        endpoint_write_to_disk(*endpoint)
    }

    #[turbo_tasks::value(serialization = "skip")]
    struct WithEffects {
        output_paths: ReadRef<EndpointOutputPaths>,
        effects: Effects,
    }

    #[turbo_tasks::function(operation, root)]
    pub async fn inner_operation_with_effects(
        endpoint: ResolvedVc<Box<dyn Endpoint>>,
    ) -> Result<Vc<WithEffects>> {
        let op = inner_operation(endpoint);
        // Surface turbopack build Issues (which the harness otherwise swallows),
        // opt-in via TURBO_PRINT_ISSUES=1. Peeked whether or not the read below
        // succeeds, so a failing build shows its real cause instead of an opaque
        // "Execution of ... failed".
        let read_result = op.read_strongly_consistent().await;
        if std::env::var("TURBO_PRINT_ISSUES").is_ok() {
            use turbopack_core::issue::{CollectibleIssuesExt, IssueFilter};
            for issue in op
                .peek_issues()
                .get_plain_issues(&IssueFilter::everything())
                .await?
                .iter()
            {
                eprintln!(
                    "== TURBOPACK ISSUE [{:?} @ {:?}] {}\n   title: {:?}\n   description: {:?}",
                    issue.severity, issue.stage, issue.file_path, issue.title, issue.description
                );
            }
        }
        let output_paths = read_result?;
        let effects = take_effects(op).await?;
        Ok(WithEffects {
            output_paths,
            effects,
        }
        .cell())
    }

    let op = inner_operation_with_effects(endpoint);
    let read = read_strongly_consistent_and_apply_effects(op, |v| &v.effects).await?;

    Ok(read.output_paths.clone())
}

#[cfg(not(feature = "sync"))]
async fn hmr(
    tt: &TurboTasks<TurboTasksBackend>,
    project: ResolvedVc<ProjectContainer>,
) -> Result<()> {
    tracing::info!("HMR...");
    let session = TransientInstance::new(());

    #[turbo_tasks::function(operation, root)]
    fn project_hmr_chunk_names_operation(project: ResolvedVc<ProjectContainer>) -> Vc<Vec<RcStr>> {
        project.hmr_chunk_names(HmrTarget::Client)
    }

    let idents = tt
        .run(async move {
            project_hmr_chunk_names_operation(project)
                .read_strongly_consistent()
                .await
        })
        .await?;

    let start = Instant::now();
    for ident in &idents {
        if !ident.ends_with(".js") {
            continue;
        }
        let session = session.clone();
        let start = Instant::now();
        let ident_for_task = ident.clone();
        let task = tt.spawn_root_task(move || {
            let session = session.clone();
            let ident = ident_for_task.clone();
            async move {
                let project = project.project();
                let state = project.hmr_version_state(ident.clone(), HmrTarget::Client, session);
                project
                    .hmr_update(ident.clone(), HmrTarget::Client, state)
                    .await?;
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
