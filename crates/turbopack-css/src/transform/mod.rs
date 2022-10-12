use std::sync::Arc;

use anyhow::Result;
use swc_core::{
    common::SourceMap,
    css::{ast::Stylesheet, visit::VisitMutWith},
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum CssInputTransform {
    Nested,
    Custom,
}

#[turbo_tasks::value(transparent, serialization = "auto_for_input")]
#[derive(Debug, PartialOrd, Ord, Hash, Clone)]
pub struct CssInputTransforms(Vec<CssInputTransform>);

pub struct TransformContext<'a> {
    pub source_map: &'a Arc<SourceMap>,
    pub file_name_str: &'a str,
}

impl CssInputTransform {
    pub async fn apply(
        &self,
        stylesheet: &mut Stylesheet,
        &TransformContext {
            source_map: _,
            file_name_str: _,
        }: &TransformContext<'_>,
    ) -> Result<()> {
        match *self {
            CssInputTransform::Nested => {
                stylesheet.visit_mut_with(&mut swc_core::css::compat::nesting::nesting());
            }
            CssInputTransform::Custom => todo!(),
        }
        Ok(())
    }
}
