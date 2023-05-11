use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::util::take::Take,
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbo_binding::{
    swc::custom_transform::modularize_imports::{modularize_imports, PackageConfig},
    turbopack::{
        ecmascript::{
            CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransformsVc,
            TransformContext, TransformPluginVc,
        },
        turbopack::module_options::{ModuleRule, ModuleRuleEffect},
    },
};
use turbo_tasks::trace::TraceRawVcs;

use super::module_rule_match_js_no_url;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct ModularizeImportPackageConfig {
    pub transform: String,
    #[serde(default)]
    pub prevent_full_import: bool,
    #[serde(default)]
    pub skip_default_conversion: bool,
}

/// Returns a rule which applies the Next.js modularize imports transform.
pub fn get_next_modularize_imports_rule(
    modularize_imports_config: &IndexMap<String, ModularizeImportPackageConfig>,
) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(TransformPluginVc::cell(Box::new(
        ModularizeImportsTransformer::new(modularize_imports_config),
    )));
    ModuleRule::new(
        module_rule_match_js_no_url(),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(
            EcmascriptInputTransformsVc::cell(vec![transformer]),
        )],
    )
}

#[derive(Debug)]
struct ModularizeImportsTransformer {
    packages: HashMap<String, PackageConfig>,
}

impl ModularizeImportsTransformer {
    fn new(packages: &IndexMap<String, ModularizeImportPackageConfig>) -> Self {
        Self {
            packages: packages
                .iter()
                .map(|(k, v)| {
                    (
                        k.clone(),
                        PackageConfig {
                            transform: v.transform.clone(),
                            prevent_full_import: v.prevent_full_import,
                            skip_default_conversion: v.skip_default_conversion,
                        },
                    )
                })
                .collect(),
        }
    }
}

#[async_trait]
impl CustomTransformer for ModularizeImportsTransformer {
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut modularize_imports(
            turbo_binding::swc::custom_transform::modularize_imports::Config {
                packages: self.packages.clone(),
            },
        ));

        Ok(())
    }
}
