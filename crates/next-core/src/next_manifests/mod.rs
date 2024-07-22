//! Type definitions for the Next.js manifest formats.

pub(crate) mod client_reference_manifest;

use std::collections::HashMap;

use indexmap::IndexSet;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, TaskInput};

use crate::next_config::{CrossOriginConfig, Rewrites};

#[derive(Serialize, Default, Debug)]
pub struct PagesManifest {
    #[serde(flatten)]
    pub pages: HashMap<String, String>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildManifest {
    pub dev_files: Vec<String>,
    pub amp_dev_files: Vec<String>,
    pub polyfill_files: Vec<String>,
    pub low_priority_files: Vec<String>,
    pub root_main_files: Vec<String>,
    pub pages: HashMap<String, Vec<String>>,
    pub amp_first_pages: Vec<String>,
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

#[derive(Serialize, Debug)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum RouteHas {
    Header {
        key: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<String>,
    },
    Cookie {
        key: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<String>,
    },
    Query {
        key: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<String>,
    },
    Host {
        value: String,
    },
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MiddlewareMatcher {
    // When skipped next.js with fill that during merging.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub regexp: Option<String>,
    #[serde(skip_serializing_if = "bool_is_true")]
    pub locale: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has: Option<Vec<RouteHas>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub missing: Option<Vec<RouteHas>>,
    pub original_source: String,
}

fn bool_is_true(b: &bool) -> bool {
    *b
}

#[derive(Serialize, Default, Debug)]
pub struct EdgeFunctionDefinition {
    pub files: Vec<String>,
    pub name: String,
    pub page: String,
    pub matchers: Vec<MiddlewareMatcher>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub wasm: Vec<AssetBinding>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub assets: Vec<AssetBinding>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub regions: Option<Regions>,
}

#[derive(Serialize, Default, Debug)]
pub struct InstrumentationDefinition {
    pub files: Vec<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub wasm: Vec<AssetBinding>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub assets: Vec<AssetBinding>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AssetBinding {
    pub name: String,
    pub file_path: String,
}

#[derive(Serialize, Debug)]
#[serde(untagged)]
pub enum Regions {
    Multiple(Vec<String>),
    Single(String),
}

#[derive(Serialize, Default, Debug)]
pub struct MiddlewaresManifestV2 {
    pub sorted_middleware: Vec<String>,
    pub middleware: HashMap<String, EdgeFunctionDefinition>,
    pub instrumentation: Option<InstrumentationDefinition>,
    pub functions: HashMap<String, EdgeFunctionDefinition>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReactLoadableManifest {
    #[serde(flatten)]
    pub manifest: HashMap<String, ReactLoadableManifestEntry>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReactLoadableManifestEntry {
    pub id: u32,
    pub files: Vec<String>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NextFontManifest {
    pub pages: HashMap<String, Vec<String>>,
    pub app: HashMap<String, Vec<String>>,
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
    pub id: String,
    pub files: Vec<String>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ServerReferenceManifest<'a> {
    /// A map from hashed action name to the runtime module we that exports it.
    pub node: HashMap<&'a str, ActionManifestEntry<'a>>,
    /// A map from hashed action name to the runtime module we that exports it.
    pub edge: HashMap<&'a str, ActionManifestEntry<'a>>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActionManifestEntry<'a> {
    /// A mapping from the page that uses the server action to the runtime
    /// module that exports it.
    pub workers: HashMap<&'a str, ActionManifestWorkerEntry<'a>>,

    pub layer: HashMap<&'a str, ActionLayer>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum ActionManifestWorkerEntry<'a> {
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
)]
#[serde(rename_all = "camelCase")]
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
    pub ssr_module_mapping: HashMap<ModuleId, ManifestNode>,
    /// Same as `ssr_module_mapping`, but for Edge SSR.
    #[serde(rename = "edgeSSRModuleMapping")]
    pub edge_ssr_module_mapping: HashMap<ModuleId, ManifestNode>,
    /// Mapping of server component path to required CSS client chunks.
    #[serde(rename = "entryCSSFiles")]
    pub entry_css_files: HashMap<String, IndexSet<String>>,
    /// Mapping of server component path to required JS client chunks.
    #[serde(rename = "entryJSFiles")]
    pub entry_js_files: HashMap<String, IndexSet<String>>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModuleLoading {
    pub prefix: String,
    pub cross_origin: Option<CrossOriginConfig>,
}

#[derive(Serialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManifestNode {
    /// Mapping of export name to manifest node entry.
    #[serde(flatten)]
    pub module_exports: HashMap<String, ManifestNodeEntry>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManifestNodeEntry {
    /// Turbopack module ID.
    pub id: ModuleId,
    /// Export name.
    pub name: String,
    /// Chunks for the module. JS and CSS.
    pub chunks: Vec<String>,
    // TODO(WEB-434)
    pub r#async: bool,
}

#[derive(Serialize, Debug, Eq, PartialEq, Hash, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum ModuleId {
    String(String),
    Number(u64),
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FontManifest(pub Vec<FontManifestEntry>);

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FontManifestEntry {
    pub url: String,
    pub content: String,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppBuildManifest {
    pub pages: HashMap<String, Vec<String>>,
}

// TODO(alexkirsz) Unify with the one for dev.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClientBuildManifest<'a> {
    #[serde(rename = "__rewrites")]
    pub rewrites: &'a Rewrites,

    pub sorted_pages: &'a [String],

    #[serde(flatten)]
    pub pages: HashMap<String, Vec<&'a str>>,
}
