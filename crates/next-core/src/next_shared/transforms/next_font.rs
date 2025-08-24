use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::fonts::*;
use swc_core::{
    atoms::atom,
    ecma::{ast::Program, atoms::Atom, visit::VisitMutWith},
};
use turbo_tasks::ResolvedVc;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;

/// Returns a rule which applies the Next.js font transform.
pub fn get_next_font_transform_rule(enable_mdx_rs: bool) -> ModuleRule {
    let font_loaders = vec![
        atom!("next/font/google"),
        atom!("@next/font/google"),
        atom!("next/font/local"),
        atom!("@next/font/local"),
    ];

    let transformer =
        EcmascriptInputTransform::Plugin(ResolvedVc::cell(
            Box::new(NextJsFont { font_loaders }) as _
        ));
    ModuleRule::new(
        // TODO: Only match in pages (not pages/api), app/, etc.
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(vec![]),
            main: ResolvedVc::cell(vec![]),
            postprocess: ResolvedVc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct NextJsFont {
    font_loaders: Vec<Atom>,
}

#[async_trait]
impl CustomTransformer for NextJsFont {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_font", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let mut next_font = next_font_loaders(Config {
            font_loaders: self.font_loaders.clone(),
            relative_file_path_from_root: ctx.file_name_str.into(),
        });

        program.visit_mut_with(&mut next_font);
        Ok(())
    }
}
