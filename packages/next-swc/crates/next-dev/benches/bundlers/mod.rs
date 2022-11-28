use std::{path::Path, process::Child};

use anyhow::Result;

use self::{
    nextjs::{NextJs, NextJsVersion},
    parcel::Parcel,
    turbopack::Turbopack,
    vite::Vite,
    webpack::Webpack,
};
use crate::util::env::read_env;

mod nextjs;
mod parcel;
mod turbopack;
mod vite;
mod webpack;

#[derive(Debug, Clone, Copy)]
pub enum RenderType {
    /// App is completely rendered on client side, the initial HTML is empty.
    ClientSideRendered,
    /// App is intially rendered on server side, then hydrated on client side.
    ServerSidePrerendered,
    /// App is rendered on server side, but additional client side javascript
    /// emits events on hydration and changes
    ServerSideRenderedWithEvents,
    /// App is rendered on server side, without any client side events.
    #[allow(dead_code)]
    ServerSideRenderedWithoutInteractivity,
}

pub trait Bundler {
    fn get_name(&self) -> &str;
    fn get_path(&self) -> &str {
        "/"
    }
    fn react_version(&self) -> &str {
        "^18.2.0"
    }
    fn render_type(&self) -> RenderType {
        RenderType::ClientSideRendered
    }
    /// There is a hydration done event emitted by client side JavaScript
    fn has_hydration_event(&self) -> bool {
        !matches!(
            self.render_type(),
            RenderType::ServerSideRenderedWithoutInteractivity
        )
    }

    fn prepare(&self, _template_dir: &Path) -> Result<()> {
        Ok(())
    }
    fn prepare_each(&self, _template_dir: &Path) -> Result<()> {
        Ok(())
    }
    fn start_server(&self, test_dir: &Path) -> Result<(Child, String)>;
}

pub fn get_bundlers() -> Vec<Box<dyn Bundler>> {
    let config: String = read_env("TURBOPACK_BENCH_BUNDLERS", String::from("turbopack")).unwrap();
    let mut turbopack = false;
    let mut others = false;
    match config.as_ref() {
        "all" => {
            turbopack = true;
            others = true
        }
        "others" => others = true,
        "turbopack" => {
            turbopack = true;
        }
        _ => panic!("Invalid value for TURBOPACK_BENCH_BUNDLERS"),
    }
    let mut bundlers: Vec<Box<dyn Bundler>> = Vec::new();
    if turbopack {
        bundlers.push(Box::new(Turbopack::new(
            "Turbopack CSR",
            "/",
            RenderType::ClientSideRendered,
        )));
        bundlers.push(Box::new(Turbopack::new(
            "Turbopack SSR",
            "/page",
            RenderType::ServerSidePrerendered,
        )));
        bundlers.push(Box::new(Turbopack::new(
            "Turbopack RSC",
            "/app",
            RenderType::ServerSideRenderedWithEvents,
        )));
        bundlers.push(Box::new(Turbopack::new(
            "Turbopack RCC",
            "/client",
            RenderType::ServerSidePrerendered,
        )));
    }

    if others {
        bundlers.push(Box::new(NextJs::new(
            NextJsVersion::V13,
            "Next.js 13 SSR",
            "/page",
            RenderType::ServerSidePrerendered,
        )));
        bundlers.push(Box::new(NextJs::new(
            NextJsVersion::V13,
            "Next.js 13 RSC",
            "/app",
            RenderType::ServerSideRenderedWithEvents,
        )));
        bundlers.push(Box::new(NextJs::new(
            NextJsVersion::V13,
            "Next.js 13 RCC",
            "/client",
            RenderType::ServerSidePrerendered,
        )));
        bundlers.push(Box::new(NextJs::new(
            NextJsVersion::V12,
            "Next.js 12 SSR",
            "/page",
            RenderType::ServerSidePrerendered,
        )));
        bundlers.push(Box::new(NextJs::new(
            NextJsVersion::V11,
            "Next.js 11 SSR",
            "/page",
            RenderType::ServerSidePrerendered,
        )));
        bundlers.push(Box::new(Parcel {}));
        bundlers.push(Box::new(Vite::new(false, false)));
        bundlers.push(Box::new(Vite::new(true, false)));
        bundlers.push(Box::new(Vite::new(false, true)));
        bundlers.push(Box::new(Webpack {}));
    }

    bundlers
}
