//! Type definitions for the Next.js manifest formats.

pub mod client_reference_manifest;
mod encode_uri_component;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryFlatJoinIterExt, TryJoinIterExt,
    Vc, trace::TraceRawVcs,
};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssets},
};

use crate::next_config::RouteHas;

#[derive(Serialize, Default, Debug)]
pub struct PagesManifest {
    #[serde(flatten)]
    pub pages: FxIndexMap<RcStr, RcStr>,
}

#[derive(Debug)]
#[turbo_tasks::value(shared)]
pub struct BuildManifest {
    pub output_path: FileSystemPath,
    pub client_relative_path: FileSystemPath,

    pub polyfill_files: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
    pub root_main_files: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
    pub pages: FxIndexMap<RcStr, ResolvedVc<OutputAssets>>,
}

#[turbo_tasks::value_impl]
impl OutputAsset for BuildManifest {
    #[turbo_tasks::function]
    async fn path(&self) -> Vc<FileSystemPath> {
        self.output_path.clone().cell()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        let chunks: Vec<ReadRef<OutputAssets>> = self.pages.values().try_join().await?;

        let root_main_files = self
            .root_main_files
            .iter()
            .map(async |c| Ok(c.path().await?.has_extension(".js").then_some(*c)))
            .try_flat_join()
            .await?;

        let references = chunks
            .into_iter()
            .flatten()
            .copied()
            .chain(root_main_files.into_iter())
            .chain(self.polyfill_files.iter().copied())
            .collect();

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for BuildManifest {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let client_relative_path = &self.client_relative_path;

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
            .map(async |(k, chunks)| {
                Ok((
                    k.clone(),
                    chunks
                        .await?
                        .iter()
                        .copied()
                        .map(async |chunk| {
                            let chunk_path = chunk.path().await?;
                            Ok(client_relative_path
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
            .map(async |chunk| {
                let chunk_path = chunk.path().await?;
                Ok(client_relative_path
                    .get_path_to(&chunk_path)
                    .context("failed to resolve client-relative path to polyfill")?
                    .into())
            })
            .try_join()
            .await?;

        let root_main_files: Vec<RcStr> = self
            .root_main_files
            .iter()
            .map(async |chunk| {
                let chunk_path = chunk.path().await?;
                if !chunk_path.has_extension(".js") {
                    Ok(None)
                } else {
                    Ok(Some(
                        client_relative_path
                            .get_path_to(&chunk_path)
                            .context("failed to resolve client-relative path to root_main_file")?
                            .into(),
                    ))
                }
            })
            .try_flat_join()
            .await?;

        let manifest = SerializedBuildManifest {
            pages: FxIndexMap::from_iter(pages.into_iter()),
            polyfill_files,
            root_main_files,
            ..Default::default()
        };

        Ok(AssetContent::file(
            File::from(serde_json::to_string_pretty(&manifest)?).into(),
        ))
    }
}

#[derive(Debug)]
#[turbo_tasks::value(shared)]
pub struct ClientBuildManifest {
    pub output_path: FileSystemPath,
    pub client_relative_path: FileSystemPath,

    pub pages: FxIndexMap<RcStr, ResolvedVc<Box<dyn OutputAsset>>>,
}

#[turbo_tasks::value_impl]
impl OutputAsset for ClientBuildManifest {
    #[turbo_tasks::function]
    async fn path(&self) -> Vc<FileSystemPath> {
        self.output_path.clone().cell()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        let chunks: Vec<ResolvedVc<Box<dyn OutputAsset>>> = self.pages.values().copied().collect();
        Ok(Vc::cell(chunks))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ClientBuildManifest {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let client_relative_path = &self.client_relative_path;

        let manifest: FxIndexMap<RcStr, Vec<RcStr>> = self
            .pages
            .iter()
            .map(async |(k, chunk)| {
                Ok((
                    k.clone(),
                    vec![
                        client_relative_path
                            .get_path_to(&*chunk.path().await?)
                            .context("client chunk entry path must be inside the client root")?
                            .into(),
                    ],
                ))
            })
            .try_join()
            .await?
            .into_iter()
            .collect();

        Ok(AssetContent::file(
            File::from(serde_json::to_string_pretty(&manifest)?).into(),
        ))
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
pub struct ProxyMatcher {
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

impl Default for ProxyMatcher {
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
    pub matchers: Vec<ProxyMatcher>,
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
    pub middleware: FxIndexMap<RcStr, EdgeFunctionDefinition>,
    pub instrumentation: Option<InstrumentationDefinition>,
    pub functions: FxIndexMap<RcStr, EdgeFunctionDefinition>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReactLoadableManifest {
    #[serde(flatten)]
    pub manifest: FxIndexMap<RcStr, ReactLoadableManifestEntry>,
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
    pub pages: FxIndexMap<RcStr, Vec<RcStr>>,
    pub app: FxIndexMap<RcStr, Vec<RcStr>>,
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
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoadableManifest {
    pub id: ModuleId,
    pub files: Vec<RcStr>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ServerReferenceManifest<'a> {
    /// A map from hashed action name to the runtime module we that exports it.
    pub node: FxIndexMap<&'a str, ActionManifestEntry<'a>>,
    /// A map from hashed action name to the runtime module we that exports it.
    pub edge: FxIndexMap<&'a str, ActionManifestEntry<'a>>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActionManifestEntry<'a> {
    /// A mapping from the page that uses the server action to the runtime
    /// module that exports it.
    pub workers: FxIndexMap<&'a str, ActionManifestWorkerEntry<'a>>,

    pub layer: FxIndexMap<&'a str, ActionLayer>,

    #[serde(rename = "exportedName")]
    pub exported_name: &'a str,

    pub filename: &'a str,
}

#[derive(Serialize, Debug)]
pub struct ActionManifestWorkerEntry<'a> {
    #[serde(rename = "moduleId")]
    pub module_id: ActionManifestModuleId<'a>,
    #[serde(rename = "async")]
    pub is_async: bool,
    #[serde(rename = "exportedName")]
    pub exported_name: &'a str,
    pub filename: &'a str,
}

#[derive(Serialize, Debug, Clone)]
#[serde(untagged)]
pub enum ActionManifestModuleId<'a> {
    String(&'a str),
    Number(u64),
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

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;

    use super::*;

    #[test]
    fn test_middleware_matcher_serialization() {
        let matchers = vec![
            ProxyMatcher {
                regexp: None,
                locale: false,
                has: None,
                missing: None,
                original_source: rcstr!(""),
            },
            ProxyMatcher {
                regexp: Some(rcstr!(".*")),
                locale: true,
                has: Some(vec![RouteHas::Query {
                    key: rcstr!("foo"),
                    value: None,
                }]),
                missing: Some(vec![RouteHas::Query {
                    key: rcstr!("bar"),
                    value: Some(rcstr!("value")),
                }]),
                original_source: rcstr!("source"),
            },
        ];

        let serialized = serde_json::to_string(&matchers).unwrap();
        let deserialized: Vec<ProxyMatcher> = serde_json::from_str(&serialized).unwrap();

        assert_eq!(matchers, deserialized);
    }
}
