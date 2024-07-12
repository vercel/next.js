use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::turbopack::{
    ecmascript_plugin::transform::relay::RelayTransformer, turbopack::module_options::ModuleRule,
};

use super::get_ecma_transform_rule;
use crate::next_config::NextConfig;

/// Returns a transform rule for the relay graphql transform.
pub async fn get_relay_transform_rule(
    next_config: Vc<NextConfig>,
    project_path: Vc<FileSystemPath>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();
    let project_path = &*project_path.await?;
    let module_rule = next_config.await?.compiler.as_ref().and_then(|value| {
        value.relay.as_ref().map(|config| {
            get_ecma_transform_rule(
                Box::new(RelayTransformer::new(config, project_path)),
                enable_mdx_rs,
                true,
            )
        })
    });

    Ok(module_rule)
}
