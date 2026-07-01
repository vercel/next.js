use anyhow::Result;
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, ModuleChunkItemIdExt},
    module::Module,
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssetsReference},
};

use super::RuntimeKind;
use crate::next_manifests::ModuleId;

pub const MODULE_ID_MANIFEST_PROTOCOL: &str = "turbopack.module-ids";
pub const MODULE_ID_MANIFEST_VERSION: u32 = 1;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModuleIdManifestData {
    protocol: &'static str,
    version: u32,
    route: RcStr,
    #[serde(skip_serializing_if = "Option::is_none")]
    page_loader_id: Option<ModuleId>,
    modules: Vec<ModuleIdEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModuleIdEntry {
    id: ModuleId,
    path: RcStr,
    layer: RcStr,
    runtime_kind: RuntimeKind,
}

/// Module ID Map (`turbopack.module-ids`)
///
/// A manifest that maps from remote module IDs to shared specifiers.
/// One per route is emitted.
#[turbo_tasks::value(shared)]
pub struct ModuleIdManifest {
    pub node_root: FileSystemPath,
    pub entry_name: RcStr,
    pub module_graph: ResolvedVc<ModuleGraph>,
    pub client_chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub ssr_chunking_context: Option<ResolvedVc<Box<dyn ChunkingContext>>>,
    pub output_path: Option<FileSystemPath>,
    /// Pages router only: this route's page-loader entry module.
    pub page_loader_module: Option<ResolvedVc<Box<dyn Module>>>,
}

fn runtime_kind_for_layer(layer: &str) -> RuntimeKind {
    if layer.contains("client") || layer.contains("browser") {
        RuntimeKind::Browser
    } else if layer.contains("edge") {
        RuntimeKind::Edge
    } else {
        RuntimeKind::NodeJs
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for ModuleIdManifest {}

#[turbo_tasks::value_impl]
impl OutputAsset for ModuleIdManifest {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        if let Some(output_path) = &self.output_path {
            return Ok(output_path.clone().cell());
        }
        let normalized = self.entry_name.replace("%5F", "_");
        Ok(self
            .node_root
            .join(&format!("server/app{normalized}_module-ids-manifest.json"))?
            .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleIdManifest {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let graphs = self.module_graph.iter_graphs().await?;
        let mut modules = Vec::new();

        for layer in graphs.iter() {
            let layer = layer.connect().await?;
            for module in layer.iter_nodes() {
                let ident = module.ident().await?;
                let layer: RcStr = ident
                    .layer
                    .as_ref()
                    .map(|l| l.name().clone())
                    .unwrap_or_default();
                let runtime_kind = runtime_kind_for_layer(&layer);

                let chunking_context = match runtime_kind {
                    RuntimeKind::Browser => *self.client_chunking_context,
                    _ => match self.ssr_chunking_context {
                        Some(ctx) => *ctx,
                        None => *self.client_chunking_context,
                    },
                };

                let id: ModuleId = match module.chunk_item_id(chunking_context).await {
                    Ok(id) => (&id).into(),
                    Err(_) => continue,
                };

                modules.push(ModuleIdEntry {
                    id,
                    path: ident.path.path.clone(),
                    layer,
                    runtime_kind,
                });
            }
        }

        let page_loader_id: Option<ModuleId> = match self.page_loader_module {
            Some(module) => match module.chunk_item_id(*self.client_chunking_context).await {
                Ok(id) => Some((&id).into()),
                Err(_) => None,
            },
            None => None,
        };

        let data = ModuleIdManifestData {
            protocol: MODULE_ID_MANIFEST_PROTOCOL,
            version: MODULE_ID_MANIFEST_VERSION,
            route: self.entry_name.clone(),
            page_loader_id,
            modules,
        };

        let json = serde_json::to_string(&data)?;
        Ok(AssetContent::file(
            FileContent::Content(File::from(json)).cell(),
        ))
    }
}
