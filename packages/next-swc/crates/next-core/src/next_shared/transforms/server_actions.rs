use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::server_actions::{server_actions, Config};
use swc_core::{
    common::FileName,
    ecma::{ast::Program, visit::VisitMutWith},
};
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
    turbopack::module_options::{ModuleRule, ModuleRuleEffect},
};

use super::module_rule_match_js_no_url;

#[derive(Debug)]
pub enum ActionsTransform {
    Client,
    Server,
}

/// Returns a rule which applies the Next.js Server Actions transform.
pub fn get_server_actions_transform_rule(
    transform: ActionsTransform,
    enable_mdx_rs: bool,
) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextServerActions { transform }) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(Vc::cell(vec![
            transformer,
        ]))],
    )
}

#[derive(Debug)]
struct NextServerActions {
    transform: ActionsTransform,
}

#[async_trait]
impl CustomTransformer for NextServerActions {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let mut actions = server_actions(
            &FileName::Real(ctx.file_path_str.into()),
            Config {
                is_react_server_layer: matches!(self.transform, ActionsTransform::Server),
                enabled: true,
            },
            ctx.comments.clone(),
        );

        program.visit_mut_with(&mut actions);
        Ok(())
    }
}
