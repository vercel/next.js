use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;
use modularize_imports::{modularize_imports, Config, PackageConfig};
use serde::{Deserialize, Serialize};
use swc_core::ecma::ast::Program;
use turbo_tasks::{trace::TraceRawVcs, FxIndexMap, NonLocalValue};
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
#[serde(rename_all = "camelCase")]
pub struct ModularizeImportPackageConfig {
    pub transform: String,
    #[serde(default)]
    pub prevent_full_import: bool,
    #[serde(default)]
    pub skip_default_conversion: bool,
}

#[derive(Debug)]
pub struct ModularizeImportsTransformer {
    packages: HashMap<String, PackageConfig>,
}

impl ModularizeImportsTransformer {
    pub fn new(packages: &FxIndexMap<String, ModularizeImportPackageConfig>) -> Self {
        Self {
            packages: packages
                .iter()
                .map(|(k, v)| {
                    (
                        k.clone(),
                        PackageConfig {
                            transform: modularize_imports::Transform::String(v.transform.clone()),
                            prevent_full_import: v.prevent_full_import,
                            skip_default_conversion: v.skip_default_conversion,
                            handle_default_import: false,
                            handle_namespace_import: false,
                        },
                    )
                })
                .collect(),
        }
    }
}

#[async_trait]
impl CustomTransformer for ModularizeImportsTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "modularize_imports", skip_all)]
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(modularize_imports(Config {
            packages: self.packages.clone(),
        }));

        Ok(())
    }
}
