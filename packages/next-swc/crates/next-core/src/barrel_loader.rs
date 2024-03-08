use async_trait::async_trait;
use turbo_tasks::Vc;
use turbopack_binding::{
    swc::core::ecma::ast::Program,
    turbopack::{
        ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
        turbopack::module_options::{ModuleRule, ModuleRuleEffect},
    },
};

use crate::next_shared::transforms::module_rule_match_js_no_url;

pub fn get_barrel_loader() -> ModuleRule {
    let transformer: Box<dyn CustomTransformer + Send + Sync> =
        EcmascriptInputTransform::Plugin(Vc::cell(BarrelLoader::default() as _));

    let (prepend, append) = (Vc::cell(vec![]), Vc::cell(vec![transformer]));

    ModuleRule::new(
        module_rule_match_js_no_url(false),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms { prepend, append }],
    )
}

#[turbo_tasks::value]
#[derive(Default)]
struct BarrelLoader {}

#[async_trait]
impl CustomTransformer for BarrelLoader {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {}
}
