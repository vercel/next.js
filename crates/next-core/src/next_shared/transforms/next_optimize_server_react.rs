use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::optimize_server_react::{Config, optimize_server_react};
use swc_core::ecma::ast::*;
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::{EcmascriptTransformStage, get_ecma_transform_rule};

#[allow(dead_code)]
pub async fn get_next_optimize_server_react_rule(
    enable_mdx_rs: bool,
    optimize_use_state: bool,
) -> Result<ModuleRule> {
    let transformer = next_optimize_server_react_transform_plugin(optimize_use_state)
        .to_resolved()
        .await?;
    Ok(get_ecma_transform_rule(
        transformer,
        enable_mdx_rs,
        EcmascriptTransformStage::Postprocess,
    ))
}

#[turbo_tasks::function]
fn next_optimize_server_react_transform_plugin(optimize_use_state: bool) -> Vc<TransformPlugin> {
    Vc::cell(Box::new(NextOptimizeServerReact { optimize_use_state })
        as Box<dyn CustomTransformer + Send + Sync>)
}

#[derive(Debug)]
struct NextOptimizeServerReact {
    optimize_use_state: bool,
}

#[async_trait]
impl CustomTransformer for NextOptimizeServerReact {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_optimize_server_react", skip_all)]
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(optimize_server_react(Config {
            optimize_use_state: self.optimize_use_state,
        }));
        Ok(())
    }
}
