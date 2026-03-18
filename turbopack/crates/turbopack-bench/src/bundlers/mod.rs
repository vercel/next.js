use std::{path::Path, process::Child, time::Duration};

use anyhow::Result;

use self::{
    nextjs::{NextJs, NextJsVersion},
    parcel::Parcel,
    vite::Vite,
    webpack::Webpack,
};
use crate::bundlers::rspack::Rspack;

mod nextjs;
mod parcel;
mod rspack;
mod vite;
mod webpack;

#[derive(Debug, Clone, Copy)]
pub enum RenderType {
    /// App is completely rendered on client side, the initial HTML is empty.
    ClientSideRendered,
    /// App is initially rendered on server side, then hydrated on client side.
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

    /// The maximum amount of time to wait for HMR during the setup and warmup
    /// phase.
    fn max_init_update_timeout(&self, _module_count: usize) -> Duration {
        Duration::from_secs(60)
    }

    /// The maximum amount of time to wait for HMR during the actual benchmark.
    /// This is a lot shorter than the init timeout because we expect
    /// updates to generally happen quickly, and we don't want to wait for a
    /// long time when an update is dropped.
    fn max_update_timeout(&self, _module_count: usize) -> Duration {
        Duration::from_secs(5)
    }
}

pub fn get_bundlers() -> Vec<Box<dyn Bundler>> {
    vec![
        Box::new(NextJs::new(
            NextJsVersion::Canary,
            "Next.js canary Turbo SSR",
            "/page",
            true,
            RenderType::ServerSidePrerendered,
        )),
        Box::new(NextJs::new(
            NextJsVersion::Canary,
            "Next.js canary Turbo RSC",
            "/app",
            true,
            RenderType::ServerSideRenderedWithEvents,
        )),
        Box::new(NextJs::new(
            NextJsVersion::Canary,
            "Next.js canary Turbo RCC",
            "/client",
            true,
            RenderType::ServerSideRenderedWithEvents,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V14,
            "Next.js 14 Turbo SSR",
            "/page",
            true,
            RenderType::ServerSidePrerendered,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V14,
            "Next.js 14 Turbo RSC",
            "/app",
            true,
            RenderType::ServerSideRenderedWithEvents,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V14,
            "Next.js 14 Turbo RCC",
            "/client",
            true,
            RenderType::ServerSidePrerendered,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V13,
            "Next.js 13 Turbo SSR",
            "/page",
            true,
            RenderType::ServerSidePrerendered,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V13,
            "Next.js 13 Turbo RSC",
            "/app",
            true,
            RenderType::ServerSideRenderedWithEvents,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V13,
            "Next.js 13 Turbo RCC",
            "/client",
            true,
            RenderType::ServerSidePrerendered,
        )),
        Box::new(NextJs::new(
            NextJsVersion::Canary,
            "Next.js canary webpack SSR",
            "/page",
            false,
            RenderType::ServerSidePrerendered,
        )),
        Box::new(NextJs::new(
            NextJsVersion::Canary,
            "Next.js canary webpack RSC",
            "/app",
            false,
            RenderType::ServerSideRenderedWithEvents,
        )),
        Box::new(NextJs::new(
            NextJsVersion::Canary,
            "Next.js canary webpack RCC",
            "/client",
            false,
            RenderType::ServerSideRenderedWithEvents,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V14,
            "Next.js 14 webpack SSR",
            "/page",
            false,
            RenderType::ServerSidePrerendered,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V14,
            "Next.js 14 webpack RSC",
            "/app",
            false,
            RenderType::ServerSideRenderedWithEvents,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V14,
            "Next.js 14 webpack RCC",
            "/client",
            false,
            RenderType::ServerSidePrerendered,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V13,
            "Next.js 13 webpack SSR",
            "/page",
            false,
            RenderType::ServerSidePrerendered,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V13,
            "Next.js 13 webpack RSC",
            "/app",
            false,
            RenderType::ServerSideRenderedWithEvents,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V13,
            "Next.js 13 webpack RCC",
            "/client",
            false,
            RenderType::ServerSidePrerendered,
        )),
        Box::new(NextJs::new(
            NextJsVersion::V12,
            "Next.js 12 webpack SSR",
            "/page",
            false,
            RenderType::ServerSidePrerendered,
        )),
        Box::new(Parcel {}),
        Box::new(Vite::new(false, false)),
        Box::new(Vite::new(true, false)),
        Box::new(Vite::new(false, true)),
        Box::new(Webpack {}),
        Box::new(Rspack {}),
    ]
}
