use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    resolve::{
        options::{ImportMap, ImportMapVc, ImportMapping},
        AliasPattern, ResolveResult,
    },
    virtual_asset::VirtualAssetVc,
};

use crate::embed_next_file;

/// Aliases [next_pages_app] to either an existing `pages/_app` asset, or a
/// default asset.
#[turbo_tasks::function]
pub fn get_next_import_map(pages_dir: FileSystemPathVc) -> ImportMapVc {
    let mut import_map = ImportMap::empty();
    import_map.insert_alias(
        AliasPattern::Exact("@vercel/turbopack-next/pages/_app".to_string()),
        ImportMapping::Alternatives(vec![
            ImportMapping::PrimaryAlternative("./_app".to_string(), Some(pages_dir)).into(),
            ImportMapping::Direct(
                ResolveResult::Single(
                    VirtualAssetVc::new(
                        // TODO(alexkirsz) We should make sure these paths are unique,
                        // otherwise we can run into conflicts with
                        // user paths.
                        pages_dir.root().join("next_js/pages/_app.js"),
                        embed_next_file!("pages/_app.js").into(),
                    )
                    .into(),
                    vec![],
                )
                .into(),
            )
            .into(),
        ])
        .into(),
    );
    import_map.cell()
}
