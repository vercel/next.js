use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::output::{OutputAsset, OutputAssets};

use crate::{asset_hashes_manifest::AssetHashesManifestAsset, paths::all_asset_paths};

#[turbo_tasks::function]
pub fn get_sri_manifest_asset(
    output_path: FileSystemPath,
    output_assets: Vc<OutputAssets>,
    client_relative_root: FileSystemPath,
    algorithm: RcStr,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    let (algorithm, prefix) = match algorithm.as_str() {
        "sha256" => (HashAlgorithm::Sha256Base64, rcstr!("sha256-")),
        "sha384" => (HashAlgorithm::Sha384Base64, rcstr!("sha384-")),
        "sha512" => (HashAlgorithm::Sha512Base64, rcstr!("sha512-")),
        _ => bail!("Unsupported SRI algorithm: {}", algorithm),
    };

    Ok(Vc::upcast(AssetHashesManifestAsset::new(
        output_path,
        all_asset_paths(output_assets, client_relative_root, Some(algorithm)),
        Some(prefix),
    )))
}
