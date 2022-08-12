use std::{collections::HashSet, fmt::Write as FmtWrite};

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkGroupVc, ChunkItem, ChunkItemVc, ChunkableAssetVc, ChunkingContextVc},
    reference::AssetReferencesVc,
};

use super::{
    EcmascriptChunkContextVc, EcmascriptChunkItem, EcmascriptChunkItemContent,
    EcmascriptChunkItemContentVc, EcmascriptChunkItemOptions, EcmascriptChunkItemVc,
};
use crate::{
    chunk::EcmascriptChunkPlaceableVc,
    utils::{stringify_module_id, stringify_str},
};

#[turbo_tasks::value]
pub struct ChunkGroupLoaderChunkItem {
    asset: ChunkableAssetVc,
}

#[turbo_tasks::value_impl]
impl ChunkGroupLoaderChunkItemVc {
    #[turbo_tasks::function]
    pub fn new(asset: ChunkableAssetVc) -> Self {
        Self::cell(ChunkGroupLoaderChunkItem { asset })
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkGroupLoaderChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "chunk loader for {}",
            self.asset.path().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ChunkGroupLoaderChunkItem {
    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ChunkGroupLoaderChunkItem {
    #[turbo_tasks::function]
    async fn content(
        &self,
        chunk_context: EcmascriptChunkContextVc,
        context: ChunkingContextVc,
    ) -> Result<EcmascriptChunkItemContentVc> {
        let chunk_group = ChunkGroupVc::from_asset(self.asset, context);
        let chunks = chunk_group.chunks().await?;
        let placeable = EcmascriptChunkPlaceableVc::resolve_from(self.asset)
            .await?
            .unwrap();
        // For clippy -- This explicit deref is necessary
        let module_id = &*chunk_context.id(placeable).await?;
        let id = stringify_module_id(module_id);

        let mut chunk_ids = HashSet::new();
        for chunk in chunks.iter() {
            // Don't ask me why the id is generated from the path...
            let fs = chunk.path();
            let id = fs.to_string().await?.to_string();
            // Or why the pathname can't be found from the chunk.path().
            let root = fs.root().await?;
            // For clippy -- This explicit deref is necessary
            let asset_path = &*chunk.as_asset().path().await?;
            let pathname = root.get_relative_path_to(asset_path).unwrap();
            chunk_ids.insert((id, pathname));
        }

        let mut code = String::new();
        code += "const chunks = [\n";
        for (id, pathname) in chunk_ids {
            writeln!(
                code,
                "    [{}, {}],",
                stringify_str(&id),
                stringify_str(&pathname)
            )?;
        }
        code += "];\n";

        // TODO: a dedent macro would be awesome.
        write!(
            code,
            "
__turbopack_export_value__((__turbopack_import__) => {{
    const loads = chunks.map(([id, path]) => __turbopack_load__(id, path));
    return Promise.all(loads).then(() => {{
        return __turbopack_import__({id})
    }});
}});"
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code,
            id: chunk_context.helper_id("chunk loader", Some(self.asset.as_asset())),
            options: EcmascriptChunkItemOptions {
                ..Default::default()
            },
        }
        .into())
    }
}
