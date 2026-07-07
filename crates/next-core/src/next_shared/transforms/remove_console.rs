use anyhow::Result;
use async_trait::async_trait;
use swc_core::{common::SyntaxContext, ecma::ast::Program};
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::get_ecma_transform_rule;
use crate::{
    next_config::{NextConfig, RemoveConsoleConfig},
    next_shared::transforms::EcmascriptTransformStage,
};

/// Returns a rule which applies the remove_console transform.
pub async fn get_remove_console_transform_rule(
    next_config: Vc<NextConfig>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();

    let has_config = next_config
        .compiler()
        .await?
        .remove_console
        .as_ref()
        .is_some_and(|config| !matches!(config, RemoveConsoleConfig::Boolean(false)));

    if has_config {
        let plugin = remove_console_transform_plugin(next_config)
            .to_resolved()
            .await?;
        Ok(Some(get_ecma_transform_rule(
            plugin,
            enable_mdx_rs,
            EcmascriptTransformStage::Preprocess,
        )))
    } else {
        Ok(None)
    }
}

#[turbo_tasks::function]
async fn remove_console_transform_plugin(
    next_config: Vc<NextConfig>,
) -> Result<Vc<TransformPlugin>> {
    use anyhow::Context as _;
    let config = next_config
        .compiler()
        .await?
        .remove_console
        .as_ref()
        .and_then(|config| match config {
            RemoveConsoleConfig::Boolean(false) => None,
            RemoveConsoleConfig::Boolean(true) => Some(remove_console::Config::All(true)),
            RemoveConsoleConfig::Config { exclude } => Some(remove_console::Config::WithOptions(
                remove_console::Options {
                    exclude: exclude
                        .as_deref()
                        .unwrap_or_default()
                        .iter()
                        .map(|v| v.clone().into())
                        .collect(),
                },
            )),
        })
        .context("remove_console config must exist")?;
    Ok(Vc::cell(
        Box::new(RemoveConsoleTransformer { config }) as Box<dyn CustomTransformer + Send + Sync>
    ))
}

#[derive(Debug)]
struct RemoveConsoleTransformer {
    config: remove_console::Config,
}

#[async_trait]
impl CustomTransformer for RemoveConsoleTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "remove_console", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(remove_console::remove_console(
            self.config.clone(),
            SyntaxContext::empty().apply_mark(ctx.unresolved_mark),
        ));

        Ok(())
    }
}
