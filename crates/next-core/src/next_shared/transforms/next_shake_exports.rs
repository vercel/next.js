use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::shake_exports::{shake_exports, Config};
use swc_core::ecma::ast::*;
use turbo_tasks::ResolvedVc;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;

#[allow(dead_code)]
pub fn get_next_shake_exports_rule(enable_mdx_rs: bool, ignore: Vec<String>) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(ResolvedVc::cell(
        Box::new(NextShakeExports { ignore }) as _,
    ));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: ResolvedVc::cell(vec![]),
            append: ResolvedVc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct NextShakeExports {
    ignore: Vec<String>,
}

#[async_trait]
impl CustomTransformer for NextShakeExports {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_shake_exports", skip_all)]
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(shake_exports(Config {
            ignore: self.ignore.iter().map(|s| s.clone().into()).collect(),
        }));
        Ok(())
    }
}
