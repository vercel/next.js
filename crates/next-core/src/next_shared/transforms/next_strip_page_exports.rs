use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::strip_page_exports::{
    ExportFilter, next_transform_strip_page_exports,
};
use swc_core::ecma::ast::Program;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect, RuleCondition};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;

/// Returns a rule which applies the Next.js page export stripping transform.
pub fn get_next_pages_transforms_rule(
    pages_dir: FileSystemPath,
    export_filter: ExportFilter,
    enable_mdx_rs: bool,
    extra_conditions: Vec<RuleCondition>,
) -> Result<ModuleRule> {
    // Apply the Next SSG transform to all pages.
    let strip_transform =
        EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(NextJsStripPageExports {
            export_filter,
        }) as _));
    let conditions = RuleCondition::all(vec![
        RuleCondition::all(vec![
            RuleCondition::ResourcePathInExactDirectory(pages_dir.clone()),
            RuleCondition::not(RuleCondition::ResourcePathInExactDirectory(
                pages_dir.join("api")?,
            )),
            RuleCondition::not(RuleCondition::any(vec![
                // TODO(alexkirsz): Possibly ignore _app as well?
                RuleCondition::ResourcePathEquals(pages_dir.join("_document.js")?),
                RuleCondition::ResourcePathEquals(pages_dir.join("_document.jsx")?),
                RuleCondition::ResourcePathEquals(pages_dir.join("_document.ts")?),
                RuleCondition::ResourcePathEquals(pages_dir.join("_document.tsx")?),
            ])),
        ]),
        module_rule_match_js_no_url(enable_mdx_rs),
        RuleCondition::all(extra_conditions),
    ]);
    Ok(ModuleRule::new(
        conditions,
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(vec![]),
            main: ResolvedVc::cell(vec![]),
            postprocess: ResolvedVc::cell(vec![strip_transform]),
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
