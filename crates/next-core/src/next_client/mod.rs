pub(crate) mod runtime_reference;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, ValueToString};
use turbo_tasks_fs::{embed_file, FileSystemPathVc};
use turbopack::{
    ecmascript::chunk_group_files_asset::ChunkGroupFilesAsset,
    module_options::ModuleOptionsContextVc,
    resolve_options_context::ResolveOptionsContextVc,
    transition::{Transition, TransitionVc},
    ModuleAssetContextVc,
};
use turbopack_core::{
    asset::AssetVc,
    chunk::{ChunkableAssetVc, ChunkingContextVc},
    context::AssetContext,
    environment::EnvironmentVc,
    reference::{AssetReferenceVc, AssetReferencesVc},
    resolve::parse::RequestVc,
    wrapper_asset::WrapperAssetVc,
};

use self::runtime_reference::RuntimeAssetReferenceVc;

#[derive(ValueDebugFormat, PartialEq, Eq, TraceRawVcs, Serialize, Deserialize)]
pub enum RuntimeReference {
    Request(RequestVc, FileSystemPathVc),
    Reference(AssetReferenceVc),
}

/// Makes a transition into a next.js client context.
///
/// It wraps the target asset with client bootstrapping hydration. It changes
/// the environment to be inside of the browser. It offers a module to the
/// importer that exports an array of chunk urls.
#[turbo_tasks::value(shared)]
pub struct NextClientTransition {
    pub client_environment: EnvironmentVc,
    pub client_module_options_context: ModuleOptionsContextVc,
    pub client_resolve_options_context: ResolveOptionsContextVc,
    pub client_chunking_context: ChunkingContextVc,
    pub server_root: FileSystemPathVc,
    pub runtime_references: Vec<RuntimeReference>,
}

#[turbo_tasks::value_impl]
impl Transition for NextClientTransition {
    #[turbo_tasks::function]
    fn process_source(&self, asset: AssetVc) -> AssetVc {
        let next_hydrate = embed_file!("next_hydrate.js").into();

        WrapperAssetVc::new(asset, "next-hydrate.js", next_hydrate).into()
    }

    #[turbo_tasks::function]
    fn process_environment(&self, _environment: EnvironmentVc) -> EnvironmentVc {
        self.client_environment
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        self.client_module_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: AssetVc,
        context: ModuleAssetContextVc,
    ) -> Result<AssetVc> {
        if let Some(chunkable_asset) = ChunkableAssetVc::resolve_from(asset).await? {
            let runtime_references = self
                .runtime_references
                .iter()
                .map(|r| match *r {
                    RuntimeReference::Request(r, context_path) => {
                        RuntimeAssetReferenceVc::new(context.with_context_path(context_path), r)
                            .as_asset_reference()
                    }
                    RuntimeReference::Reference(r) => r,
                })
                .collect::<Vec<_>>();
            let runtime_references = if runtime_references.is_empty() {
                None
            } else {
                Some(AssetReferencesVc::cell(runtime_references))
            };
            Ok(ChunkGroupFilesAsset {
                asset: chunkable_asset,
                chunking_context: self.client_chunking_context,
                base_path: self.server_root,
                runtime_references,
            }
            .cell()
            .into())
        } else {
            Err(anyhow!(
                "asset {} is not chunkable",
                asset.path().to_string().await?
            ))
        }
    }
}
