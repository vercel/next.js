use anyhow::Result;
use serde::{
    Serializer,
    ser::{Error, SerializeMap},
};
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
    Ok(*turbo_tasks::read!(endpoint.output())?.output_assets)
}

#[turbo_tasks::function]
pub async fn endpoints_outputs(endpoints: Vc<Endpoints>) -> Result<Vc<OutputAssets>> {
    let endpoints = turbo_tasks::read!(endpoints)?;
    #[cfg(not(feature = "sync"))]
    let all_outputs = turbo_tasks::read!(
        endpoints
            .iter()
            .map(async |endpoint| turbo_tasks::read!(
                turbo_tasks::read!(endpoint.output())?.output_assets
            ))
            .try_join()
    )?;
    #[cfg(feature = "sync")]
    let all_outputs = {
        let mut all_outputs = Vec::new();
        for endpoint in endpoints.iter() {
            all_outputs.push(turbo_tasks::read!(
                turbo_tasks::read!(endpoint.output())?.output_assets
            )?);
        }
        all_outputs
    };
    let set = all_outputs.into_iter().flatten().collect::<FxIndexSet<_>>();
    Ok(Vc::cell(set.into_iter().collect()))
}

#[turbo_tasks::value(transparent)]
pub struct OutputAssetsWithPaths(Vec<(ResolvedVc<Box<dyn OutputAsset>>, RcStr)>);

#[turbo_tasks::function]
pub async fn expand_outputs(
    project: Vc<Project>,
    root: FileSystemPath,
) -> Result<Vc<OutputAssetsWithPaths>> {
    let entrypoint_groups = turbo_tasks::read!(project.get_all_endpoint_groups(false))?;

    let output_assets = entrypoint_groups
        .iter()
        .map(|(_, EndpointGroup { primary, .. })| {
            if let &[entry] = &primary.as_slice() {
                endpoint_outputs(*entry.endpoint)
            } else {
                let endpoints = Vc::cell(primary.iter().map(|entry| entry.endpoint).collect());
                endpoints_outputs(endpoints)
            }
        })
        .collect::<Vec<_>>();

    #[cfg(not(feature = "sync"))]
    let output_assets = turbo_tasks::read!(expand_output_assets(
        turbo_tasks::read!(output_assets.iter().try_join())?
            .into_iter()
            .flatten()
            .map(ExpandOutputAssetsInput::Asset),
        true,
    ))?;
    #[cfg(feature = "sync")]
    let output_assets = {
        let expanded_inputs = {
            let mut expanded_inputs = Vec::new();
            for asset in output_assets.iter() {
                expanded_inputs.push(turbo_tasks::read!(*asset)?);
            }
            expanded_inputs
        };
        turbo_tasks::read!(expand_output_assets(
            expanded_inputs
                .into_iter()
                .flatten()
                .map(ExpandOutputAssetsInput::Asset),
            true,
        ))?
    };

    #[cfg(not(feature = "sync"))]
    let mut output_assets = turbo_tasks::read!(
        output_assets
            .into_iter()
            .map(async |asset| {
                if let Some(path) = root.get_path_to(&*turbo_tasks::read!(asset.path())?) {
                    Ok(Some((asset, RcStr::from(path))))
                } else {
                    Ok(None)
                }
            })
            .try_flat_join()
    )?;
    #[cfg(feature = "sync")]
    let mut output_assets = {
        let mut result = Vec::new();
        for asset in output_assets.into_iter() {
            if let Some(path) = root.get_path_to(&*turbo_tasks::read!(asset.path())?) {
                result.push((asset, RcStr::from(path)));
            }
        }
        result
    };

    // Shared JS assets aren't duplicated here, but we have some duplicate OutputAssets with the
    // same path, e.g. a static image which exists twice, once with the server and then also with
    // the client chunking context.
    output_assets.sort_unstable_by(|(_, a), (_, b)| a.cmp(b));
    output_assets.dedup_by(|(_, a), (_, b)| a == b);

    Ok(Vc::cell(output_assets))
}

#[turbo_tasks::value_impl]
impl Asset for AssetHashesManifestAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let output_assets =
            turbo_tasks::read!(expand_outputs(*self.project, self.asset_root.clone()))?;

        #[cfg(not(feature = "sync"))]
        let asset_paths = turbo_tasks::read!(
            output_assets
                .iter()
                .map(async |(asset, path)| {
                    Ok((
                        path,
                        turbo_tasks::read!(asset.content_hash(
                            self.project.next_config().output_hash_salt(),
                            HashAlgorithm::Xxh3Hash128Base38,
                        ))?,
                    ))
                })
                .try_join()
        )?;
        #[cfg(feature = "sync")]
        let asset_paths = {
            let mut asset_paths = Vec::new();
            for (asset, path) in output_assets.iter() {
                asset_paths.push((
                    path,
                    turbo_tasks::read!(asset.content_hash(
                        self.project.next_config().output_hash_salt(),
                        HashAlgorithm::Xxh3Hash128Base38,
                    ))?,
                ));
            }
            asset_paths
        };

        struct Manifest<'a> {
            asset_paths: &'a Vec<(&'a RcStr, ReadRef<Option<RcStr>>)>,
        }

        impl serde::Serialize for Manifest<'_> {
            fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                let mut map = serializer.serialize_map(Some(self.asset_paths.len()))?;
                for (path, content_hash) in self.asset_paths {
                    map.serialize_entry(
                        path,
                        if let Some(content_hash) = content_hash.as_ref() {
                            content_hash
                        } else {
                            return Err(S::Error::custom("asset content hash failed"));
                        },
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
    if *turbo_tasks::read!(project.next_config().enable_immutable_assets())? {
        let path = turbo_tasks::read!(project.node_root())?.join("immutable-static-hashes.json")?;

        let asset = turbo_tasks::read!(
            AssetHashesManifestAsset::new(
                path,
                *project,
                turbo_tasks::read!(project.client_relative_path().owned())?,
            )
            .to_resolved()
        )?;
        Ok(Vc::cell(vec![ResolvedVc::upcast(asset)]))
    } else {
        Ok(OutputAssets::empty())
    }
}
