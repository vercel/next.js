use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::resolve::options::{ImportMapping, ImportMappingVc};

use crate::next_import_map::get_next_package;

#[turbo_tasks::function]
pub async fn get_postcss_package_mapping(
    project_path: FileSystemPathVc,
) -> Result<ImportMappingVc> {
    Ok(ImportMapping::Alternatives(vec![
        // Prefer the local installed version over the next.js version
        ImportMapping::PrimaryAlternative("postcss".to_string(), Some(project_path)).cell(),
        ImportMapping::PrimaryAlternative(
            "postcss".to_string(),
            Some(get_next_package(project_path)),
        )
        .cell(),
    ])
    .cell())
}
