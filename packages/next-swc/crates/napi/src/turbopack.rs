use std::{
    future::join,
    net::{IpAddr, Ipv4Addr},
    path::PathBuf,
    time::{Duration, Instant},
};

use crate::util::MapErr;
use napi::bindgen_prelude::*;
use next_dev::{register, NextDevServerBuilder};
use serde::Deserialize;
use turbo_tasks::{util::FormatDuration, TurboTasks};
use turbo_tasks_memory::MemoryBackend;
use turbopack_core::issue::IssueSeverity;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(unused)]
struct TurboDevServerOptions {
    #[serde(default = "default_port")]
    port: u16,

    #[serde(default = "default_host")]
    hostname: IpAddr,

    #[serde(default)]
    eager_compile: bool,

    #[serde(default)]
    log_level: Option<IssueSeverity>,

    #[serde(default)]
    show_all: bool,

    #[serde(default)]
    log_detail: bool,

    #[serde(default = "default_dir")]
    dir: PathBuf,

    #[serde(default)]
    allow_retry: bool,

    #[serde(default)]
    dev: bool,

    #[serde(default)]
    is_next_dev_command: bool,

    #[serde(default)]
    server_components_external_packages: Vec<String>,
}

fn default_port() -> u16 {
    3000
}

fn default_host() -> IpAddr {
    IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0))
}

fn default_dir() -> PathBuf {
    std::env::current_dir().expect("Current dir should be accessible")
}

async fn start_server(options: TurboDevServerOptions) -> napi::Result<()> {
    let start = Instant::now();

    register();

    let tt = TurboTasks::new(MemoryBackend::new());
    let tt_clone = tt.clone();

    let dir = options.dir.to_str().unwrap().to_string();
    // TODO: distinguish between root to dir
    let root_dir = dir.clone();

    //server_component_external

    let mut server = NextDevServerBuilder::new(tt, dir, root_dir)
        .entry_request("src/index".into())
        .eager_compile(options.eager_compile)
        .hostname(options.hostname)
        .port(options.port)
        .log_detail(options.log_detail)
        .show_all(options.show_all)
        .log_level(
            options
                .log_level
                .map_or_else(|| IssueSeverity::Warning, |l| l),
        );

    for package in options.server_components_external_packages {
        server = server.server_component_external(package);
    }

    let server = server.build().await.convert_err()?;

    let index_uri = if server.addr.ip().is_loopback() {
        format!("http://localhost:{}", server.addr.port())
    } else {
        format!("http://{}", server.addr)
    };
    println!("server listening on: {uri}", uri = index_uri);

    let stats_future = async move {
        let (elapsed, count) = tt_clone.get_or_wait_update_info(Duration::ZERO).await;
        println!(
            "initial compilation {} ({} task execution, {} tasks)",
            FormatDuration(start.elapsed()),
            FormatDuration(elapsed),
            count
        );

        loop {
            let (elapsed, count) = tt_clone
                .get_or_wait_update_info(Duration::from_millis(100))
                .await;
            println!("updated in {} ({} tasks)", FormatDuration(elapsed), count);
        }
    };

    join!(stats_future, async { server.future.await.unwrap() }).await;

    Ok(())
}

#[napi]
pub async fn start_turbo_dev(options: Buffer) -> napi::Result<()> {
    let options: TurboDevServerOptions = serde_json::from_slice(&options)?;

    start_server(options).await
}
