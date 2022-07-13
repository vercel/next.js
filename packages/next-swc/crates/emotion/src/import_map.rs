use serde::{Deserialize, Serialize};
use swc_atoms::JsWord;
use swc_common::collections::AHashMap;

use crate::EmotionModuleConfig;

/// key: `importSource`
pub type ImportMap = AHashMap<JsWord, ImportMapValue>;

/// key: `localExportName`
pub type ImportMapValue = AHashMap<JsWord, Config>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    canonical_import: ImportItem,
}

/// `(packageName, exportName)`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ImportItem(JsWord, JsWord);

pub(crate) fn expand_import_map(
    map: Option<&ImportMap>,
    mut imports: Vec<EmotionModuleConfig>,
) -> Vec<EmotionModuleConfig> {
    if let Some(map) = map {
        map.iter().for_each(|(import_source, value)| {
            value
                .iter()
                .for_each(|(local_export_name, Config { canonical_import })| {
                    let ImportItem(package_name, export_name) = canonical_import;

                    if &*package_name == "@emotion/react" && &*export_name == "jsx" {
                        return;
                    }

                    let package_transformers = imports
                        .iter()
                        .find(|v| v.module_name == *package_name)
                        .unwrap_or_else(|| {
                            panic!(
                                "There is no transformer for the export '{}' in '{}'",
                                export_name, package_name
                            )
                        })
                        .clone();

                    if &*package_name == "@emotion/react" && export_name == "Global" {
                    } else if &*package_name == "@emotion/styled" && export_name == "default" {
                    }

                    let exports = package_transformers
                        .exported_names
                        .iter()
                        .filter(|v| v.name == &**export_name)
                        .cloned()
                        .collect::<Vec<_>>();

                    imports.push(EmotionModuleConfig {
                        module_name: import_source.clone(),
                        exported_names: exports,
                        default_export: package_transformers.default_export,
                    });
                })
        });
    }

    imports
}
