use anyhow::Result;
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

pub fn get_barrel_loader(pkgs: Vc<Vec<String>>) -> ModuleRule {
    let transformer: Box<dyn CustomTransformer + Send + Sync> =
        Box::new(BarrelLoader { pkgs }) as _;

    let transformer = EcmascriptInputTransform::Plugin(Vc::cell(transformer));

    let (prepend, append) = (Vc::cell(vec![]), Vc::cell(vec![transformer]));

    ModuleRule::new(
        module_rule_match_js_no_url(false),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms { prepend, append }],
    )
}

#[derive(Debug, Default)]
struct BarrelLoader {
    pkgs: Vc<Vec<String>>,
}

#[async_trait]
impl CustomTransformer for BarrelLoader {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {}
}
