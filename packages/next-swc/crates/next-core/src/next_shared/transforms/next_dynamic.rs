use std::path::PathBuf;

use anyhow::Result;
use async_trait::async_trait;
use next_transform_dynamic::{next_dynamic, NextDynamicMode};
use swc_core::{
    common::{util::take::Take, FileName},
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbo_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::{
        ecmascript::{
            CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransformsVc,
            TransformContext, TransformPluginVc,
        },
        turbopack::module_options::{ModuleRule, ModuleRuleEffect},
    },
};

use super::module_rule_match_js_no_url;

/// Returns a rule which applies the Next.js dynamic transform.
pub async fn get_next_dynamic_transform_rule(
    is_development: bool,
    is_server: bool,
    is_server_components: bool,
    pages_dir: Option<FileSystemPathVc>,
) -> Result<ModuleRule> {
    let dynamic_transform =
        EcmascriptInputTransform::Plugin(TransformPluginVc::cell(box NextJsDynamic {
            is_development,
            is_server,
            is_server_components,
            pages_dir: match pages_dir {
                None => None,
                Some(path) => Some(path.await?.path.clone().into()),
            },
        }));
    Ok(ModuleRule::new(
        module_rule_match_js_no_url(),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(
            EcmascriptInputTransformsVc::cell(vec![dynamic_transform]),
        )],
    ))
}

#[derive(Debug)]
struct NextJsDynamic {
    is_development: bool,
    is_server: bool,
    is_server_components: bool,
    pages_dir: Option<PathBuf>,
}

#[async_trait]
impl CustomTransformer for NextJsDynamic {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut next_dynamic(
            self.is_development,
            self.is_server,
            self.is_server_components,
            NextDynamicMode::Turbo,
            FileName::Real(ctx.file_path_str.into()),
            self.pages_dir.clone(),
        ));

        Ok(())
    }
}
