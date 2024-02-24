use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::disallow_re_export_all_in_page::disallow_re_export_all_in_page;
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

pub fn get_next_disallow_export_all_in_page_rule(
    enable_mdx_rs: bool,
    pages_dir: ReadRef<FileSystemPath>,
) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextDisallowReExportAllInPage) as _));
    ModuleRule::new(
        module_rule_match_pages_page_file(enable_mdx_rs, pages_dir),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: Vc::cell(vec![]),
            append: Vc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct NextDisallowReExportAllInPage;

#[async_trait]
impl CustomTransformer for NextDisallowReExportAllInPage {
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut disallow_re_export_all_in_page(true));
        Ok(())
    }
}
