use anyhow::Result;
use async_trait::async_trait;
use swc_core::ecma::ast::Program;
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::get_ecma_transform_rule;
use crate::{
    next_config::{NextConfig, ReactRemoveProperties},
    next_shared::transforms::EcmascriptTransformStage,
};

turbo_tasks::dual_fn! {
/// Returns a rule which applies the react_remove_properties transform.
pub fn get_react_remove_properties_transform_rule(
    next_config: Vc<NextConfig>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = turbo_tasks::read!(next_config.mdx_rs())?.is_some();

    let has_config = turbo_tasks::read!(next_config
        .compiler())
        ?
        .react_remove_properties
        .as_ref()
        .is_some_and(|config| !matches!(config, ReactRemoveProperties::Boolean(false)));

    if has_config {
        let plugin = turbo_tasks::read!(react_remove_properties_transform_plugin(next_config)
            .to_resolved())
            ?;
        Ok(Some(get_ecma_transform_rule(
            plugin,
            enable_mdx_rs,
            EcmascriptTransformStage::Preprocess,
        )))
    } else {
        Ok(None)
    }
}
}

#[turbo_tasks::function]
async fn react_remove_properties_transform_plugin(
    next_config: Vc<NextConfig>,
) -> Result<Vc<TransformPlugin>> {
    use anyhow::Context as _;
    let config = turbo_tasks::read!(next_config.compiler())?
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
        .context("react_remove_properties config must exist")?;
    Ok(Vc::cell(
        Box::new(ReactRemovePropertiesTransformer { config })
            as Box<dyn CustomTransformer + Send + Sync>,
    ))
}

#[derive(Debug)]
struct ReactRemovePropertiesTransformer {
    config: react_remove_properties::Config,
}

#[cfg(not(feature = "sync"))]
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

#[cfg(feature = "sync")]
impl CustomTransformer for ReactRemovePropertiesTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "react_remove_properties", skip_all)]
    fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(react_remove_properties::react_remove_properties(
            self.config.clone(),
        ));

        Ok(())
    }
}
