use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::track_dynamic_imports::*;
use swc_core::ecma::ast::Program;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext};

use super::get_ecma_transform_rule;
use crate::next_shared::transforms::EcmascriptTransformStage;

pub fn get_next_track_dynamic_imports_transform_rule(mdx_rs: bool) -> ModuleRule {
    get_ecma_transform_rule(
        Box::new(NextTrackDynamicImports {}),
        mdx_rs,
        EcmascriptTransformStage::Postprocess,
    )
}

#[derive(Debug)]
struct NextTrackDynamicImports {}

#[async_trait]
impl CustomTransformer for NextTrackDynamicImports {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_track_dynamic_imports", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(track_dynamic_imports(ctx.unresolved_mark));
        Ok(())
    }
}
