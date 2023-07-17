//! Type definitions for the Next.js manifest formats.

use std::collections::HashMap;

use next_core::next_config::Rewrites;
use serde::Serialize;

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

#[derive(Serialize, Default, Debug)]
pub struct MiddlewaresManifestV2 {
    pub sorted_middleware: Vec<()>,
    pub middleware: HashMap<String, ()>,
    pub functions: HashMap<String, ()>,
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

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ServerReferenceManifest {
    #[serde(flatten)]
    pub server_actions: ActionManifest,
    #[serde(flatten)]
    pub edge_server_actions: ActionManifest,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActionManifest {
    #[serde(flatten)]
    pub actions: HashMap<String, ActionManifestEntry>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActionManifestEntry {
    pub workers: HashMap<String, ActionManifestWorkerEntry>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum ActionManifestWorkerEntry {
    String(String),
    Number(f64),
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClientReferenceManifest {
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
    pub entry_css_files: HashMap<String, Vec<String>>,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ManifestNode {
    /// Mapping of export name to manifest node entry.
    #[serde(flatten)]
    pub module_exports: HashMap<String, ManifestNodeEntry>,
}

#[derive(Serialize, Debug)]
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

#[derive(Serialize, Debug, Eq, PartialEq, Hash)]
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
