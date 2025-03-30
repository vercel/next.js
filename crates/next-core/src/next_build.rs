use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::resolve::{options::ImportMapping, ExternalTraced, ExternalType};

use crate::next_import_map::get_next_package;

#[turbo_tasks::function]
pub async fn get_postcss_package_mapping(
    project_path: ResolvedVc<FileSystemPath>,
) -> Result<Vc<ImportMapping>> {
    Ok(ImportMapping::Alternatives(vec![
        // Prefer the local installed version over the next.js version
        ImportMapping::PrimaryAlternative("postcss".into(), Some(project_path)).resolved_cell(),
        ImportMapping::PrimaryAlternative(
            "postcss".into(),
            Some(get_next_package(*project_path).to_resolved().await?),
        )
        .resolved_cell(),
    ])
    .cell())
}

#[turbo_tasks::function]
pub async fn get_external_next_compiled_package_mapping(
    package_name: Vc<RcStr>,
) -> Result<Vc<ImportMapping>> {
    Ok(ImportMapping::Alternatives(vec![ImportMapping::External(
        Some(format!("next/dist/compiled/{}", &*package_name.await?).into()),
        ExternalType::CommonJs,
        ExternalTraced::Traced,
    )
    .resolved_cell()])
    .cell())
}
