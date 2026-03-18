use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::optimize_server_react::{Config, optimize_server_react};
use swc_core::ecma::ast::*;
use turbo_tasks::ResolvedVc;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;

#[allow(dead_code)]
pub fn get_next_optimize_server_react_rule(
    enable_mdx_rs: bool,
    optimize_use_state: bool,
) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(NextOptimizeServerReact {
            optimize_use_state,
        }) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(vec![]),
            main: ResolvedVc::cell(vec![]),
            postprocess: ResolvedVc::cell(vec![transformer]),
        }],
    )
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
