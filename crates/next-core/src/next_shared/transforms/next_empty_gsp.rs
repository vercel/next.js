use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::empty_gsp::EmptyGenerateStaticParams;
use swc_core::ecma::ast::Program;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::{EcmascriptTransformStage, get_ecma_transform_rule};

pub async fn get_next_empty_gsp_rule(
    enable_mdx_rs: bool,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<ModuleRule> {
    let transform = next_empty_gsp_transform_plugin(page_extensions)
        .to_resolved()
        .await?;

    Ok(get_ecma_transform_rule(
        transform,
        enable_mdx_rs,
        EcmascriptTransformStage::Postprocess,
    ))
}

#[turbo_tasks::function]
async fn next_empty_gsp_transform_plugin(
    page_extensions: ResolvedVc<Vec<RcStr>>,
) -> Result<Vc<TransformPlugin>> {
    Ok(Vc::cell(Box::new(NextEmptyGsp {
        empty_gsp: EmptyGenerateStaticParams::new(&*page_extensions.await?),
    }) as Box<dyn CustomTransformer + Send + Sync>))
}

#[derive(Debug)]
struct NextEmptyGsp {
    empty_gsp: EmptyGenerateStaticParams,
}

#[async_trait]
impl CustomTransformer for NextEmptyGsp {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "empty_gsp", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(self.empty_gsp.get_pass(ctx.file_path_str.to_string()));
        Ok(())
    }
}
