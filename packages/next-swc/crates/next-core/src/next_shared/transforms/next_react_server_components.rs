use std::path::PathBuf;

use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::react_server_components::*;
use swc_core::{
    common::{util::take::Take, FileName},
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::{CustomTransformer, TransformContext},
    turbopack::module_options::ModuleRule,
};

use super::get_ecma_transform_rule;
use crate::next_config::NextConfig;

/// Returns a rule which applies the Next.js react server components transform.
pub async fn get_next_react_server_components_transform_rule(
    next_config: Vc<NextConfig>,
    is_react_server_layer: bool,
) -> Result<ModuleRule> {
    let enable_mdx_rs = *next_config.mdx_rs().await?;
    Ok(get_ecma_transform_rule(
        Box::new(NextJsReactServerComponents::new(is_react_server_layer)),
        enable_mdx_rs,
        true,
    ))
}

#[derive(Debug)]
struct NextJsReactServerComponents {
    is_react_server_layer: bool,
}

impl NextJsReactServerComponents {
    fn new(is_react_server_layer: bool) -> Self {
        Self {
            is_react_server_layer,
        }
    }
}

#[async_trait]
impl CustomTransformer for NextJsReactServerComponents {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));

        let mut visitor = server_components(
            FileName::Custom(ctx.file_path_str.to_string()),
            Config::WithOptions(Options {
                is_react_server_layer: self.is_react_server_layer,
            }),
            ctx.comments,
            Some(PathBuf::from(ctx.file_path.parent().await?.path.clone())),
        );

        *program = p.fold_with(&mut visitor);

        Ok(())
    }
}
