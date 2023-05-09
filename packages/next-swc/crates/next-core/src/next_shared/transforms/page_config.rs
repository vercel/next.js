use anyhow::Result;
use async_trait::async_trait;
use next_transform_page_config::page_config;
use swc_core::{
    common::util::take::Take,
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbo_binding::turbopack::ecmascript::{CustomTransformer, TransformContext};

#[derive(Debug)]
pub struct PageConfigTransformer {
    is_development: bool,
}

impl PageConfigTransformer {
    pub fn new(is_development: bool) -> Self {
        Self { is_development }
    }
}

#[async_trait]
impl CustomTransformer for PageConfigTransformer {
    async fn transform(
        &self,
        program: &mut Program,
        _ctx: &TransformContext<'_>,
    ) -> Result<Option<Program>> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut page_config(self.is_development, true));

        Ok(None)
    }
}
