use anyhow::{bail, Result};
use turbo_tasks::primitives::StringVc;
use turbopack_binding::turbopack::core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkableModule, ChunkableModuleVc, ChunkingContext, ChunkingContextVc},
    ident::AssetIdentVc,
    module::{Module, ModuleVc},
    output::OutputAssetsVc,
    reference::AssetReferencesVc,
};

/// A [`NextDynamicEntryModule`] is a marker asset used to indicate which
/// dynamic assets should appear in the dynamic manifest.
#[turbo_tasks::value(transparent)]
pub struct NextDynamicEntryModule {
    pub client_entry_module: ModuleVc,
}

#[turbo_tasks::value_impl]
impl NextDynamicEntryModuleVc {
    /// Create a new [`NextDynamicEntryModule`] from the given source CSS
    /// asset.
    #[turbo_tasks::function]
    pub fn new(client_entry_module: ModuleVc) -> NextDynamicEntryModuleVc {
        NextDynamicEntryModule {
            client_entry_module,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn client_chunks(
        self,
        client_chunking_context: ChunkingContextVc,
    ) -> Result<OutputAssetsVc> {
        let this = self.await?;

        let Some(client_entry_module) =
            ChunkableModuleVc::resolve_from(this.client_entry_module).await?
        else {
            bail!("dynamic client asset must be chunkable");
        };

        let client_entry_chunk = client_entry_module.as_root_chunk(client_chunking_context);
        Ok(client_chunking_context.chunk_group(client_entry_chunk))
    }
}

#[turbo_tasks::function]
fn dynamic_modifier() -> StringVc {
    StringVc::cell("dynamic".to_string())
}

#[turbo_tasks::value_impl]
impl Asset for NextDynamicEntryModule {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.client_entry_module
            .ident()
            .with_modifier(dynamic_modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> Result<AssetContentVc> {
        // The client reference asset only serves as a marker asset.
        bail!("NextDynamicEntryModule has no content")
    }

    #[turbo_tasks::function]
    fn references(_self_vc: NextDynamicEntryModuleVc) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}

#[turbo_tasks::value_impl]
impl Module for NextDynamicEntryModule {}
