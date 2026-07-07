use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::disallow_re_export_all_in_page::disallow_re_export_all_in_page;
use swc_core::ecma::ast::*;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{
    CustomTransformer, EcmascriptInputTransform, TransformContext, TransformPlugin,
};

use super::module_rule_match_pages_page_file;

pub async fn get_next_disallow_export_all_in_page_rule(
    enable_mdx_rs: bool,
    pages_dir: FileSystemPath,
) -> Result<ModuleRule> {
    let transformer = EcmascriptInputTransform::Plugin(
        next_disallow_re_export_all_in_page_transform_plugin()
            .to_resolved()
            .await?,
    );
    Ok(ModuleRule::new(
        module_rule_match_pages_page_file(enable_mdx_rs, pages_dir),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(vec![]),
            main: ResolvedVc::cell(vec![]),
            postprocess: ResolvedVc::cell(vec![transformer]),
        }],
    ))
}

#[turbo_tasks::function]
fn next_disallow_re_export_all_in_page_transform_plugin() -> Vc<TransformPlugin> {
    Vc::cell(Box::new(NextDisallowReExportAllInPage) as Box<dyn CustomTransformer + Send + Sync>)
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
