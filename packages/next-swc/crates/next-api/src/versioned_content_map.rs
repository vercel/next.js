use std::collections::HashMap;

use anyhow::{bail, Result};
use turbo_tasks::{State, TryFlatJoinIterExt, TryJoinIterExt, ValueDefault, ValueToString, Vc};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::core::{
        asset::Asset,
        output::{OutputAsset, OutputAssets},
        version::VersionedContent,
    },
};

/// An unresolved output assets operation. We need to pass an operation here as
/// it's stored for later usage and we want to reconnect this operation when
/// it's received from the map again.
#[turbo_tasks::value(transparent)]
pub struct OutputAssetsOperation(Vc<OutputAssets>);

type VersionedContentMapInner =
    HashMap<Vc<FileSystemPath>, (Vc<Box<dyn VersionedContent>>, Vc<OutputAssets>)>;

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
    ) -> Result<()> {
        let assets_operation = *assets_operation.await?;
        let assets = assets_operation.await?;
        let entries: Vec<_> = assets
            .iter()
            .map(|asset| async move {
                // NOTE(alexkirsz) `.versioned_content()` should not be resolved, to ensure that
                // it always points to the task that computes the versioned
                // content.
                Ok((
                    asset.ident().path().resolve().await?,
                    (asset.versioned_content(), assets_operation),
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
    pub async fn get(&self, path: Vc<FileSystemPath>) -> Result<Vc<Box<dyn VersionedContent>>> {
        let result = {
            // NOTE(alexkirsz) This is to avoid Rust marking this method as !Send because a
            // StateRef to the map is captured across an await boundary below, even though
            // it does not look like it would.
            // I think this is a similar issue as https://fasterthanli.me/articles/a-rust-match-made-in-hell
            let map = self.map.get();
            map.get(&path).copied()
        };
        let Some((content, assets_operation)) = result else {
            let path = path.to_string().await?;
            bail!("could not find versioned content for path {}", path);
        };
        // NOTE(alexkirsz) This is necessary to mark the task as active again.
        Vc::connect(assets_operation);
        Vc::connect(content);
        Ok(content)
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
}
