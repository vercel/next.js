use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::strip_page_exports::{
    next_transform_strip_page_exports, ExportFilter,
};
use swc_core::ecma::ast::Program;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect, RuleCondition};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;

/// Returns a rule which applies the Next.js page export stripping transform.
pub async fn get_next_pages_transforms_rule(
    pages_dir: Vc<FileSystemPath>,
    export_filter: ExportFilter,
    enable_mdx_rs: bool,
) -> Result<ModuleRule> {
    // Apply the Next SSG transform to all pages.
    let strip_transform =
        EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(NextJsStripPageExports {
            export_filter,
        }) as _));
    Ok(ModuleRule::new(
        RuleCondition::all(vec![
            RuleCondition::all(vec![
                RuleCondition::ResourcePathInExactDirectory(pages_dir.await?),
                RuleCondition::not(RuleCondition::ResourcePathInExactDirectory(
                    pages_dir.join("api".into()).await?,
                )),
                RuleCondition::not(RuleCondition::any(vec![
                    // TODO(alexkirsz): Possibly ignore _app as well?
                    RuleCondition::ResourcePathEquals(pages_dir.join("_document.js".into()).await?),
                    RuleCondition::ResourcePathEquals(
                        pages_dir.join("_document.jsx".into()).await?,
                    ),
                    RuleCondition::ResourcePathEquals(pages_dir.join("_document.ts".into()).await?),
                    RuleCondition::ResourcePathEquals(
                        pages_dir.join("_document.tsx".into()).await?,
                    ),
                ])),
            ]),
            module_rule_match_js_no_url(enable_mdx_rs),
        ]),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: ResolvedVc::cell(vec![]),
            append: ResolvedVc::cell(vec![strip_transform]),
        }],
    ))
}

#[derive(Debug)]
struct NextJsStripPageExports {
    export_filter: ExportFilter,
}

#[async_trait]
impl CustomTransformer for NextJsStripPageExports {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_strip_page_exports", skip_all)]
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        // TODO(alexkirsz) Connect the eliminated_packages to telemetry.
        let eliminated_packages = Default::default();
        program.mutate(next_transform_strip_page_exports(
            self.export_filter,
            eliminated_packages,
        ));

        Ok(())
    }
}
