use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent, output::OutputAssets, virtual_output::VirtualOutputAsset,
};

use crate::{
    app_structure::CollectedRootParams, next_root_params::get_next_root_params_declaration_asset,
};

#[turbo_tasks::function]
pub async fn get_global_type_declaration_assets(
    types_path: Vc<FileSystemPath>,
    collected_root_params: Vc<CollectedRootParams>,
) -> Result<Vc<OutputAssets>> {
    Ok(OutputAssets::new(vec![
        // avoid TS errors if the project package.json has `"type": "module"`` set
        // x-ref: https://github.com/vercel/next.js/pull/49027
        Vc::upcast(types_package_json(types_path)),
        // types for 'next/root-params'
        Vc::upcast(get_next_root_params_declaration_asset(
            collected_root_params,
            types_path,
        )),
    ]))
}

#[turbo_tasks::function]
fn types_package_json(types_path: Vc<FileSystemPath>) -> Vc<VirtualOutputAsset> {
    VirtualOutputAsset::new(
        types_path.join("package.json".into()),
        AssetContent::file(FileContent::Content(File::from("{\"type\":\"module\"}")).cell()),
    )
}
