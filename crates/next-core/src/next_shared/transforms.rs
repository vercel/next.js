use anyhow::Result;
use turbo_tasks::Value;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::module_options::{
    ModuleOptionsContextVc, ModuleRule, ModuleRuleCondition, ModuleRuleEffect,
};
use turbopack_ecmascript::{
    EcmascriptInputTransform, EcmascriptInputTransformsVc, NextJsPageExportFilter,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Copy, Clone, Hash, PartialOrd, Ord)]
pub enum PageTransformType {
    Client,
    SsrData,
}

#[turbo_tasks::function]
pub async fn add_next_transforms_to_pages(
    module_options_context: ModuleOptionsContextVc,
    pages_dir: FileSystemPathVc,
    transform_ty: Value<PageTransformType>,
) -> Result<ModuleOptionsContextVc> {
    let page_transform = match transform_ty.into_value() {
        PageTransformType::Client => EcmascriptInputTransform::NextJsStripPageExports(
            NextJsPageExportFilter::StripDataExports,
        ),
        PageTransformType::SsrData => EcmascriptInputTransform::NextJsStripPageExports(
            NextJsPageExportFilter::StripDefaultExport,
        ),
    };
    let mut module_options_context = module_options_context.await?.clone_value();
    // Apply the Next SSG tranform to all pages.
    module_options_context.custom_rules.push(ModuleRule::new(
        ModuleRuleCondition::all(vec![
            ModuleRuleCondition::all(vec![
                ModuleRuleCondition::ResourcePathInExactDirectory(pages_dir.await?),
                ModuleRuleCondition::not(ModuleRuleCondition::any(vec![
                    // TODO(alexkirsz): Possibly ignore _app as well?
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.js").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.jsx").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.ts").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.tsx").await?),
                ])),
            ]),
            ModuleRuleCondition::any(vec![
                ModuleRuleCondition::ResourcePathEndsWith(".js".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".jsx".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".ts".to_string()),
                ModuleRuleCondition::ResourcePathEndsWith(".tsx".to_string()),
            ]),
        ]),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(
            EcmascriptInputTransformsVc::cell(vec![page_transform]),
        )],
    ));
    Ok(module_options_context.cell())
}
