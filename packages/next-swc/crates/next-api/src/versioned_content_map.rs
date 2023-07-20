use std::collections::HashMap;

use anyhow::{bail, Result};
use turbo_tasks::{State, TryJoinIterExt, ValueDefault, ValueToString, Vc};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::core::{
        asset::Asset,
        output::{OutputAsset, OutputAssets},
        version::VersionedContent,
    },
};

#[turbo_tasks::value]
pub struct VersionedContentMap {
    map: State<HashMap<Vc<FileSystemPath>, Vc<Box<dyn VersionedContent>>>>,
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
    pub async fn insert_output_assets(self: Vc<Self>, assets: Vc<OutputAssets>) -> Result<()> {
        let assets = assets.await?;
        let entries: Vec<_> = assets
            .iter()
            .map(|asset| async move {
                // NOTE(alexkirsz) `.versioned_content()` should not be resolved, to ensure that
                // it always points to the task that computes the versioned
                // content.
                Ok((
                    asset.ident().path().resolve().await?,
                    asset.versioned_content(),
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
        let content = {
            // NOTE(alexkirsz) This is to avoid Rust marking this method as !Send because a
            // StateRef to the map is captured across an await boundary below, even though
            // it does not look like it would.
            // I think this is a similar issue as https://fasterthanli.me/articles/a-rust-match-made-in-hell
            let map = self.map.get();
            map.get(&path).copied()
        };
        let Some(content) = content else {
            let path = path.to_string().await?;
            bail!("could not find versioned content for path {}", path);
        };
        // NOTE(alexkirsz) This is necessary to mark the task as active again.
        content.node.connect();
        Ok(content)
    }
}
