use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::strip_page_exports::{
    next_transform_strip_page_exports, ExportFilter,
};
use swc_core::{
    common::util::take::Take,
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::{
        ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
        turbopack::module_options::{ModuleRule, ModuleRuleCondition, ModuleRuleEffect},
    },
};

use super::module_rule_match_js_no_url;

/// Returns a rule which applies the Next.js page export stripping transform.
pub async fn get_next_pages_transforms_rule(
    pages_dir: Vc<FileSystemPath>,
    export_filter: ExportFilter,
    enable_mdx_rs: bool,
) -> Result<ModuleRule> {
    // Apply the Next SSG transform to all pages.
    let strip_transform = EcmascriptInputTransform::Plugin(Vc::cell(Box::new(
        NextJsStripPageExports { export_filter },
    ) as _));
    Ok(ModuleRule::new(
        ModuleRuleCondition::all(vec![
            ModuleRuleCondition::all(vec![
                ModuleRuleCondition::ResourcePathInExactDirectory(pages_dir.await?),
                ModuleRuleCondition::not(ModuleRuleCondition::ResourcePathInExactDirectory(
                    pages_dir.join("api".to_string()).await?,
                )),
                ModuleRuleCondition::not(ModuleRuleCondition::any(vec![
                    // TODO(alexkirsz): Possibly ignore _app as well?
                    ModuleRuleCondition::ResourcePathEquals(
                        pages_dir.join("_document.js".to_string()).await?,
                    ),
                    ModuleRuleCondition::ResourcePathEquals(
                        pages_dir.join("_document.jsx".to_string()).await?,
                    ),
                    ModuleRuleCondition::ResourcePathEquals(
                        pages_dir.join("_document.ts".to_string()).await?,
                    ),
                    ModuleRuleCondition::ResourcePathEquals(
                        pages_dir.join("_document.tsx".to_string()).await?,
                    ),
                ])),
            ]),
            module_rule_match_js_no_url(enable_mdx_rs),
        ]),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(Vc::cell(vec![
            strip_transform,
        ]))],
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
