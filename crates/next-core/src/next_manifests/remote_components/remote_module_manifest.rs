use anyhow::Result;
use serde::Serialize;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_browser::BrowserChunkingContext;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::CrossOrigin,
    output::{OutputAsset, OutputAssetsReference},
};

use super::RuntimeKind;
use crate::{
    next_manifests::{
        ModuleId,
        client_reference_manifest::{
            ClientReferenceManifest, CssResource, ManifestNode, build_manifest,
        },
    },
    util::NextRuntime,
};

pub const REMOTE_MODULE_MANIFEST_PROTOCOL: &str = "turbopack.remote-modules";
pub const REMOTE_MODULE_MANIFEST_VERSION: u32 = 1;

/// Remote Module Manifest (`turbopack.remote-modules`)
///
/// This is a public manifest that maps React Flight client references
/// and remote chunks to stable module IDs, chunk URLs, exports,
/// runtime kind, and any SSR/client variant metadata required
/// to load the module later.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteModuleManifestData {
    protocol: &'static str,
    version: u32,
    route: RcStr,
    module_loading: ModuleLoadingData,
    chunk_loading_global: RcStr,
    client_references: Vec<RemoteClientReference>,
    #[serde(skip_serializing_if = "FxIndexMap::is_empty")]
    entry_css: FxIndexMap<RcStr, FxIndexSet<CssResource>>,
    #[serde(skip_serializing_if = "FxIndexMap::is_empty")]
    entry_js: FxIndexMap<RcStr, FxIndexSet<RcStr>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModuleLoadingData {
    prefix: RcStr,
    cross_origin: Option<&'static str>,
}

/// Maps Turbopack's `CrossOrigin` to the React/HTML `crossOrigin` vocabulary.
fn normalize_cross_origin(value: CrossOrigin) -> Option<&'static str> {
    match value {
        CrossOrigin::None => None,
        CrossOrigin::Anonymous => Some(""),
        CrossOrigin::UseCredentials => Some("use-credentials"),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteClientReference {
    key: RcStr,
    export_name: RcStr,
    variants: RemoteModuleVariants,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct RemoteModuleVariants {
    browser: RemoteModuleVariant,
    #[serde(skip_serializing_if = "Option::is_none")]
    nodejs: Option<RemoteModuleVariant>,
    #[serde(skip_serializing_if = "Option::is_none")]
    edge: Option<RemoteModuleVariant>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rsc: Option<RemoteModuleVariant>,
    #[serde(skip_serializing_if = "Option::is_none")]
    edge_rsc: Option<RemoteModuleVariant>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct RemoteModuleVariant {
    id: ModuleId,
    name: RcStr,
    chunks: Vec<RcStr>,
    r#async: bool,
    runtime_kind: RuntimeKind,
}

impl Default for ModuleId {
    fn default() -> Self {
        ModuleId::String(RcStr::default())
    }
}

fn variant_from_node(node: &ManifestNode, kind: RuntimeKind) -> Option<RemoteModuleVariant> {
    let (_, entry) = node.module_exports.iter().next()?;
    Some(RemoteModuleVariant {
        id: entry.id.clone(),
        name: entry.name.clone(),
        chunks: entry.chunks.clone(),
        r#async: entry.r#async,
        runtime_kind: kind,
    })
}

#[turbo_tasks::value(shared)]
pub struct RemoteModuleManifest {
    pub node_root: FileSystemPath,
    pub entry_name: RcStr,
    pub client_reference_manifest: ResolvedVc<ClientReferenceManifest>,
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for RemoteModuleManifest {}

#[turbo_tasks::value_impl]
impl OutputAsset for RemoteModuleManifest {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        let normalized = self.entry_name.replace("%5F", "_");
        Ok(self
            .node_root
            .join(&format!(
                "server/app{normalized}_remote-module-manifest.json",
            ))?
            .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for RemoteModuleManifest {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let cref = self.client_reference_manifest.await?;
        let runtime = cref.runtime;
        let result = build_manifest(*self.client_reference_manifest).await?;
        let manifest = result.manifest.await?;

        let chunk_loading_global = if let Some(browser) =
            ResolvedVc::try_downcast_type::<BrowserChunkingContext>(cref.client_chunking_context)
        {
            browser.chunk_loading_global().owned().await?
        } else {
            rcstr!("TURBOPACK")
        };

        let mut client_references = Vec::new();
        for (key, browser_entry) in &manifest.client_modules.module_exports {
            let client_id = &browser_entry.id;
            let nodejs = manifest
                .ssr_module_mapping
                .get(client_id)
                .and_then(|n| variant_from_node(n, RuntimeKind::NodeJs));
            let edge = manifest
                .edge_ssr_module_mapping
                .get(client_id)
                .and_then(|n| variant_from_node(n, RuntimeKind::Edge));
            let rsc = manifest
                .rsc_module_mapping
                .get(client_id)
                .and_then(|n| variant_from_node(n, RuntimeKind::NodeJs));
            let edge_rsc = manifest
                .edge_rsc_module_mapping
                .get(client_id)
                .and_then(|n| variant_from_node(n, RuntimeKind::Edge));

            client_references.push(RemoteClientReference {
                key: key.clone(),
                export_name: browser_entry.name.clone(),
                variants: RemoteModuleVariants {
                    browser: RemoteModuleVariant {
                        id: browser_entry.id.clone(),
                        name: browser_entry.name.clone(),
                        chunks: browser_entry.chunks.clone(),
                        r#async: browser_entry.r#async,
                        runtime_kind: RuntimeKind::Browser,
                    },
                    nodejs: if runtime == NextRuntime::NodeJs {
                        nodejs
                    } else {
                        None
                    },
                    edge: if runtime == NextRuntime::Edge {
                        edge
                    } else {
                        None
                    },
                    rsc,
                    edge_rsc,
                },
            });
        }

        let data = RemoteModuleManifestData {
            protocol: REMOTE_MODULE_MANIFEST_PROTOCOL,
            version: REMOTE_MODULE_MANIFEST_VERSION,
            route: self.entry_name.clone(),
            module_loading: ModuleLoadingData {
                prefix: manifest.module_loading.prefix.clone(),
                cross_origin: normalize_cross_origin(manifest.module_loading.cross_origin),
            },
            chunk_loading_global,
            client_references,
            entry_css: manifest.entry_css_files.clone(),
            entry_js: manifest.entry_js_files.clone(),
        };

        let json = serde_json::to_string(&data)?;
        Ok(AssetContent::file(
            FileContent::Content(File::from(json)).cell(),
        ))
    }
}
