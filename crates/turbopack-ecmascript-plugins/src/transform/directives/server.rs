use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    ecma::ast::{ModuleItem, Program},
    quote,
};
use turbopack_ecmascript::{CustomTransformer, TransformContext, UnsupportedServerActionIssue};

use super::is_server_module;

#[derive(Debug)]
pub struct ServerDirectiveTransformer;

impl ServerDirectiveTransformer {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl CustomTransformer for ServerDirectiveTransformer {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        if is_server_module(program) {
            let stmt = quote!(
                "throw new Error('Server actions (\"use server\") are not yet supported in \
                 Turbopack');" as Stmt
            );
            match program {
                Program::Module(m) => m.body = vec![ModuleItem::Stmt(stmt)],
                Program::Script(s) => s.body = vec![stmt],
            }
            UnsupportedServerActionIssue {
                context: ctx.file_path,
            }
            .cell()
            .as_issue()
            .emit();
        }

        Ok(())
    }
}
