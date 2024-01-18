use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::page_config::page_config;
use turbo_tasks::{ReadRef, Vc};
use turbo_tasks_fs::FileSystemPath;
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

use super::module_rule_match_pages_page_file;

pub fn get_next_page_config_rule(
    enable_mdx_rs: bool,
    pages_dir: ReadRef<FileSystemPath>,
) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextPageConfig {
        // [TODO]: update once turbopack build works
        is_development: true,
    }) as _));
    ModuleRule::new(
        module_rule_match_pages_page_file(enable_mdx_rs, pages_dir),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(Vc::cell(vec![
            transformer,
        ]))],
    )
}

#[derive(Debug)]
struct NextPageConfig {
    is_development: bool,
}

#[async_trait]
impl CustomTransformer for NextPageConfig {
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));

        *program = p.fold_with(&mut page_config(self.is_development, true));
        Ok(())
    }
}
