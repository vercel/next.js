use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::track_dynamic_imports::*;
use swc_core::ecma::ast::Program;
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::get_ecma_transform_rule;
use crate::next_shared::transforms::EcmascriptTransformStage;

pub async fn get_next_track_dynamic_imports_transform_rule(mdx_rs: bool) -> Result<ModuleRule> {
    Ok(get_ecma_transform_rule(
        next_track_dynamic_imports_transform_plugin()
            .to_resolved()
            .await?,
        mdx_rs,
        EcmascriptTransformStage::Postprocess,
    ))
}

#[turbo_tasks::function]
fn next_track_dynamic_imports_transform_plugin() -> Vc<TransformPlugin> {
    Vc::cell(Box::new(NextTrackDynamicImports {}) as Box<dyn CustomTransformer + Send + Sync>)
}

#[derive(Debug)]
struct NextTrackDynamicImports {}

#[async_trait]
impl CustomTransformer for NextTrackDynamicImports {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_track_dynamic_imports", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(track_dynamic_imports(
            ctx.unresolved_mark,
            ctx.comments.clone(),
        ));
        Ok(())
    }
}
