use std::sync::Arc;

use swc_core::{
    common::{errors::HANDLER, SourceMap, Span},
    ecma::{
        ast::{
            CallExpr, Callee, Expr, IdentName, ImportDecl, Lit, MemberExpr, MemberProp, NamedExport,
        },
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

/// Get this value from `require('module').builtinModules`
const NODEJS_MODULE_NAMES: &[&str] = &[
    "_http_agent",
    "_http_client",
    "_http_common",
    "_http_incoming",
    "_http_outgoing",
    "_http_server",
    "_stream_duplex",
    "_stream_passthrough",
    "_stream_readable",
    "_stream_transform",
    "_stream_wrap",
    "_stream_writable",
    "_tls_common",
    "_tls_wrap",
    "assert",
    "assert/strict",
    "async_hooks",
    "buffer",
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "dgram",
    "diagnostics_channel",
    "dns",
    "dns/promises",
    "domain",
    "events",
    "fs",
    "fs/promises",
    "http",
    "http2",
    "https",
    "inspector",
    "module",
    "net",
    "os",
    "path",
    "path/posix",
    "path/win32",
    "perf_hooks",
    "process",
    "punycode",
    "querystring",
    "readline",
    "readline/promises",
    "repl",
    "stream",
    "stream/consumers",
    "stream/promises",
    "stream/web",
    "string_decoder",
    "sys",
    "timers",
    "timers/promises",
    "tls",
    "trace_events",
    "tty",
    "url",
    "util",
    "util/types",
    "v8",
    "vm",
    "wasi",
    "worker_threads",
    "zlib",
];

impl WarnForEdgeRuntime {
    fn warn_if_nodejs_module(&self, span: Span, module_specifier: &str) -> Option<()> {
        // Node.js modules can be loaded with `node:` prefix or directly
        if module_specifier.starts_with("node:") || NODEJS_MODULE_NAMES.contains(&module_specifier)
        {
            let loc = self.cm.lookup_line(span.lo).ok()?;

            let msg = format!(
                "A Node.js module is loaded ('${module_specifier}' at line {}) which is not \
                 supported in the Edge Runtime.
Learn More: https://nextjs.org/docs/messages/node-module-in-edge-runtime",
                loc.line + 1
            );

            HANDLER.with(|h| {
                if self.should_error {
                    h.struct_span_err(span, &msg).emit();
                } else {
                    h.struct_span_warn(span, &msg).emit();
                }
            });
        }

        None
    }

    fn emit_unsupported_api_error(&self, span: Span, api_name: &str) -> Option<()> {
        let loc = self.cm.lookup_line(span.lo).ok()?;

        let msg = format!(
            "A Node.js API is used ({api_name} at line: {}) which is not supported in the Edge \
             Runtime.
Learn more: https://nextjs.org/docs/api-reference/edge-runtime",
            loc.line + 1
        );

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

    fn warn_for_unsupported_process_api(&self, span: Span, prop: &IdentName) {
        if !self.is_in_middleware_layer() || prop.sym == "env" {
            return;
        }

        self.emit_unsupported_api_error(span, &format!("process.{}", prop.sym));
    }
}

impl Visit for WarnForEdgeRuntime {
    fn visit_call_expr(&mut self, n: &CallExpr) {
        n.visit_children_with(self);

        if let Callee::Import(_) = &n.callee {
            if let Some(Expr::Lit(Lit::Str(s))) = n.args.first().map(|e| &*e.expr) {
                self.warn_if_nodejs_module(n.span, &s.value);
            }
        }
    }

    fn visit_expr(&mut self, n: &Expr) {
        if let Expr::Ident(ident) = n {
            if ident.ctxt == self.ctx.unresolved_ctxt {
                for api in EDGE_UNSUPPORTED_NODE_APIS {
                    if self.is_in_middleware_layer() && ident.sym == *api {
                        self.emit_unsupported_api_error(ident.span, api);
                        return;
                    }
                }
            }
        }

        n.visit_children_with(self);
    }

    fn visit_import_decl(&mut self, n: &ImportDecl) {
        n.visit_children_with(self);

        self.warn_if_nodejs_module(n.span, &n.src.value);
    }

    fn visit_member_expr(&mut self, n: &MemberExpr) {
        if n.obj.is_global_ref_to(&self.ctx, "process") {
            if let MemberProp::Ident(prop) = &n.prop {
                self.warn_for_unsupported_process_api(n.span, prop);
                return;
            }
        }

        n.visit_children_with(self);
    }

    fn visit_named_export(&mut self, n: &NamedExport) {
        n.visit_children_with(self);

        if let Some(module_specifier) = &n.src {
            self.warn_if_nodejs_module(n.span, &module_specifier.value);
        }
    }
}
