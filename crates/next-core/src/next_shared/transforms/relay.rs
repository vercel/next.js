use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformPlugin};
use turbopack_ecmascript_plugins::transform::relay::RelayTransformer;

use crate::{
    next_config::NextConfig,
    next_shared::transforms::{EcmascriptTransformStage, get_ecma_transform_rule},
};

/// Returns a transform rule for the relay graphql transform.
pub async fn get_relay_transform_rule(
    next_config: Vc<NextConfig>,
    project_path: FileSystemPath,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();
    if next_config.compiler().await?.relay.is_some() {
        let plugin = relay_transform_plugin(next_config, project_path)
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
async fn relay_transform_plugin(
    next_config: Vc<NextConfig>,
    project_path: FileSystemPath,
) -> Result<Vc<TransformPlugin>> {
    use anyhow::Context as _;
    let compiler = next_config.compiler().await?;
    let config = compiler.relay.as_ref().context("relay config must exist")?;
    Ok(Vc::cell(
        Box::new(RelayTransformer::new(config, &project_path))
            as Box<dyn CustomTransformer + Send + Sync>,
    ))
}
