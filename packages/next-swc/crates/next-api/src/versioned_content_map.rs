use std::collections::HashMap;

use anyhow::{bail, Result};
use next_core::emit_client_assets;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, Completion, State, TryFlatJoinIterExt,
    TryJoinIterExt, ValueDefault, ValueToString, Vc,
};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::core::{
        asset::Asset,
        output::{OutputAsset, OutputAssets},
        source_map::{GenerateSourceMap, OptionSourceMap},
        version::VersionedContent,
    },
};

/// An unresolved output assets operation. We need to pass an operation here as
/// it's stored for later usage and we want to reconnect this operation when
/// it's received from the map again.
#[turbo_tasks::value(transparent)]
pub struct OutputAssetsOperation(Vc<OutputAssets>);

#[derive(
    Clone, Copy, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, Serialize, Deserialize, Debug,
)]
struct MapEntry {
    assets_operation: Vc<OutputAssets>,
    emit_operation: Vc<Completion>,
}

#[turbo_tasks::value(transparent)]
struct OptionMapEntry(Option<MapEntry>);

type VersionedContentMapInner = HashMap<Vc<FileSystemPath>, MapEntry>;

#[turbo_tasks::value]
pub struct VersionedContentMap {
    map: State<VersionedContentMapInner>,
}

impl ValueDefault for VersionedContentMap {
    fn value_default() -> Vc<Self> {
        VersionedContentMap {
            map: State::new(HashMap::new()),
        }
        .cell()
    }
}

impl VersionedContentMap {
    // NOTE(alexkirsz) This must not be a `#[turbo_tasks::function]` because it
    // should be a singleton for each project.
    pub fn new() -> Vc<Self> {
        Self::value_default()
    }
}

#[turbo_tasks::value_impl]
impl VersionedContentMap {
    #[turbo_tasks::function]
    pub async fn insert_output_assets(
        self: Vc<Self>,
        assets_operation: Vc<OutputAssetsOperation>,
        client_relative_path: Vc<FileSystemPath>,
        client_output_path: Vc<FileSystemPath>,
    ) -> Result<()> {
        let assets_operation = *assets_operation.await?;
        // Make sure all written client assets are up-to-date
        let emit_operation =
            emit_client_assets(assets_operation, client_relative_path, client_output_path);
        let assets = assets_operation.await?;
        let entries: Vec<_> = assets
            .iter()
            .map(|&asset| async move {
                Ok((
                    asset.ident().path().resolve().await?,
                    MapEntry {
                        assets_operation,
                        emit_operation,
                    },
                ))
            })
            .try_join()
            .await?;
        self.await?.map.update_conditionally(move |map| {
            map.extend(entries);
            true
        });
        Ok(())
    }

    #[turbo_tasks::function]
    pub fn get(self: Vc<Self>, path: Vc<FileSystemPath>) -> Vc<Box<dyn VersionedContent>> {
        self.get_asset(path).versioned_content()
    }

    #[turbo_tasks::function]
    pub async fn get_source_map(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        section: Option<String>,
    ) -> Result<Vc<OptionSourceMap>> {
        if let Some(generate_source_map) =
            Vc::try_resolve_sidecast::<Box<dyn GenerateSourceMap>>(self.get_asset(path)).await?
        {
            Ok(if let Some(section) = section {
                generate_source_map.by_section(section)
            } else {
                generate_source_map.generate_source_map()
            })
        } else {
            let path = path.to_string().await?;
            bail!("no source map for path {}", path);
        }
    }

    #[turbo_tasks::function]
    pub async fn get_asset(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let result = self.raw_get(path).await?;
        if let Some(MapEntry {
            assets_operation,
            emit_operation,
        }) = *result
        {
            // NOTE(alexkirsz) This is necessary to mark the task as active again.
            Vc::connect(assets_operation);
            Vc::connect(emit_operation);

            for &asset in assets_operation.await?.iter() {
                if asset.ident().path().resolve().await? == path {
                    return Ok(asset);
                }
            }
        }
        let path = path.to_string().await?;
        bail!("could not find asset for path {}", path);
    }

    #[turbo_tasks::function]
    pub async fn keys_in_path(&self, root: Vc<FileSystemPath>) -> Result<Vc<Vec<String>>> {
        let keys = {
            let map = self.map.get();
            map.keys().copied().collect::<Vec<_>>()
        };
        let root = &root.await?;
        let keys = keys
            .into_iter()
            .map(|path| async move { Ok(root.get_path_to(&*path.await?).map(|p| p.to_string())) })
            .try_flat_join()
            .await?;
        Ok(Vc::cell(keys))
    }

    #[turbo_tasks::function]
    async fn raw_get(&self, path: Vc<FileSystemPath>) -> Result<Vc<OptionMapEntry>> {
        let result = {
            let map = self.map.get();
            map.get(&path).copied()
        };
        Ok(Vc::cell(result))
    }
}
