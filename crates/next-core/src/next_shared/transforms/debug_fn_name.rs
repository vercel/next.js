use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::debug_fn_name::debug_fn_name;
use swc_core::ecma::{ast::Program, visit::VisitMutWith};
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use crate::next_shared::transforms::{EcmascriptTransformStage, get_ecma_transform_rule};

pub async fn get_debug_fn_name_rule(enable_mdx_rs: bool) -> Result<ModuleRule> {
    let debug_fn_name_transform = debug_fn_name_transform_plugin().to_resolved().await?;

    Ok(get_ecma_transform_rule(
        debug_fn_name_transform,
        enable_mdx_rs,
        EcmascriptTransformStage::Postprocess,
    ))
}

#[turbo_tasks::function]
fn debug_fn_name_transform_plugin() -> Vc<TransformPlugin> {
    Vc::cell(Box::new(DebugFnNameTransformer {}) as Box<dyn CustomTransformer + Send + Sync>)
}

#[derive(Debug)]
struct DebugFnNameTransformer {}

#[async_trait]
impl CustomTransformer for DebugFnNameTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "debug_fn_name", skip_all)]
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        program.visit_mut_with(&mut debug_fn_name());
        Ok(())
    }
}
