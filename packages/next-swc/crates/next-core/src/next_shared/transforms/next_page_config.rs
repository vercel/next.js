use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::page_config::page_config;
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

pub fn get_next_page_config_rule(enable_mdx_rs: bool, is_page_file: bool) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextPageConfig {
        // [TODO]: update once turbopack build works
        is_development: true,
        is_page_file,
    }) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(Vc::cell(vec![
            transformer,
        ]))],
    )
}

#[derive(Debug)]
struct NextPageConfig {
    is_development: bool,
    is_page_file: bool,
}

#[async_trait]
impl CustomTransformer for NextPageConfig {
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));

        *program = p.fold_with(&mut page_config(self.is_development, self.is_page_file));
        Ok(())
    }
}
