use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    common::{util::take::Take, FileName},
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[derive(Debug)]
pub struct StyledJsxTransformer {
    use_lightningcss: bool,
}

impl StyledJsxTransformer {
    pub fn new(use_lightningcss: bool) -> Self {
        Self { use_lightningcss }
    }
}

#[async_trait]
impl CustomTransformer for StyledJsxTransformer {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut styled_jsx::visitor::styled_jsx(
            ctx.source_map.clone(),
            // styled_jsx don't really use that in a relevant way
            FileName::Anon,
            styled_jsx::visitor::Config {
                use_lightningcss: self.use_lightningcss,
                ..Default::default()
            },
        ));

        Ok(())
    }
}
