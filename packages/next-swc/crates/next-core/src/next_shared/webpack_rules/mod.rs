use anyhow::Result;
use turbo_tasks::{RcStr, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::turbopack::{
    core::resolve::options::ImportMapping, turbopack::module_options::WebpackLoadersOptions,
};

use self::{babel::maybe_add_babel_loader, sass::maybe_add_sass_loader};
use crate::{next_build::get_external_next_compiled_package_mapping, next_config::NextConfig};

pub(crate) mod babel;
pub(crate) mod sass;

pub async fn webpack_loader_options(
    project_path: Vc<FileSystemPath>,
    next_config: Vc<NextConfig>,
    foreign: bool,
    conditions: Vec<RcStr>,
) -> Result<Option<Vc<WebpackLoadersOptions>>> {
    let rules = *next_config.webpack_rules(conditions).await?;
    let rules = *maybe_add_sass_loader(next_config.sass_config(), rules).await?;
    let rules = if foreign {
        rules
    } else {
        *maybe_add_babel_loader(project_path, rules).await?
    };
    Ok(rules.map(|rules| {
        WebpackLoadersOptions {
            rules,
            loader_runner_package: Some(loader_runner_package_mapping()),
        }
        .cell()
    }))
}

#[turbo_tasks::function]
fn loader_runner_package_mapping() -> Vc<ImportMapping> {
    get_external_next_compiled_package_mapping(Vc::cell("loader-runner".into()))
}
