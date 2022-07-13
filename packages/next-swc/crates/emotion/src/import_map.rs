use serde::{Deserialize, Serialize};
use swc_atoms::JsWord;
use swc_common::collections::AHashMap;

use crate::EmotionModuleConfig;

/// key: `importSource`
pub type ImportMap = AHashMap<String, ImportMapValue>;

/// key: `localExportName`
pub type ImportMapValue = AHashMap<String, Config>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    canonical_import: ImportItem,
}

/// `(packageName, exportName)`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ImportItem(JsWord, JsWord);

pub(crate) fn expand_import_map(
    map: ImportMap,
    imports: Vec<EmotionModuleConfig>,
) -> Vec<EmotionModuleConfig> {
    imports
}
