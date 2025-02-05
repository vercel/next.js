//! Type definitions for the Next.js manifest formats.

pub mod client_reference_manifest;

use anyhow::{Context, Result};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    trace::TraceRawVcs, FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TaskInput,
    TryJoinIterExt, Vc,
};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    output::{OutputAsset, OutputAssets},
    virtual_output::VirtualOutputAsset,
};

use crate::next_config::{CrossOriginConfig, Rewrites, RouteHas};

#[derive(Serialize, Default, Debug)]
pub struct PagesManifest {
    #[serde(flatten)]
    pub pages: FxHashMap<RcStr, RcStr>,
}

#[derive(Debug, Default)]
pub struct BuildManifest {
    pub polyfill_files: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
    pub root_main_files: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
    pub pages: FxIndexMap<RcStr, Vc<OutputAssets>>,
}

impl BuildManifest {
    pub async fn build_output(
        self,
        output_path: Vc<FileSystemPath>,
        client_relative_path: Vc<FileSystemPath>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let client_relative_path_ref = &*client_relative_path.await?;

        #[derive(Serialize, Default, Debug)]
        #[serde(rename_all = "camelCase")]
        pub struct SerializedBuildManifest {
            pub dev_files: Vec<RcStr>,
            pub amp_dev_files: Vec<RcStr>,
            pub polyfill_files: Vec<RcStr>,
            pub low_priority_files: Vec<RcStr>,
            pub root_main_files: Vec<RcStr>,
            pub pages: FxIndexMap<RcStr, Vec<RcStr>>,
            pub amp_first_pages: Vec<RcStr>,
        }

        let pages: Vec<(RcStr, Vec<RcStr>)> = self
            .pages
            .iter()
            .map(|(k, chunks)| async move {
                Ok((
                    k.clone(),
                    chunks
                        .await?
                        .iter()
                        .copied()
                        .map(|chunk| async move {
                            let chunk_path = chunk.path().await?;
                            Ok(client_relative_path_ref
                                .get_path_to(&chunk_path)
                                .context("client chunk entry path must be inside the client root")?
                                .into())
                        })
                        .try_join()
                        .await?,
                ))
            })
            .try_join()
            .await?;

        let polyfill_files: Vec<RcStr> = self
            .polyfill_files
            .iter()
            .copied()
            .map(|chunk| async move {
                let chunk_path = chunk.path().await?;
                Ok(client_relative_path_ref
                    .get_path_to(&chunk_path)
                    .context("failed to resolve client-relative path to polyfill")?
                    .into())
            })
            .try_join()
            .await?;

        let root_main_files: Vec<RcStr> = self
            .root_main_files
            .iter()
            .copied()
            .map(|chunk| async move {
                let chunk_path = chunk.path().await?;
                Ok(client_relative_path_ref
                    .get_path_to(&chunk_path)
                    .context("failed to resolve client-relative path to root_main_file")?
                    .into())
            })
            .try_join()
            .await?;

        let manifest = SerializedBuildManifest {
            pages: FxIndexMap::from_iter(pages.into_iter()),
            polyfill_files,
            root_main_files,
            ..Default::default()
        };

        let chunks: Vec<ReadRef<OutputAssets>> = self
            .pages
            .values()
            // rustc struggles here, so be very explicit
            .try_join()
            .await?;

        let references = chunks
            .into_iter()
            .flat_map(|c| c.into_iter().copied()) // once again, rustc struggles here
            .chain(self.root_main_files.iter().copied())
            .chain(self.polyfill_files.iter().copied())
            .collect();

        Ok(Vc::upcast(VirtualOutputAsset::new_with_references(
            output_path,
            AssetContent::file(File::from(serde_json::to_string_pretty(&manifest)?).into()),
            Vc::cell(references),
        )))
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase", tag = "version")]
#[allow(clippy::large_enum_variant)]
pub enum MiddlewaresManifest {
    #[serde(rename = "2")]
    MiddlewaresManifestV2(MiddlewaresManifestV2),
    #[serde(other)]
    Unsupported,
}

impl Default for MiddlewaresManifest {
    fn default() -> Self {
        Self::MiddlewaresManifestV2(Default::default())
    }
}

#[derive(
    Debug,
    Clone,
    Hash,
    Eq,
    PartialEq,
    Ord,
    PartialOrd,
    TaskInput,
    TraceRawVcs,
    Serialize,
    Deserialize,
    NonLocalValue,
)]
#[serde(rename_all = "camelCase", default)]
pub struct MiddlewareMatcher {
    // When skipped next.js with fill that during merging.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub regexp: Option<RcStr>,
    #[serde(skip_serializing_if = "bool_is_true")]
    pub locale: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has: Option<Vec<RouteHas>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub missing: Option<Vec<RouteHas>>,
    pub original_source: RcStr,
}

