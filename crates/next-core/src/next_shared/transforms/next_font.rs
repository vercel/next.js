use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::fonts::*;
use swc_core::{
    atoms::{Wtf8Atom, atom},
    ecma::{ast::Program, visit::VisitMutWith},
};
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::{EcmascriptTransformStage, get_ecma_transform_rule};

/// Returns a rule which applies the Next.js font transform.
pub async fn get_next_font_transform_rule(enable_mdx_rs: bool) -> Result<ModuleRule> {
    let transformer = next_font_transform_plugin().to_resolved().await?;
    // TODO: Only match in pages (not pages/api), app/, etc.
    Ok(get_ecma_transform_rule(
        transformer,
        enable_mdx_rs,
        EcmascriptTransformStage::Postprocess,
    ))
}

#[turbo_tasks::function]
fn next_font_transform_plugin() -> Vc<TransformPlugin> {
    let font_loaders = vec![
        atom!("next/font/google").into(),
        atom!("@next/font/google").into(),
        atom!("next/font/local").into(),
        atom!("@next/font/local").into(),
    ];
    Vc::cell(Box::new(NextJsFont { font_loaders }) as Box<dyn CustomTransformer + Send + Sync>)
}

#[derive(Debug)]
struct NextJsFont {
    font_loaders: Vec<Wtf8Atom>,
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
