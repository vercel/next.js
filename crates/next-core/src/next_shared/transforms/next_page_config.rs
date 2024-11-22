use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::page_config::page_config;
use swc_core::ecma::ast::*;
use turbo_tasks::{ReadRef, ResolvedVc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_pages_page_file;

pub fn get_next_page_config_rule(
    enable_mdx_rs: bool,
    pages_dir: ReadRef<FileSystemPath>,
) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(NextPageConfig {
        // [TODO]: update once turbopack build works
        is_development: true,
    }) as _));
    ModuleRule::new(
        module_rule_match_pages_page_file(enable_mdx_rs, pages_dir),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: ResolvedVc::cell(vec![]),
            append: ResolvedVc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct NextPageConfig {
    is_development: bool,
}

#[async_trait]
impl CustomTransformer for NextPageConfig {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_page_config", skip_all)]
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(page_config(self.is_development, true));
        Ok(())
    }
}
