use std::path::PathBuf;

use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::react_server_components::*;
use swc_core::{
    common::{util::take::Take, FileName},
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
    turbopack::module_options::{ModuleRule, ModuleRuleEffect},
};

use super::module_rule_match_js_no_url;

/// Returns a rule which applies the Next.js react server components transform.
pub fn get_next_react_server_components_transform_rule(
    is_react_server_layer: bool,
    enable_mdx_rs: bool,
) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextJsReactServerComponents {
            is_react_server_layer,
        }) as _));

    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(Vc::cell(vec![
            transformer,
        ]))],
    )
}

#[derive(Debug)]
struct NextJsReactServerComponents {
    is_react_server_layer: bool,
}

#[async_trait]
impl CustomTransformer for NextJsReactServerComponents {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));

        let mut visitor = server_components(
            FileName::Custom(ctx.file_path_str.to_string()),
            Config::WithOptions(Options {
                is_react_server_layer: self.is_react_server_layer,
            }),
            ctx.comments,
            Some(PathBuf::from(ctx.file_path.parent().await?.path.clone())),
        );

        *program = p.fold_with(&mut visitor);

        Ok(())
    }
}
