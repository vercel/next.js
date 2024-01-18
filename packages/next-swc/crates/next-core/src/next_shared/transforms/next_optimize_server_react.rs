use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::optimize_server_react::{optimize_server_react, Config};
use turbo_tasks::Vc;
use turbopack_binding::{
    swc::core::{
        common::util::take::Take,
        ecma::{ast::*, visit::FoldWith},
    },
    turbopack::{
        ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
        turbopack::module_options::{ModuleRule, ModuleRuleEffect},
    },
};

use super::module_rule_match_js_no_url;

#[allow(dead_code)]
pub fn get_next_optimize_server_react_rule(
    enable_mdx_rs: bool,
    optimize_use_state: bool,
) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextOptimizeServerReact {
            optimize_use_state,
        }) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(Vc::cell(vec![
            transformer,
        ]))],
    )
}

#[derive(Debug)]
struct NextOptimizeServerReact {
    optimize_use_state: bool,
}

#[async_trait]
impl CustomTransformer for NextOptimizeServerReact {
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));

        *program = p.fold_with(&mut optimize_server_react(Config {
            optimize_use_state: self.optimize_use_state,
        }));
        Ok(())
    }
}
