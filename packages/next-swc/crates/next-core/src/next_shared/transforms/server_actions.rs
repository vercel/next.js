use anyhow::Result;
use async_trait::async_trait;
use next_swc::server_actions::{server_actions, Config};
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

/// Returns a rule which applies the Next.js Server Actions transform.
pub fn get_server_actions_transform_rule(is_server: bool) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextServerActions { is_server }) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(Vc::cell(vec![
            transformer,
        ]))],
    )
}

#[derive(Debug)]
struct NextServerActions {
    is_server: bool,
}

#[async_trait]
impl CustomTransformer for NextServerActions {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let mut actions = server_actions(
            &FileName::Real(ctx.file_path_str.into()),
            Config {
                is_server: self.is_server,
                enabled: true,
            },
            ctx.comments.clone(),
        );

        program.visit_mut_with(&mut actions);
        Ok(())
    }
}
