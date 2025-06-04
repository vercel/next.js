use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    ecma::ast::{ModuleItem, Program},
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbopack_core::issue::IssueExt;
use turbopack_ecmascript::{CustomTransformer, TransformContext, UnsupportedServerActionIssue};

use super::is_server_module;

#[derive(Debug)]
pub struct ServerDirectiveTransformer {
    // ServerDirective is not implemented yet and always reports an issue.
    // We don't have to pass a valid transition name yet, but the API is prepared.
    #[allow(unused)]
    transition_name: Vc<RcStr>,
}

impl ServerDirectiveTransformer {
    pub fn new(transition_name: &Vc<RcStr>) -> Self {
        Self {
            transition_name: *transition_name,
        }
    }
}

#[async_trait]
impl CustomTransformer for ServerDirectiveTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "server_directive", skip_all)]
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
                file_path: ctx.file_path,
            }
            .resolved_cell()
            .emit();
        }

        Ok(())
    }
}
