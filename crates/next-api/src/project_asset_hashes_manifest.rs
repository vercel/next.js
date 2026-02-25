use anyhow::{Context, Result};
use serde::{Serializer, ser::SerializeMap};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{
        ExpandOutputAssetsInput, OutputAsset, OutputAssets, OutputAssetsReference,
        expand_output_assets,
    },
};

use crate::{
    project::Project,
    route::{Endpoint, EndpointGroup, Endpoints},
};

#[turbo_tasks::value]
struct AssetHashesManifestAsset {
    output_path: FileSystemPath,
    project: ResolvedVc<Project>,
    asset_root: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl AssetHashesManifestAsset {
    #[turbo_tasks::function]
    pub fn new(
        output_path: FileSystemPath,
        project: ResolvedVc<Project>,
        asset_root: FileSystemPath,
    ) -> Vc<Self> {
        Self {
            output_path,
            project,
            asset_root,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for AssetHashesManifestAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for AssetHashesManifestAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Vc<FileSystemPath> {
        self.output_path.clone().cell()
    }
}

#[turbo_tasks::function]
pub async fn endpoint_outputs(endpoint: Vc<Box<dyn Endpoint>>) -> Result<Vc<OutputAssets>> {
    Ok(*endpoint.output().await?.output_assets)
}

#[turbo_tasks::function]
pub async fn endpoints_outputs(endpoints: Vc<Endpoints>) -> Result<Vc<OutputAssets>> {
    let endpoints = endpoints.await?;
    let all_outputs = endpoints
        .iter()
        .map(async |endpoint| endpoint.output().await?.output_assets.await)
        .try_join()
        .await?;
    let set = all_outputs
        .into_iter()
        .flatten()
        .copied()
        .collect::<FxIndexSet<_>>();
    Ok(Vc::cell(set.into_iter().collect()))
}

#[turbo_tasks::value(transparent)]
pub struct OutputAssetsWithPaths(Vec<(ResolvedVc<Box<dyn OutputAsset>>, RcStr)>);

#[turbo_tasks::function]
pub async fn expand_outputs(
    outputs: Vc<OutputAssets>,
    root: FileSystemPath,
) -> Result<Vc<OutputAssetsWithPaths>> {
    let output_assets = expand_output_assets(
        outputs
            .await?
            .into_iter()
            .map(|asset| ExpandOutputAssetsInput::Asset(*asset)),
        true,
    )
    .await?;

    Ok(Vc::cell(
        output_assets
            .into_iter()
            .map(async |asset| {
                if let Some(path) = root.get_path_to(&*asset.path().await?) {
                    Ok(Some((asset, RcStr::from(path))))
                } else {
                    Ok(None)
                }
            })
            .try_flat_join()
            .await?,
    ))
}

#[turbo_tasks::value_impl]
impl Asset for AssetHashesManifestAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let entrypoint_groups = self.project.get_all_endpoint_groups(false).await?;

        let mut files = entrypoint_groups
            .iter()
            .map(|(_, EndpointGroup { primary, .. })| {
                if let &[entry] = &primary.as_slice() {
                    expand_outputs(endpoint_outputs(*entry.endpoint), self.asset_root.clone())
                } else {
                    let endpoints = Vc::cell(primary.iter().map(|entry| entry.endpoint).collect());
                    expand_outputs(endpoints_outputs(endpoints), self.asset_root.clone())
                }
            })
            .try_flat_join()
            .await?;
        // deduplicate shared assets across entrypoints
        files.sort_unstable_by(|(_, a), (_, b)| a.cmp(b));
        files.dedup_by(|(_, a), (_, b)| a == b);

        let asset_paths = files
            .into_iter()
            .map(async |(asset, path)| {
                Ok((
                    path,
                    asset
                        .content()
                        .content_hash(HashAlgorithm::Xxh3Hash64Hex)
                        .await?,
                ))
            })
            .try_join()
            .await?;

        struct Manifest<'a> {
            asset_paths: &'a Vec<(&'a RcStr, ReadRef<Option<RcStr>>)>,
        }

        impl serde::Serialize for Manifest<'_> {
            fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                let mut map = serializer.serialize_map(Some(self.asset_paths.len()))?;
                for (path, content_hash) in self.asset_paths {
                    map.serialize_entry(
                        path,
                        // TODO Error conversion
                        &content_hash
                            .as_ref()
                            .context("asset content hash failed")
                            .unwrap(),
                    )?;
                }
                map.end()
            }
        }

        let json = serde_json::to_string(&Manifest {
            asset_paths: &asset_paths,
        })?;

        Ok(AssetContent::file(
            FileContent::Content(File::from(json)).cell(),
        ))
    }
}

#[turbo_tasks::function]
pub async fn immutable_hashes_manifest_asset_if_enabled(
    project: ResolvedVc<Project>,
) -> Result<Vc<OutputAssets>> {
    if *project.emit_client_hashes().await? {
        let path = project
            .node_root()
            .await?
            .join("immutable-static-hashes.json")?;

        let asset = AssetHashesManifestAsset::new(
            path,
            *project,
            project.client_relative_path().owned().await?,
        )
        .to_resolved()
        .await?;
        Ok(Vc::cell(vec![ResolvedVc::upcast(asset)]))
    } else {
        Ok(OutputAssets::empty())
    }
}
