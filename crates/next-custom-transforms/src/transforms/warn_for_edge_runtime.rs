use std::sync::Arc;

use swc_core::{
    common::{errors::HANDLER, SourceMap, Span},
    ecma::{
        ast::{Expr, Ident, MemberExpr, MemberProp},
        utils::{ExprCtx, ExprExt},
        visit::{Visit, VisitWith},
    },
};

pub fn warn_for_edge_runtime(cm: Arc<SourceMap>, ctx: ExprCtx, should_error: bool) -> impl Visit {
    WarnForEdgeRuntime {
        cm,
        ctx,
        should_error,
    }
}

struct WarnForEdgeRuntime {
    cm: Arc<SourceMap>,
    ctx: ExprCtx,
    should_error: bool,
}

const EDGE_UNSUPPORTED_NODE_APIS: &[&str] = &[
    "clearImmediate",
    "setImmediate",
    "BroadcastChannel",
    "ByteLengthQueuingStrategy",
    "CompressionStream",
    "CountQueuingStrategy",
    "DecompressionStream",
    "DomException",
    "MessageChannel",
    "MessageEvent",
    "MessagePort",
    "ReadableByteStreamController",
    "ReadableStreamBYOBRequest",
    "ReadableStreamDefaultController",
    "TransformStreamDefaultController",
    "WritableStreamDefaultController",
];

impl WarnForEdgeRuntime {
    fn build_unsupported_api_error(&self, span: Span, api_name: &str) -> Option<()> {
        let loc = self.cm.lookup_line(span.lo).ok()?;

        let msg=format!("A Node.js API is used ({api_name} at line: {}) which is not supported in the Edge Runtime.
Learn more: https://nextjs.org/docs/api-reference/edge-runtime",loc.line+1);

        HANDLER.with(|h| {
            if self.should_error {
                h.struct_span_err(span, &msg).emit();
            } else {
                h.struct_span_warn(span, &msg).emit();
            }
        });

        None
    }

    fn is_in_middleware_layer(&self) -> bool {
        true
    }

    fn warn_for_unsupported_process_api(&self, span: Span, prop: &Ident) {
        if !self.is_in_middleware_layer() || prop.sym == "env" {
            return;
        }

        self.build_unsupported_api_error(span, &format!("process.{}", prop.sym));
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

    fn visit_expr(&mut self, n: &Expr) {
        if let Expr::Ident(ident) = n {
            for api in EDGE_UNSUPPORTED_NODE_APIS {
                if self.is_in_middleware_layer() && ident.sym == *api {
                    self.build_unsupported_api_error(ident.span, api);
                    return;
                }
            }
        }

        n.visit_children_with(self);
    }
}
