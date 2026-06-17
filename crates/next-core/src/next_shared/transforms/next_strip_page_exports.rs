use anyhow::Result;
use async_trait::async_trait;
use bincode::{Decode, Encode};
use next_custom_transforms::transforms::strip_page_exports::{
    ExportFilter, next_transform_strip_page_exports,
};
use swc_core::ecma::ast::Program;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect, RuleCondition};
use turbopack_ecmascript::{
    CustomTransformer, EcmascriptInputTransform, TransformContext, TransformPlugin,
};

use super::module_rule_match_js_no_url;

/// A [`TaskInput`]-compatible mirror of [`ExportFilter`].
#[turbo_tasks::task_input]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode)]
enum ExportFilterInput {
    StripDataExports,
    StripDefaultExport,
}

impl From<ExportFilter> for ExportFilterInput {
    fn from(filter: ExportFilter) -> Self {
        match filter {
            ExportFilter::StripDataExports => ExportFilterInput::StripDataExports,
            ExportFilter::StripDefaultExport => ExportFilterInput::StripDefaultExport,
        }
    }
}

impl From<ExportFilterInput> for ExportFilter {
    fn from(filter: ExportFilterInput) -> Self {
        match filter {
            ExportFilterInput::StripDataExports => ExportFilter::StripDataExports,
            ExportFilterInput::StripDefaultExport => ExportFilter::StripDefaultExport,
        }
    }
}

/// Returns a rule which applies the Next.js page export stripping transform.
pub async fn get_next_pages_transforms_rule(
    pages_dir: FileSystemPath,
    export_filter: ExportFilter,
    enable_mdx_rs: bool,
    extra_conditions: Vec<RuleCondition>,
    page_extensions: &[RcStr],
) -> Result<ModuleRule> {
    // Apply the Next SSG transform to all pages.
    let strip_transform = EcmascriptInputTransform::Plugin(
        next_strip_page_exports_transform_plugin(export_filter.into())
            .to_resolved()
            .await?,
    );
    let document_exclusions: Vec<RuleCondition> = page_extensions
        .iter()
        .map(|ext| {
            Ok(RuleCondition::ResourcePathEquals(
                pages_dir.join(&format!("_document.{ext}"))?,
            ))
        })
        .collect::<Result<Vec<_>>>()?;
    let conditions = RuleCondition::all(vec![
        RuleCondition::all(vec![
            RuleCondition::ResourcePathInExactDirectory(pages_dir.clone()),
            RuleCondition::not(RuleCondition::ResourcePathInExactDirectory(
                pages_dir.join("api")?,
            )),
            RuleCondition::not(RuleCondition::any(document_exclusions)),
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

#[turbo_tasks::function]
fn next_strip_page_exports_transform_plugin(
    export_filter: ExportFilterInput,
) -> Vc<TransformPlugin> {
    Vc::cell(Box::new(NextJsStripPageExports {
        export_filter: export_filter.into(),
    }) as Box<dyn CustomTransformer + Send + Sync>)
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
