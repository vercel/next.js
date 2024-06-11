use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::dynamic::{next_dynamic, NextDynamicMode};
use turbo_tasks::Vc;
use turbopack_binding::{
    swc::core::{
        common::{util::take::Take, FileName},
        ecma::{
            ast::{Module, Program},
            visit::FoldWith,
        },
    },
    turbopack::{
        ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
        turbopack::module_options::{ModuleRule, ModuleRuleEffect},
    },
};

use super::module_rule_match_js_no_url;
use crate::mode::NextMode;

/// Returns a rule which applies the Next.js dynamic transform.
pub async fn get_next_dynamic_transform_rule(
    is_server_compiler: bool,
    is_react_server_layer: bool,
    is_app_dir: bool,
    mode: Vc<NextMode>,
    enable_mdx_rs: bool,
) -> Result<ModuleRule> {
    let dynamic_transform = EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextJsDynamic {
        is_server_compiler,
        is_react_server_layer,
        is_app_dir,
        mode: *mode.await?,
    }) as _));
    Ok(ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: Vc::cell(vec![]),
            append: Vc::cell(vec![dynamic_transform]),
        }],
    ))
}

#[derive(Debug)]
struct NextJsDynamic {
    is_server_compiler: bool,
    is_react_server_layer: bool,
    is_app_dir: bool,
    mode: NextMode,
}

#[async_trait]
impl CustomTransformer for NextJsDynamic {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_dynamic", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut next_dynamic(
            self.mode.is_development(),
            self.is_server_compiler,
            self.is_react_server_layer,
            self.is_app_dir,
            NextDynamicMode::Webpack,
            FileName::Real(ctx.file_path_str.into()),
            None,
        ));

        Ok(())
    }
}
