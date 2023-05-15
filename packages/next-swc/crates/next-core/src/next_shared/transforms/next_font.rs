use anyhow::Result;
use async_trait::async_trait;
use swc_core::ecma::{ast::Program, atoms::JsWord, visit::VisitMutWith};
use turbo_binding::turbopack::{
    ecmascript::{
        CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransformsVc, TransformContext,
        TransformPluginVc,
    },
    turbopack::module_options::{ModuleRule, ModuleRuleEffect},
};

use super::module_rule_match_js_no_url;

/// Returns a rule which applies the Next.js font transform.
pub fn get_next_font_transform_rule() -> ModuleRule {
    let font_loaders = vec![
        "next/font/google".into(),
        "@next/font/google".into(),
        "next/font/local".into(),
        "@next/font/local".into(),
    ];

    let transformer =
        EcmascriptInputTransform::Plugin(TransformPluginVc::cell(box NextJsFont { font_loaders }));
    ModuleRule::new(
        // TODO: Only match in pages (not pages/api), app/, etc.
        module_rule_match_js_no_url(),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(
            EcmascriptInputTransformsVc::cell(vec![transformer]),
        )],
    )
}

#[derive(Debug)]
struct NextJsFont {
    font_loaders: Vec<JsWord>,
}

#[async_trait]
impl CustomTransformer for NextJsFont {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let mut next_font = next_transform_font::next_font_loaders(next_transform_font::Config {
            font_loaders: self.font_loaders.clone(),
            relative_file_path_from_root: ctx.file_name_str.into(),
        });

        program.visit_mut_with(&mut next_font);
        Ok(())
    }
}
