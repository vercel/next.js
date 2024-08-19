use swc_core::{
    common::{errors::HANDLER, Span},
    ecma::{
        ast::{Ident, MemberExpr, MemberProp},
        utils::{ExprCtx, ExprExt},
        visit::{Visit, VisitWith},
    },
};

pub fn warn_for_edge_runtime(ctx: ExprCtx) -> impl Visit {
    WarnForEdgeRuntime { ctx }
}

struct WarnForEdgeRuntime {
    ctx: ExprCtx,
}

impl WarnForEdgeRuntime {
    fn build_unsupported_api_error(&self, span: Span, api_name: &str, line: u32) {
        let msg=format!("A Node.js API is used ({api_name} at line: {}) which is not supported in the Edge Runtime.
Learn more: https://nextjs.org/docs/api-reference/edge-runtime",line);

        HANDLER.with(|h| {
            h.struct_span_warn(span, &msg).emit();
        })
    }

    fn warn_for_unsupported_process_api(&self, span: Span, prop: &Ident) {
        if !is_in_middleware_layer() || prop.sym == "env" {
            return;
        }

        self.build_unsupported_api_error(span, &format!("process.{}", prop), span.start.line);
    }
}

impl Visit for WarnForEdgeRuntime {
    fn visit_member_expr(&mut self, n: &MemberExpr) {
        if n.obj.is_global_ref_to(&self.ctx, "process") {
            if let MemberProp::Ident(prop) = &n.prop {
                self.warn_for_unsupported_process_api(n.span, prop);
                return;
            }
        }

        n.visit_children_with(self);
    }
}
