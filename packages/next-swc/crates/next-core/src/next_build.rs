use anyhow::Result;
use turbo_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::core::resolve::options::{ImportMapping, ImportMappingVc},
};
use turbo_tasks::primitives::StringVc;

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

#[turbo_tasks::function]
pub async fn get_external_next_compiled_package_mapping(
    package_name: StringVc,
) -> Result<ImportMappingVc> {
    Ok(
        ImportMapping::Alternatives(vec![ImportMapping::External(Some(format!(
            "next/dist/compiled/{}",
            &*package_name.await?
        )))
        .into()])
        .cell(),
    )
}
