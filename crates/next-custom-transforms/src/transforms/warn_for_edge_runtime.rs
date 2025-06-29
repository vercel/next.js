use std::sync::Arc;

use swc_core::{
    atoms::Atom,
    common::{errors::HANDLER, SourceMap, Span},
    ecma::{
        ast::{
            op, BinExpr, CallExpr, Callee, CondExpr, Expr, IdentName, IfStmt, ImportDecl, Lit,
            MemberExpr, MemberProp, NamedExport, UnaryExpr,
        },
        utils::{ExprCtx, ExprExt},
        visit::{Visit, VisitWith},
    },
};

pub fn warn_for_edge_runtime(
    cm: Arc<SourceMap>,
    ctx: ExprCtx,
    should_error_for_node_apis: bool,
    is_production: bool,
) -> impl Visit {
    WarnForEdgeRuntime {
        cm,
        ctx,
        should_error_for_node_apis,
        should_add_guards: false,
        guarded_symbols: Default::default(),
        guarded_process_props: Default::default(),
        guarded_runtime: false,
        is_production,
        emit_warn: |span: Span, msg: String| {
            HANDLER.with(|h| {
                h.struct_span_warn(span, &msg).emit();
            });
        },
        emit_error: |span: Span, msg: String| {
            HANDLER.with(|h| {
                h.struct_span_err(span, &msg).emit();
            });
        },
    }
}

pub fn warn_for_edge_runtime_with_handlers<EmitWarn, EmitError>(
    cm: Arc<SourceMap>,
    ctx: ExprCtx,
    should_error_for_node_apis: bool,
    is_production: bool,
    emit_warn: EmitWarn,
    emit_error: EmitError,
) -> impl Visit
where
    EmitWarn: Fn(Span, String),
    EmitError: Fn(Span, String),
{
    WarnForEdgeRuntime {
        cm,
        ctx,
        should_error_for_node_apis,
        should_add_guards: false,
        guarded_symbols: Default::default(),
        guarded_process_props: Default::default(),
        guarded_runtime: false,
        is_production,
        emit_warn,
        emit_error,
    }
}

/// This is a very simple visitor that currently only checks if a condition (be it an if-statement
/// or ternary expression) contains a reference to disallowed globals/etc.
/// It does not know the difference between
/// ```js
/// if(typeof clearImmediate === "function") clearImmediate();
/// ```
/// and
/// ```js
/// if(typeof clearImmediate !== "function") clearImmediate();
/// ```
struct WarnForEdgeRuntime<EmitWarn, EmitError> {
    cm: Arc<SourceMap>,
    ctx: ExprCtx,
    should_error_for_node_apis: bool,

    should_add_guards: bool,
    guarded_symbols: Vec<Atom>,
    guarded_process_props: Vec<Atom>,
    // for process.env.NEXT_RUNTIME
    guarded_runtime: bool,
    is_production: bool,
    emit_warn: EmitWarn,
    emit_error: EmitError,
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

/// https://vercel.com/docs/functions/runtimes/edge-runtime#compatible-node.js-modules
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
    // "assert",
    // "assert/strict",
    // "async_hooks",
    // "buffer",
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
    // "events",
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
    // "util",
    // "util/types",
    "v8",
    "vm",
    "wasi",
    "worker_threads",
    "zlib",
];

