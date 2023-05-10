use anyhow::Result;
use async_trait::async_trait;
use next_transform_strip_page_exports::{next_transform_strip_page_exports, ExportFilter};
use swc_core::{
    common::util::take::Take,
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbo_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::{
        ecmascript::{
            CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransformsVc,
            TransformContext, TransformPluginVc,
        },
        turbopack::module_options::{ModuleRule, ModuleRuleCondition, ModuleRuleEffect},
    },
};

use super::module_rule_match_js_no_url;

/// Returns a rule which applies the Next.js page export stripping transform.
pub async fn get_next_pages_transforms_rule(
    pages_dir: FileSystemPathVc,
    export_filter: ExportFilter,
) -> Result<ModuleRule> {
    // Apply the Next SSG transform to all pages.
    let strip_transform =
        EcmascriptInputTransform::Plugin(TransformPluginVc::cell(box NextJsStripPageExports {
            export_filter,
        }));
    Ok(ModuleRule::new(
        ModuleRuleCondition::all(vec![
            ModuleRuleCondition::all(vec![
                ModuleRuleCondition::ResourcePathInExactDirectory(pages_dir.await?),
                ModuleRuleCondition::not(ModuleRuleCondition::ResourcePathInExactDirectory(
                    pages_dir.join("api").await?,
                )),
                ModuleRuleCondition::not(ModuleRuleCondition::any(vec![
                    // TODO(alexkirsz): Possibly ignore _app as well?
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.js").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.jsx").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.ts").await?),
                    ModuleRuleCondition::ResourcePathEquals(pages_dir.join("_document.tsx").await?),
                ])),
            ]),
            module_rule_match_js_no_url(),
        ]),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(
            EcmascriptInputTransformsVc::cell(vec![strip_transform]),
        )],
    ))
}

#[derive(Debug)]
struct NextJsStripPageExports {
    export_filter: ExportFilter,
}

#[async_trait]
impl CustomTransformer for NextJsStripPageExports {
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        // TODO(alexkirsz) Connect the eliminated_packages to telemetry.
        let eliminated_packages = Default::default();

        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut next_transform_strip_page_exports(
            self.export_filter,
            eliminated_packages,
        ));

        Ok(())
    }
}
