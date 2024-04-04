#![feature(future_join)]
#![feature(min_specialization)]
#![feature(arbitrary_self_types)]

use std::{path::Display, str::FromStr};

use anyhow::{Context, Result};
use futures_util::{StreamExt, TryStreamExt};
use next_api::{
    project::{ProjectContainer, ProjectOptions},
    route::{Endpoint, Route},
};

pub async fn main_inner(strat: Strategy, factor: usize, limit: usize) -> Result<()> {
    register();

    let mut file = std::fs::File::open("project_options.json").with_context(|| {
        let path = std::env::current_dir()
            .unwrap()
            .join("project_options.json");
        format!("loading file at {}", path.display())
    })?;
    let data: ProjectOptions = serde_json::from_reader(&mut file).unwrap();

    let options = ProjectOptions { ..data };

    let project = ProjectContainer::new(options);

    println!("collecting endpoints");
    let entrypoints = project.entrypoints().await?;

    let routes = shuffle(entrypoints.routes.clone().into_iter());
    render_routes(routes, strat, factor, limit).await;

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
}

impl std::fmt::Display for Strategy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Strategy::Sequential => write!(f, "sequential"),
            Strategy::Concurrent => write!(f, "concurrent"),
            Strategy::Parallel => write!(f, "parallel"),
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
            _ => Err(anyhow::anyhow!("invalid strategy")),
        }
    }
}

fn shuffle<'a, T: 'a>(items: impl Iterator<Item = T>) -> impl Iterator<Item = T> {
    use rand::{seq::SliceRandom, thread_rng};
    let mut rng = thread_rng();
    let mut input = items.collect::<Vec<_>>();
    input.shuffle(&mut rng);
    input.into_iter()
}

pub async fn render_routes(
    routes: impl Iterator<Item = (String, Route)>,
    strategy: Strategy,
    factor: usize,
    limit: usize,
) {
    println!(
        "rendering routes with {} parallel and strat {}",
        factor, strategy
    );

    let stream = tokio_stream::iter(routes)
        .map(move |(name, route)| {
            let fut = async move {
                println!("{name}");

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
                        println!("WARN: conflict {}", name);
                    }
                }

                Ok::<_, anyhow::Error>(())
            };

            async move {
                match strategy {
                    Strategy::Parallel => tokio::task::spawn(fut).await.unwrap(),
                    _ => fut.await,
                }
            }
        })
        .take(limit)
        .buffer_unordered(factor)
        .try_collect::<Vec<_>>()
        .await
        .unwrap();

    println!("rendered {} pages", stream.len());
}
