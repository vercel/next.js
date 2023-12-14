use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    common::util::take::Take,
    ecma::ast::{Module, Program},
};
use turbopack_binding::turbopack::{
    ecmascript::{CustomTransformer, TransformContext},
    turbopack::module_options::ModuleRule,
};

use super::module_rule_match_js_no_url;

/// Returns a rule which applies the Next.js react server components transform.
pub async fn get_next_react_server_components_transform_rule(
    is_react_server_layer: bool,
    enable_mdx_rs: bool,
) -> Result<ModuleRule> {
    Ok(ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![],
    ))
}

#[derive(Debug)]
struct NextJsReactServerComponents {
    is_react_server_layer: bool,
}

#[async_trait]
impl CustomTransformer for NextJsReactServerComponents {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));

        Ok(())
    }
}
