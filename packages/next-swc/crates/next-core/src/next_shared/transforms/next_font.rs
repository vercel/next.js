use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::fonts::*;
use turbo_tasks::Vc;
use turbopack_binding::{
    swc::core::ecma::{ast::Program, atoms::JsWord, visit::VisitMutWith},
    turbopack::{
        ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
        turbopack::module_options::{ModuleRule, ModuleRuleEffect},
    },
};

use super::module_rule_match_js_no_url;

/// Returns a rule which applies the Next.js font transform.
pub fn get_next_font_transform_rule(enable_mdx_rs: bool) -> ModuleRule {
    let font_loaders = vec![
        "next/font/google".into(),
        "@next/font/google".into(),
        "next/font/local".into(),
        "@next/font/local".into(),
    ];

    let transformer =
        EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextJsFont { font_loaders }) as _));
    ModuleRule::new(
        // TODO: Only match in pages (not pages/api), app/, etc.
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: Vc::cell(vec![]),
            append: Vc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct NextJsFont {
    font_loaders: Vec<JsWord>,
}

#[async_trait]
impl CustomTransformer for NextJsFont {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let mut next_font = next_font_loaders(Config {
            font_loaders: self.font_loaders.clone(),
            relative_file_path_from_root: ctx.file_name_str.into(),
        });

        program.visit_mut_with(&mut next_font);
        Ok(())
    }
}
