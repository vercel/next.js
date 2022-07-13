use serde::Deserialize;
use swc_atoms::JsWord;
use swc_common::collections::AHashMap;

/// key: `importSource`
pub(crate) type ImportMap = AHashMap<String, ImportMapValue>;

/// key: `localExportName`
pub(crate) type ImportMapValue = AHashMap<String, Config>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Config {
    canonical_import: ImportItem,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ImportItem(JsWord, JsWord);
