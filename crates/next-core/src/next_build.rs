use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::resolve::{ExternalTraced, ExternalType, options::ImportMapping};

use crate::next_import_map::get_next_package;

#[turbo_tasks::function]
pub async fn get_postcss_package_mapping(
    project_path: FileSystemPath,
) -> Result<Vc<ImportMapping>> {
    Ok(ImportMapping::Alternatives(vec![
        // Prefer the local installed version over the next.js version
        ImportMapping::PrimaryAlternative(rcstr!("postcss"), Some(project_path.clone()))
            .resolved_cell(),
        ImportMapping::PrimaryAlternative(
            rcstr!("postcss"),
            Some(get_next_package(project_path.clone()).await?),
        )
        .resolved_cell(),
    ])
    .cell())
}

#[turbo_tasks::function]
pub async fn get_external_next_compiled_package_mapping(
    package_name: Vc<RcStr>,
) -> Result<Vc<ImportMapping>> {
    Ok(ImportMapping::Alternatives(vec![
        ImportMapping::External(
            Some(format!("next/dist/compiled/{}", &*package_name.await?).into()),
            ExternalType::CommonJs,
            ExternalTraced::Traced,
        )
        .resolved_cell(),
    ])
    .cell())
}
