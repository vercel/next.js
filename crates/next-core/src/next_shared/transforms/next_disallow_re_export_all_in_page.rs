use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::disallow_re_export_all_in_page::disallow_re_export_all_in_page;
use swc_core::ecma::ast::*;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_pages_page_file;

pub fn get_next_disallow_export_all_in_page_rule(
    enable_mdx_rs: bool,
    pages_dir: FileSystemPath,
) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(
        NextDisallowReExportAllInPage,
    ) as _));
    ModuleRule::new(
        module_rule_match_pages_page_file(enable_mdx_rs, pages_dir),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(vec![]),
            main: ResolvedVc::cell(vec![]),
            postprocess: ResolvedVc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct NextDisallowReExportAllInPage;

#[async_trait]
impl CustomTransformer for NextDisallowReExportAllInPage {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_disallow_reexport_all", skip_all)]
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(disallow_re_export_all_in_page(true));
        Ok(())
    }
}