impl<EmitWarn, EmitError> WarnForEdgeRuntime<EmitWarn, EmitError>
where
    EmitWarn: Fn(Span, String),
    EmitError: Fn(Span, String),
{
    fn warn_if_nodejs_module(&self, span: Span, module_specifier: &str) -> Option<()> {
        if self.guarded_runtime {
            return None;
        }

        // Node.js modules can be loaded with `node:` prefix or directly
        if module_specifier.starts_with("node:") || NODEJS_MODULE_NAMES.contains(&module_specifier)
        {
            let loc = self.cm.lookup_line(span.lo).ok()?;

            let msg = format!(
                "A Node.js module is loaded ('{module_specifier}' at line {}) which is not \
                 supported in the Edge Runtime.
Learn More: https://nextjs.org/docs/messages/node-module-in-edge-runtime",
                loc.line + 1
            );

            (self.emit_warn)(span, msg);
        }

        None
    }

    fn emit_unsupported_api_error(&self, span: Span, api_name: &str) -> Option<()> {
        if self.guarded_runtime
            || self
                .guarded_symbols
                .iter()
                .any(|guarded| guarded == api_name)
        {
            return None;
        }

        let loc = self.cm.lookup_line(span.lo).ok()?;

        let msg = format!(
            "A Node.js API is used ({api_name} at line: {}) which is not supported in the Edge \
             Runtime.
Learn more: https://nextjs.org/docs/api-reference/edge-runtime",
            loc.line + 1
        );

        if self.should_error_for_node_apis {
            (self.emit_error)(span, msg);
        } else {
            (self.emit_warn)(span, msg);
        }

        None
    }

    fn is_in_middleware_layer(&self) -> bool {
        true
    }

    fn warn_for_unsupported_process_api(&self, span: Span, prop: &IdentName) {
        if !self.is_in_middleware_layer() || prop.sym == "env" {
            return;
        }
        if self.guarded_runtime || self.guarded_process_props.contains(&prop.sym) {
            return;
        }

        self.emit_unsupported_api_error(span, &format!("process.{}", prop.sym));
    }

    fn add_guards(&mut self, test: &Expr) {
        let old = self.should_add_guards;
        self.should_add_guards = true;
        test.visit_with(self);
        self.should_add_guards = old;
    }

    fn add_guard_for_test(&mut self, test: &Expr) {
        if !self.should_add_guards {
            return;
        }

        match test {
            Expr::Ident(ident) => {
                self.guarded_symbols.push(ident.sym.clone());
            }
            Expr::Member(member) => {
                if member.prop.is_ident_with("NEXT_RUNTIME") {
                    if let Expr::Member(obj_member) = &*member.obj {
                        if obj_member.obj.is_global_ref_to(self.ctx, "process")
                            && obj_member.prop.is_ident_with("env")
                        {
                            self.guarded_runtime = true;
                        }
                    }
                }
                if member.obj.is_global_ref_to(self.ctx, "process") {
                    if let MemberProp::Ident(prop) = &member.prop {
                        self.guarded_process_props.push(prop.sym.clone());
                    }
                }
            }
            Expr::Bin(BinExpr {
                left,
                right,
                op: op!("===") | op!("==") | op!("!==") | op!("!="),
                ..
            }) => {
                self.add_guard_for_test(left);
                self.add_guard_for_test(right);
            }
            _ => (),
        }
    }

    fn emit_dynamic_not_allowed_error(&self, span: Span) {
        if self.is_production {
            let msg = "Dynamic Code Evaluation (e. g. 'eval', 'new Function', \
                       'WebAssembly.compile') not allowed in Edge Runtime"
                .to_string();

            (self.emit_error)(span, msg);
        }
    }

    fn with_new_scope(&mut self, f: impl FnOnce(&mut Self)) {
        let old_guarded_symbols_len = self.guarded_symbols.len();
        let old_guarded_process_props_len = self.guarded_symbols.len();
        let old_guarded_runtime = self.guarded_runtime;
        f(self);
        self.guarded_symbols.truncate(old_guarded_symbols_len);
        self.guarded_process_props
            .truncate(old_guarded_process_props_len);
        self.guarded_runtime = old_guarded_runtime;
    }
}

impl<EmitWarn, EmitError> Visit for WarnForEdgeRuntime<EmitWarn, EmitError>
where
    EmitWarn: Fn(Span, String),
    EmitError: Fn(Span, String),
{
    fn visit_call_expr(&mut self, n: &CallExpr) {
        n.visit_children_with(self);

        if let Callee::Import(_) = &n.callee {
            if let Some(Expr::Lit(Lit::Str(s))) = n.args.first().map(|e| &*e.expr) {
                self.warn_if_nodejs_module(n.span, &s.value);
            }
        }
    }

    fn visit_bin_expr(&mut self, node: &BinExpr) {
        match node.op {
            op!("&&") | op!("||") | op!("??") => {
                if self.should_add_guards {
                    // This is a condition and not a shorthand for if-then
                    self.add_guards(&node.left);
                    node.right.visit_with(self);
                } else {
                    self.with_new_scope(move |this| {
                        this.add_guards(&node.left);
                        node.right.visit_with(this);
                    });
                }
            }
            op!("==") | op!("===") => {
                self.add_guard_for_test(&node.left);
                self.add_guard_for_test(&node.right);
                node.visit_children_with(self);
            }
            _ => {
                node.visit_children_with(self);
            }
        }
    }
    fn visit_cond_expr(&mut self, node: &CondExpr) {
        self.with_new_scope(move |this| {
            this.add_guards(&node.test);

            node.cons.visit_with(this);
            node.alt.visit_with(this);
        });
    }

    fn visit_expr(&mut self, n: &Expr) {
        if let Expr::Ident(ident) = n {
            if ident.ctxt == self.ctx.unresolved_ctxt {
                if ident.sym == "eval" {
                    self.emit_dynamic_not_allowed_error(ident.span);
                    return;
                }

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

    fn visit_if_stmt(&mut self, node: &IfStmt) {
        self.with_new_scope(move |this| {
            this.add_guards(&node.test);

            node.cons.visit_with(this);
            node.alt.visit_with(this);
        });
    }

    fn visit_import_decl(&mut self, n: &ImportDecl) {
        n.visit_children_with(self);

        self.warn_if_nodejs_module(n.span, &n.src.value);
    }

    fn visit_member_expr(&mut self, n: &MemberExpr) {
        if n.obj.is_global_ref_to(self.ctx, "process") {
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

    fn visit_unary_expr(&mut self, node: &UnaryExpr) {
        if node.op == op!("typeof") {
            self.add_guard_for_test(&node.arg);
            return;
        }

        node.visit_children_with(self);
    }
}
