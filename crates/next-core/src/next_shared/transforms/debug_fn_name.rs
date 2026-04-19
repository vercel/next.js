use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::debug_fn_name::debug_fn_name;
use swc_core::ecma::{ast::Program, visit::VisitMutWith};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{
    CustomTransformer, EcmascriptInputTransform, TransformContext, TransformPlugin,
};

use super::module_rule_match_js_no_url;

pub async fn get_debug_fn_name_rule(enable_mdx_rs: bool) -> Result<ModuleRule> {
    let debug_fn_name_transform =
        EcmascriptInputTransform::Plugin(debug_fn_name_transform_plugin().to_resolved().await?);

    // TODO: use get_ecma_transform_rule instead
    Ok(ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(vec![]),
            main: ResolvedVc::cell(vec![]),
            postprocess: ResolvedVc::cell(vec![debug_fn_name_transform]),
        }],
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
