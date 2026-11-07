use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::dynamic::{NextDynamicMode, next_dynamic};
use swc_core::{atoms::atom, common::FileName, ecma::ast::Program};
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::{EcmascriptTransformStage, get_ecma_transform_rule};
use crate::mode::NextMode;

/// Returns a rule which applies the Next.js dynamic transform.
pub async fn get_next_dynamic_transform_rule(
    is_server_compiler: bool,
    is_react_server_layer: bool,
    is_app_dir: bool,
    mode: Vc<NextMode>,
    enable_mdx_rs: bool,
) -> Result<ModuleRule> {
    let dynamic_transform =
        next_dynamic_transform_plugin(is_server_compiler, is_react_server_layer, is_app_dir, mode)
            .to_resolved()
            .await?;
    Ok(get_ecma_transform_rule(
        dynamic_transform,
        enable_mdx_rs,
        EcmascriptTransformStage::Postprocess,
    ))
}

#[turbo_tasks::function]
async fn next_dynamic_transform_plugin(
    is_server_compiler: bool,
    is_react_server_layer: bool,
    is_app_dir: bool,
    mode: Vc<NextMode>,
) -> Result<Vc<TransformPlugin>> {
    Ok(Vc::cell(Box::new(NextJsDynamic {
        is_server_compiler,
        is_react_server_layer,
        is_app_dir,
        mode: *mode.await?,
    }) as Box<dyn CustomTransformer + Send + Sync>))
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
        program.mutate(next_dynamic(
            self.mode.is_development(),
            self.is_server_compiler,
            self.is_react_server_layer,
            self.is_app_dir,
            NextDynamicMode::Turbopack {
                dynamic_client_transition_name: atom!("next-dynamic-client"),
                dynamic_transition_name: atom!("next-dynamic"),
            },
            FileName::Real(ctx.file_path_str.into()).into(),
            None,
        ));
        Ok(())
    }
}
