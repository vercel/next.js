use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    common::{util::take::Take, FileName},
    ecma::{
        ast::{Module, Program},
        preset_env::Versions,
        visit::FoldWith,
    },
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

#[async_trait]
impl CustomTransformer for StyledJsxTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "styled_jsx", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut styled_jsx::visitor::styled_jsx(
            ctx.source_map.clone(),
            // styled_jsx don't really use that in a relevant way
            FileName::Anon,
            styled_jsx::visitor::Config {
                use_lightningcss: true,
                browsers: self.target_browsers,
            },
            styled_jsx::visitor::NativeConfig { process_css: None },
        ));

        Ok(())
    }
}
