use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_core::chunk::global_information::{GlobalInformation, OptionGlobalInformation};

use crate::project::Project;

#[turbo_tasks::function]
pub async fn build_global_information(
    _project: Vc<Project>,
) -> Result<Vc<OptionGlobalInformation>> {
    let global_information = GlobalInformation {};
    Ok(Vc::cell(Some(global_information)))
}
