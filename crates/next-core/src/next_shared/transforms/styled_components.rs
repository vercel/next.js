use anyhow::Result;
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformPlugin};
use turbopack_ecmascript_plugins::transform::styled_components::StyledComponentsTransformer;

use crate::{
    next_config::{NextConfig, StyledComponentsTransformOptionsOrBoolean},
    next_shared::transforms::{EcmascriptTransformStage, get_ecma_transform_rule},
};

pub async fn get_styled_components_transform_rule(
    next_config: Vc<NextConfig>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();

    let has_config = next_config
        .compiler()
        .await?
        .styled_components
        .as_ref()
        .is_some_and(|config| {
            !matches!(
                config,
                StyledComponentsTransformOptionsOrBoolean::Boolean(false)
            )
        });

    if has_config {
        let plugin = styled_components_transform_plugin(next_config)
            .to_resolved()
            .await?;
        Ok(Some(get_ecma_transform_rule(
            plugin,
            enable_mdx_rs,
            EcmascriptTransformStage::Main,
        )))
    } else {
        Ok(None)
    }
}

#[turbo_tasks::function]
async fn styled_components_transform_plugin(
    next_config: Vc<NextConfig>,
) -> Result<Vc<TransformPlugin>> {
    use anyhow::Context as _;
    let compiler = next_config.compiler().await?;
    let transformer = compiler
        .styled_components
        .as_ref()
        .and_then(|config| match config {
            StyledComponentsTransformOptionsOrBoolean::Boolean(true) => {
                Some(StyledComponentsTransformer::new(&Default::default()))
            }
            StyledComponentsTransformOptionsOrBoolean::Options(value) => {
                Some(StyledComponentsTransformer::new(value))
            }
            _ => None,
        })
        .context("styled_components config must exist")?;
    Ok(Vc::cell(
        Box::new(transformer) as Box<dyn CustomTransformer + Send + Sync>
    ))
}
