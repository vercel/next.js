use std::{path::Path, process::Child};

use anyhow::Result;

use self::{
    nextjs::{NextJs, NextJsVersion},
    parcel::Parcel,
    turbopack::Turbopack,
    vite::Vite,
    webpack::Webpack,
};

mod nextjs;
mod parcel;
mod turbopack;
mod vite;
mod webpack;

pub trait Bundler {
    fn get_name(&self) -> &str;
    fn get_path(&self) -> &str {
        "/"
    }
    fn react_version(&self) -> &str {
        "^18.2.0"
    }
    /// The initial HTML is enough to render the page even without JavaScript
    /// loaded
    fn has_server_rendered_html(&self) -> bool {
        false
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
    let config = std::env::var("TURBOPACK_BENCH_BUNDLERS").ok();
    let mut turbopack = false;
    let mut others = false;
    match config.as_deref() {
        Some("all") => {
            turbopack = true;
            others = true
        }
        Some("others") => others = true,
        None | Some("") => {
            turbopack = true;
        }
        _ => panic!("Invalid value for TURBOPACK_BENCH_BUNDLERS"),
    }
    let mut bundlers: Vec<Box<dyn Bundler>> = Vec::new();
    if turbopack {
        bundlers.push(Box::new(Turbopack::new("Turbopack CSR", "/", false)));
        bundlers.push(Box::new(Turbopack::new("Turbopack SSR", "/page", true)));
    }

    if others {
        bundlers.push(Box::new(NextJs::new(NextJsVersion::V12)));
        bundlers.push(Box::new(NextJs::new(NextJsVersion::V11)));
        bundlers.push(Box::new(Parcel {}));
        bundlers.push(Box::new(Vite::new()));
        bundlers.push(Box::new(Webpack {}));
    }

    bundlers
}
