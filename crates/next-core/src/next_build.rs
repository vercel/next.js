use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::resolve::options::ImportMapping;

use crate::{next_config::NextConfig, next_import_map::get_next_package};

#[turbo_tasks::function]
pub async fn get_postcss_package_mapping(
    project_path: FileSystemPath,
    next_config: Vc<NextConfig>,
) -> Result<Vc<ImportMapping>> {
    Ok(ImportMapping::Alternatives(vec![
        // Prefer the local installed version over the next.js version
        ImportMapping::PrimaryAlternative(rcstr!("postcss"), Some(project_path.clone()))
            .resolved_cell(),
        ImportMapping::PrimaryAlternative(
            rcstr!("postcss"),
            Some(get_next_package(project_path.clone(), next_config).await?),
        )
        .resolved_cell(),
    ])
    .cell())
}