impl Default for MiddlewareMatcher {
    fn default() -> Self {
        Self {
            regexp: None,
            locale: true,
            has: None,
            missing: None,
            original_source: Default::default(),
        }
    }
}

fn bool_is_true(b: &bool) -> bool {
    *b
}

#[derive(Serialize, Default, Debug)]
pub struct EdgeFunctionDefinition {
    pub files: Vec<RcStr>,
    pub name: RcStr,
    pub page: RcStr,
    pub matchers: Vec<MiddlewareMatcher>,
    pub wasm: Vec<AssetBinding>,
    pub assets: Vec<AssetBinding>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub regions: Option<Regions>,
    pub env: FxIndexMap<RcStr, RcStr>,
}

#[derive(Serialize, Default, Debug)]
pub struct InstrumentationDefinition {
    pub files: Vec<RcStr>,
    pub name: RcStr,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub wasm: Vec<AssetBinding>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub assets: Vec<AssetBinding>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AssetBinding {
    pub name: RcStr,
    pub file_path: RcStr,
}

#[derive(Serialize, Debug)]
#[serde(untagged)]
pub enum Regions {
    Multiple(Vec<RcStr>),
    Single(RcStr),
}

#[derive(Serialize, Default, Debug)]
pub struct MiddlewaresManifestV2 {
    pub sorted_middleware: Vec<RcStr>,
    pub middleware: FxHashMap<RcStr, EdgeFunctionDefinition>,
    pub instrumentation: Option<InstrumentationDefinition>,
    pub functions: FxHashMap<RcStr, EdgeFunctionDefinition>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReactLoadableManifest {
    #[serde(flatten)]
    pub manifest: FxHashMap<RcStr, ReactLoadableManifestEntry>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReactLoadableManifestEntry {
    pub id: u32,
    pub files: Vec<RcStr>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NextFontManifest {
    pub pages: FxHashMap<RcStr, Vec<RcStr>>,
    pub app: FxHashMap<RcStr, Vec<RcStr>>,
    pub app_using_size_adjust: bool,
    pub pages_using_size_adjust: bool,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppPathsManifest {
    #[serde(flatten)]
    pub edge_server_app_paths: PagesManifest,
    #[serde(flatten)]
    pub node_server_app_paths: PagesManifest,
}

// A struct represent a single entry in react-loadable-manifest.json.
// The manifest is in a format of:
// { [`${origin} -> ${imported}`]: { id: `${origin} -> ${imported}`, files:
// string[] } }
#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoadableManifest {
    pub id: RcStr,
    pub files: Vec<RcStr>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ServerReferenceManifest<'a> {
    /// A map from hashed action name to the runtime module we that exports it.
    pub node: FxHashMap<&'a str, ActionManifestEntry<'a>>,
    /// A map from hashed action name to the runtime module we that exports it.
    pub edge: FxHashMap<&'a str, ActionManifestEntry<'a>>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActionManifestEntry<'a> {
    /// A mapping from the page that uses the server action to the runtime
    /// module that exports it.
    pub workers: FxHashMap<&'a str, ActionManifestWorkerEntry<'a>>,

    pub layer: FxHashMap<&'a str, ActionLayer>,
}

#[derive(Serialize, Debug)]
pub struct ActionManifestWorkerEntry<'a> {
    #[serde(rename = "moduleId")]
    pub module_id: ActionManifestModuleId<'a>,
    #[serde(rename = "async")]
    pub is_async: bool,
}

#[derive(Serialize, Debug)]
#[serde(untagged)]
pub enum ActionManifestModuleId<'a> {
    String(&'a str),
    Number(f64),
}

#[derive(
    Debug,
    Copy,
    Clone,
    Hash,
    Eq,
    PartialEq,
    Ord,
    PartialOrd,
    TaskInput,
    TraceRawVcs,
    Serialize,
    Deserialize,
    NonLocalValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum ActionLayer {
    Rsc,
    ActionBrowser,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClientReferenceManifest {
    pub module_loading: ModuleLoading,
    /// Mapping of module path and export name to client module ID and required
    /// client chunks.
    pub client_modules: ManifestNode,
    /// Mapping of client module ID to corresponding SSR module ID and required
    /// SSR chunks.
    pub ssr_module_mapping: FxHashMap<ModuleId, ManifestNode>,
    /// Same as `ssr_module_mapping`, but for Edge SSR.
    #[serde(rename = "edgeSSRModuleMapping")]
    pub edge_ssr_module_mapping: FxHashMap<ModuleId, ManifestNode>,
    /// Mapping of client module ID to corresponding RSC module ID and required
    /// RSC chunks.
    pub rsc_module_mapping: FxHashMap<ModuleId, ManifestNode>,
    /// Same as `rsc_module_mapping`, but for Edge RSC.
    #[serde(rename = "edgeRscModuleMapping")]
    pub edge_rsc_module_mapping: FxHashMap<ModuleId, ManifestNode>,
    /// Mapping of server component path to required CSS client chunks.
    #[serde(rename = "entryCSSFiles")]
    pub entry_css_files: FxHashMap<RcStr, FxIndexSet<CssResource>>,
    /// Mapping of server component path to required JS client chunks.
    #[serde(rename = "entryJSFiles")]
    pub entry_js_files: FxHashMap<RcStr, FxIndexSet<RcStr>>,
}

#[derive(Serialize, Debug, Clone, Eq, Hash, PartialEq)]
pub struct CssResource {
    pub path: RcStr,
    pub inlined: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<RcStr>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModuleLoading {
    pub prefix: RcStr,
    pub cross_origin: Option<CrossOriginConfig>,
}

#[derive(Serialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManifestNode {
    /// Mapping of export name to manifest node entry.
    #[serde(flatten)]
    pub module_exports: FxHashMap<RcStr, ManifestNodeEntry>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManifestNodeEntry {
    /// Turbopack module ID.
    pub id: ModuleId,
    /// Export name.
    pub name: RcStr,
    /// Chunks for the module. JS and CSS.
    pub chunks: Vec<RcStr>,
    // TODO(WEB-434)
    pub r#async: bool,
}

#[derive(Serialize, Debug, Eq, PartialEq, Hash, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum ModuleId {
    String(RcStr),
    Number(u64),
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FontManifest(pub Vec<FontManifestEntry>);

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FontManifestEntry {
    pub url: RcStr,
    pub content: RcStr,
}

#[derive(Default, Debug)]
pub struct AppBuildManifest {
    pub pages: FxIndexMap<RcStr, Vc<OutputAssets>>,
}

impl AppBuildManifest {
    pub async fn build_output(
        self,
        output_path: Vc<FileSystemPath>,
        client_relative_path: Vc<FileSystemPath>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let client_relative_path_ref = &*client_relative_path.await?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        pub struct SerializedAppBuildManifest {
            pub pages: FxIndexMap<RcStr, Vec<RcStr>>,
        }

        let pages: Vec<(RcStr, Vec<RcStr>)> = self
            .pages
            .iter()
            .map(|(k, chunks)| async move {
                Ok((
                    k.clone(),
                    chunks
                        .await?
                        .iter()
                        .copied()
                        .map(|chunk| async move {
                            let chunk_path = chunk.path().await?;
                            Ok(client_relative_path_ref
                                .get_path_to(&chunk_path)
                                .context("client chunk entry path must be inside the client root")?
                                .into())
                        })
                        .try_join()
                        .await?,
                ))
            })
            .try_join()
            .await?;

        let manifest = SerializedAppBuildManifest {
            pages: FxIndexMap::from_iter(pages.into_iter()),
        };

        let references = self.pages.values().try_join().await?;

        let references = references
            .into_iter()
            .flat_map(|c| c.into_iter().copied())
            .collect();

        Ok(Vc::upcast(VirtualOutputAsset::new_with_references(
            output_path,
            AssetContent::file(File::from(serde_json::to_string_pretty(&manifest)?).into()),
            Vc::cell(references),
        )))
    }
}

// TODO(alexkirsz) Unify with the one for dev.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClientBuildManifest<'a> {
    #[serde(rename = "__rewrites")]
    pub rewrites: &'a Rewrites,

    pub sorted_pages: &'a [RcStr],

    #[serde(flatten)]
    pub pages: FxHashMap<RcStr, Vec<&'a str>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_middleware_matcher_serialization() {
        let matchers = vec![
            MiddlewareMatcher {
                regexp: None,
                locale: false,
                has: None,
                missing: None,
                original_source: "".into(),
            },
            MiddlewareMatcher {
                regexp: Some(".*".into()),
                locale: true,
                has: Some(vec![RouteHas::Query {
                    key: "foo".into(),
                    value: None,
                }]),
                missing: Some(vec![RouteHas::Query {
                    key: "bar".into(),
                    value: Some("value".into()),
                }]),
                original_source: "source".into(),
            },
        ];

        let serialized = serde_json::to_string(&matchers).unwrap();
        let deserialized: Vec<MiddlewareMatcher> = serde_json::from_str(&serialized).unwrap();

        assert_eq!(matchers, deserialized);
    }
}
