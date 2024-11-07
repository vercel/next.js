use anyhow::Result;
use async_trait::async_trait;
use swc_core::ecma::ast::Program;
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext};

use super::get_ecma_transform_rule;
use crate::next_config::{NextConfig, ReactRemoveProperties};

/// Returns a rule which applies the react_remove_properties transform.
pub async fn get_react_remove_properties_transform_rule(
    next_config: Vc<NextConfig>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();

    let module_rule = next_config
        .compiler()
        .await?
        .react_remove_properties
        .as_ref()
        .and_then(|config| match config {
            ReactRemoveProperties::Boolean(false) => None,
            ReactRemoveProperties::Boolean(true) => {
                Some(react_remove_properties::Config::All(true))
            }
            ReactRemoveProperties::Config { properties } => Some(
                react_remove_properties::Config::WithOptions(react_remove_properties::Options {
                    properties: properties.as_deref().unwrap_or_default().to_owned(),
                }),
            ),
        })
        .map(|config| {
            get_ecma_transform_rule(
                Box::new(ReactRemovePropertiesTransformer { config }),
                enable_mdx_rs,
                true,
            )
        });

    Ok(module_rule)
}

#[derive(Debug)]
struct ReactRemovePropertiesTransformer {
    config: react_remove_properties::Config,
}

#[async_trait]
impl CustomTransformer for ReactRemovePropertiesTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "react_remove_properties", skip_all)]
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(react_remove_properties::react_remove_properties(
            self.config.clone(),
        ));

        Ok(())
    }
}
