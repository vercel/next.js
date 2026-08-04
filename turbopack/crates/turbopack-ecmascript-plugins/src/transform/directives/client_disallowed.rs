use anyhow::Result;
#[cfg(not(feature = "sync"))]
use async_trait::async_trait;
use swc_core::ecma::{ast::Program, transforms::base::resolver, visit::VisitMutWith};
use turbopack_ecmascript::{CustomTransformer, TransformContext};

use super::{is_client_module, server_to_client_proxy::create_error_proxy_module};

#[derive(Debug)]
pub struct ClientDisallowedDirectiveTransformer {
    error_proxy_module: String,
}

impl ClientDisallowedDirectiveTransformer {
    pub fn new(error_proxy_module: String) -> Self {
        Self { error_proxy_module }
    }
}

impl ClientDisallowedDirectiveTransformer {
    fn transform_inner(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        if is_client_module(program) {
            *program = create_error_proxy_module(&self.error_proxy_module);
            program.visit_mut_with(&mut resolver(
                ctx.unresolved_mark,
                ctx.top_level_mark,
                false,
            ));
        }

        Ok(())
    }
}

#[cfg(not(feature = "sync"))]
#[async_trait]
impl CustomTransformer for ClientDisallowedDirectiveTransformer {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        self.transform_inner(program, ctx)
    }
}

/// See the async impl above; the sync engine drops `async`/`#[async_trait]`.
#[cfg(feature = "sync")]
impl CustomTransformer for ClientDisallowedDirectiveTransformer {
    fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        self.transform_inner(program, ctx)
    }
}
