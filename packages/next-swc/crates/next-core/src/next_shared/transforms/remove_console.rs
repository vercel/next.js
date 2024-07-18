use anyhow::Result;
use async_trait::async_trait;
use turbo_tasks::Vc;
use turbopack_binding::{
    swc::core::{
        common::{util::take::Take, SyntaxContext},
        ecma::{
            ast::{Module, Program},
            visit::FoldWith,
        },
    },
    turbopack::{
        ecmascript::{CustomTransformer, TransformContext},
        turbopack::module_options::ModuleRule,
    },
};

use super::get_ecma_transform_rule;
use crate::next_config::{NextConfig, RemoveConsoleConfig};

/// Returns a rule which applies the remove_console transform.
pub async fn get_remove_console_transform_rule(
    next_config: Vc<NextConfig>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();

    let module_rule = next_config
        .await?
        .compiler
        .as_ref()
        .and_then(|value| value.remove_console.as_ref())
        .and_then(|config| match config {
            RemoveConsoleConfig::Boolean(false) => None,
            RemoveConsoleConfig::Boolean(true) => Some(remove_console::Config::All(true)),
            RemoveConsoleConfig::Config { exclude } => Some(remove_console::Config::WithOptions(
                remove_console::Options {
                    exclude: exclude
                        .as_deref()
                        .unwrap_or_default()
                        .iter()
                        .map(|v| v.clone().into())
                        .collect(),
                },
            )),
        })
        .map(|config| {
            get_ecma_transform_rule(
                Box::new(RemoveConsoleTransformer { config }),
                enable_mdx_rs,
                true,
            )
        });

    Ok(module_rule)
}

#[derive(Debug)]
struct RemoveConsoleTransformer {
    config: remove_console::Config,
}

#[async_trait]
impl CustomTransformer for RemoveConsoleTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "remove_console", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut remove_console::remove_console(
            self.config.clone(),
            SyntaxContext::empty().apply_mark(ctx.unresolved_mark),
        ));

        Ok(())
    }
}
