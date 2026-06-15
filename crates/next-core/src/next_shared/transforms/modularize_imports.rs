use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use bincode::{Decode, Encode};
use modularize_imports::{Config, PackageConfig, modularize_imports};
use serde::{Deserialize, Serialize};
use swc_core::ecma::ast::Program;
use turbo_tasks::{FxIndexMap, NonLocalValue, OperationValue, Vc, trace::TraceRawVcs};
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use crate::{
    next_config::ModularizeImports,
    next_shared::transforms::{EcmascriptTransformStage, get_ecma_transform_rule},
};

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
    Encode,
    Decode,
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
    Encode,
    Decode,
)]
#[serde(untagged)]
pub enum Transform {
    #[default]
    None,
    String(String),
    Vec(Vec<(String, String)>),
}

/// Returns a rule which applies the Next.js modularize imports transform.
pub async fn get_next_modularize_imports_rule(
    modularize_imports_config: Vc<ModularizeImports>,
    enable_mdx_rs: bool,
) -> Result<ModuleRule> {
    let transformer = modularize_imports_transform_plugin(modularize_imports_config)
        .to_resolved()
        .await?;
    Ok(get_ecma_transform_rule(
        transformer,
        enable_mdx_rs,
        EcmascriptTransformStage::Postprocess,
    ))
}

#[turbo_tasks::function]
async fn modularize_imports_transform_plugin(
    config: Vc<ModularizeImports>,
) -> Result<Vc<TransformPlugin>> {
    let config = config.await?;
    Ok(Vc::cell(
        Box::new(ModularizeImportsTransformer::new(&config))
            as Box<dyn CustomTransformer + Send + Sync>,
    ))
}

#[derive(Debug)]
struct ModularizeImportsTransformer {
    config: Config,
}

impl ModularizeImportsTransformer {
    fn new(packages: &FxIndexMap<String, ModularizeImportPackageConfig>) -> Self {
        Self {
            config: Config {
                packages: packages
                    .iter()
                    .map(|(k, v)| {
                        (
                            k.clone(),
                            Arc::new(PackageConfig {
                                transform: match &v.transform {
                                    Transform::String(s) => {
                                        modularize_imports::Transform::String(s.clone())
                                    }
                                    Transform::Vec(v) => {
                                        modularize_imports::Transform::Vec(v.clone())
                                    }
                                    Transform::None => {
                                        panic!("Missing transform value for package {k}")
                                    }
                                },
                                prevent_full_import: v.prevent_full_import,
                                skip_default_conversion: v.skip_default_conversion,
                                handle_default_import: false,
                                handle_namespace_import: false,
                                style: None,
                            }),
                        )
                    })
                    .collect(),
            },
        }
    }
}

#[async_trait]
impl CustomTransformer for ModularizeImportsTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "modularize_imports", skip_all)]
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(modularize_imports(&self.config));

        Ok(())
    }
}
