use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;
use modularize_imports::{modularize_imports, PackageConfig};
use serde::{Deserialize, Serialize};
use swc_core::ecma::ast::Program;
use turbo_tasks::{trace::TraceRawVcs, FxIndexMap, NonLocalValue, OperationValue, ResolvedVc};
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct ModularizeImportPackageConfig {
    pub transform: Transform,
    #[serde(default)]
    pub prevent_full_import: bool,
    #[serde(default)]
    pub skip_default_conversion: bool,
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum Transform {
    #[default]
    None,
    String(String),
    Vec(Vec<(String, String)>),
}

/// Returns a rule which applies the Next.js modularize imports transform.
pub fn get_next_modularize_imports_rule(
    modularize_imports_config: &FxIndexMap<String, ModularizeImportPackageConfig>,
    enable_mdx_rs: bool,
) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(
        ModularizeImportsTransformer::new(modularize_imports_config),
    ) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: ResolvedVc::cell(vec![]),
            append: ResolvedVc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct ModularizeImportsTransformer {
    packages: HashMap<String, PackageConfig>,
}

impl ModularizeImportsTransformer {
    fn new(packages: &FxIndexMap<String, ModularizeImportPackageConfig>) -> Self {
        Self {
            packages: packages
                .iter()
                .map(|(k, v)| {
                    (
                        k.clone(),
                        PackageConfig {
                            transform: match &v.transform {
                                Transform::String(s) => {
                                    modularize_imports::Transform::String(s.clone())
                                }
                                Transform::Vec(v) => modularize_imports::Transform::Vec(v.clone()),
                                Transform::None => {
                                    panic!("Missing transform value for package {}", k)
                                }
                            },
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
        program.mutate(modularize_imports(modularize_imports::Config {
            packages: self.packages.clone(),
        }));

        Ok(())
    }
}
