use anyhow::Result;
use turbo_tasks::{
    primitives::{JsonValueVc, StringVc},
    Value, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::{embed_file, FileSystemPathVc};
use turbopack::ecmascript::{
    EcmascriptInputTransform, EcmascriptInputTransformsVc, EcmascriptModuleAssetVc, ModuleAssetType,
};
use turbopack_core::{
    self,
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::ChunkingContextVc,
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{ResolveResult, ResolveResultVc},
    wrapper_asset::WrapperAssetVc,
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceablesVc;

use crate::nodejs::{external_asset_entrypoints, render_static};

/// This is an asset which content is determined by running
/// `React.renderToString` on the default export of [entry_asset] in a Node.js
/// context.
///
/// For that the [entry_asset] is bundled and emitted into
/// [intermediate_output_path] and a pool of Node.js processes is used to run
/// that. [request_data] is passed to the [entry_asset] component as props. When
/// only [path] and [request_data] differs multiple [ServerRenderedAsset]s will
/// share the Node.js worker pool.
#[turbo_tasks::value]
pub struct ServerRenderedAsset {
    path: FileSystemPathVc,
    context: AssetContextVc,
    entry_asset: AssetVc,
    chunking_context: ChunkingContextVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    intermediate_output_path: FileSystemPathVc,
    request_data: JsonValueVc,
}

#[turbo_tasks::value_impl]
impl ServerRenderedAssetVc {
    #[turbo_tasks::function]
    pub fn new(
        path: FileSystemPathVc,
        context: AssetContextVc,
        entry_asset: AssetVc,
        runtime_entries: EcmascriptChunkPlaceablesVc,
        chunking_context: ChunkingContextVc,
        intermediate_output_path: FileSystemPathVc,
        request_data: JsonValueVc,
    ) -> Self {
        ServerRenderedAsset {
            path,
            context,
            entry_asset,
            runtime_entries,
            chunking_context,
            intermediate_output_path,
            request_data,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for ServerRenderedAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        render_static(
            self.path,
            get_intermediate_module(self.context, self.entry_asset),
            self.runtime_entries,
            self.chunking_context,
            self.intermediate_output_path,
            self.request_data,
        )
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(AssetReferencesVc::cell(
            external_asset_entrypoints(
                get_intermediate_module(self.context, self.entry_asset),
                self.runtime_entries,
                self.chunking_context,
                self.intermediate_output_path,
            )
            .await?
            .iter()
            .map(|a| {
                ServerRenderedClientAssetReference { asset: *a }
                    .cell()
                    .into()
            })
            .collect(),
        ))
    }
}

#[turbo_tasks::value]
pub struct ServerRenderedClientAssetReference {
    asset: AssetVc,
}

#[turbo_tasks::value_impl]
impl AssetReference for ServerRenderedClientAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(self.asset, Vec::new()).into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ServerRenderedClientAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "client asset {}",
            self.asset.path().to_string().await?
        )))
    }
}

#[turbo_tasks::function]
fn get_intermediate_module(
    context: AssetContextVc,
    entry_asset: AssetVc,
) -> EcmascriptModuleAssetVc {
    EcmascriptModuleAssetVc::new(
        WrapperAssetVc::new(
            entry_asset,
            "server-renderer.js",
            embed_file!("server_renderer.js").into(),
        )
        .into(),
        context.with_context_path(entry_asset.path()),
        Value::new(ModuleAssetType::Ecmascript),
        EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::React { refresh: false }]),
        context.environment(),
    )
}
