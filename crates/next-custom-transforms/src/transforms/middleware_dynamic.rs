use swc_core::{
    ecma::{
        ast::*,
        visit::{VisitMut, VisitMutWith},
    },
    quote,
};

enum WrappedExpr {
    Eval,
    WasmCompile,
    WasmInstantiate,
}

/// Replaces call / expr to dynamic evaluation in the give code to
/// wrapped expression (__next_eval__, __next_webassembly_compile__,..) to raise
/// corresponding error.
///
/// This transform is specific to edge runtime which are not allowed to
/// call certain dynamic evaluation (eval, webassembly.instantiate, etc)
///
/// check middleware-plugin for corresponding webpack side transform.
pub fn next_middleware_dynamic() -> MiddlewareDynamic {
    MiddlewareDynamic {}
}

pub struct MiddlewareDynamic {}

impl VisitMut for MiddlewareDynamic {
    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        let mut should_wrap = None;

        expr.visit_mut_children_with(self);

        if let Expr::Call(call_expr) = &expr {
            let callee = &call_expr.callee;
            if let Callee::Expr(callee) = callee {
                // `eval('some')`, or `Function('some')`
                if let Expr::Ident(ident) = &**callee {
                    if ident.sym == "eval" || ident.sym == "Function" {
                        should_wrap = Some(WrappedExpr::Eval);
                    }
                }

                if let Expr::Member(MemberExpr {
                    obj,
                    prop: MemberProp::Ident(prop_ident),
                    ..
                }) = &**callee
                {
                    if let Expr::Ident(ident) = &**obj {
                        // `global.eval('some')`
                        if ident.sym == "global" && prop_ident.sym == "eval" {
                            should_wrap = Some(WrappedExpr::Eval);
                        }

                        // `WebAssembly.compile('some')` & `WebAssembly.instantiate('some')`
                        if ident.sym == "WebAssembly" {
                            if prop_ident.sym == "compile" {
                                should_wrap = Some(WrappedExpr::WasmCompile);
                            } else if prop_ident.sym == "instantiate" {
                                should_wrap = Some(WrappedExpr::WasmInstantiate);
                            }
                        }
                    }

                    if let Expr::Member(MemberExpr {
                        obj,
                        prop: MemberProp::Ident(member_prop_ident),
                        ..
                    }) = &**obj
                    {
                        if let Expr::Ident(ident) = &**obj {
                            // `global.WebAssembly.compile('some')` &
                            // `global.WebAssembly.instantiate('some')`
                            if ident.sym == "global" && member_prop_ident.sym == "WebAssembly" {
                                if prop_ident.sym == "compile" {
                                    should_wrap = Some(WrappedExpr::WasmCompile);
                                } else if prop_ident.sym == "instantiate" {
                                    should_wrap = Some(WrappedExpr::WasmInstantiate);
                                }
                            }
                        }
                    }
                }
            }

            match should_wrap {
                Some(WrappedExpr::Eval) => {
                    *expr = quote!("__next_eval__(function() { return $orig_call });" as Expr, orig_call: Expr = Expr::Call(call_expr.clone()));
                }
                Some(WrappedExpr::WasmCompile) => {
                    *expr = quote!("__next_webassembly_compile__(function() { return $orig_call });" as Expr, orig_call: Expr = Expr::Call(call_expr.clone()));
                }
                Some(WrappedExpr::WasmInstantiate) => {
                    *expr = quote!("__next_webassembly_instantiate__(function() { return $orig_call });" as Expr, orig_call: Expr = Expr::Call(call_expr.clone()));
                }
                None => {}
            }
        }

        if let Expr::New(NewExpr { callee, .. }) = &expr {
            if let Expr::Ident(ident) = &**callee {
                if ident.sym == "Function" {
                    *expr = quote!("__next_eval__(function() { return $orig_call });" as Expr, orig_call: Expr = expr.clone());
                }
            }
        }
    }
}
