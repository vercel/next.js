use anyhow::Result;
#[cfg(not(feature = "sync"))]
use async_trait::async_trait;
use swc_core::{
    common::FileName,
    ecma::{ast::Program, preset_env::Versions},
};
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[derive(Debug)]
pub struct StyledJsxTransformer {
    target_browsers: Versions,
}

impl StyledJsxTransformer {
    pub fn new(target_browsers: Versions) -> Self {
        Self { target_browsers }
    }
}

impl StyledJsxTransformer {
    fn transform_inner(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(styled_jsx::visitor::styled_jsx(
            ctx.source_map.clone(),
            // styled_jsx don't really use that in a relevant way
            &FileName::Anon,
            &styled_jsx::visitor::Config {
                use_lightningcss: true,
                browsers: self.target_browsers,
            },
            &styled_jsx::visitor::NativeConfig { process_css: None },
        ));

        Ok(())
    }
}

#[cfg(not(feature = "sync"))]
#[async_trait]
impl CustomTransformer for StyledJsxTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "styled_jsx", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        self.transform_inner(program, ctx)
    }
}

/// See the async impl above; the sync engine drops `async`/`#[async_trait]`.
#[cfg(feature = "sync")]
impl CustomTransformer for StyledJsxTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "styled_jsx", skip_all)]
    fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        self.transform_inner(program, ctx)
    }
}
