use swc_atoms::js_word;
use swc_common::{FileName, DUMMY_SP};
use swc_ecmascript::ast::{
  ArrayLit, ArrowExpr, BinExpr, BinaryOp, BlockStmtOrExpr, CallExpr, Expr, ExprOrSpread,
  ExprOrSuper, Ident, ImportDecl, ImportSpecifier, KeyValueProp, Lit, MemberExpr, ObjectLit, Prop,
  PropName, PropOrSpread, Str, StrKind,
};
use swc_ecmascript::utils::{
  ident::{Id, IdentLike},
  HANDLER,
};
use swc_ecmascript::visit::{Fold, FoldWith};

pub fn next_dynamic(filename: FileName) -> impl Fold {
  NextDynamicPatcher {
    filename,
    dynamic_bindings: vec![],
  }
}

#[derive(Debug)]
struct NextDynamicPatcher {
  filename: FileName,
  dynamic_bindings: Vec<Id>,
}

impl Fold for NextDynamicPatcher {
  fn fold_import_decl(&mut self, decl: ImportDecl) -> ImportDecl {
    let ImportDecl {
      ref src,
      ref specifiers,
      ..
    } = decl;
    if &src.value == "next/dynamic" {
      for specifier in specifiers {
        if let ImportSpecifier::Default(default_specifier) = specifier {
          self.dynamic_bindings.push(default_specifier.local.to_id());
        }
      }
    }

    decl
  }

  fn fold_call_expr(&mut self, expr: CallExpr) -> CallExpr {
    let mut expr = expr.fold_children_with(self);
    if let ExprOrSuper::Expr(i) = &expr.callee {
      if let Expr::Ident(identifier) = &**i {
        if self.dynamic_bindings.contains(&identifier.to_id()) {
          if expr.args.len() == 0 {
            HANDLER.with(|handler| {
              handler
                .struct_span_err(
                  identifier.span,
                  "next/dynamic requires at least one argument",
                )
                .emit()
            });
          } else if expr.args.len() > 2 {
            HANDLER.with(|handler| {
              handler
                .struct_span_err(identifier.span, "next/dynamic only accepts 2 arguments")
                .emit()
            });
          }

          let mut import_specifier = None;
          if let Expr::Arrow(ArrowExpr {
            body: BlockStmtOrExpr::Expr(e),
            ..
          }) = &*expr.args[0].expr
          {
            if let Expr::Call(CallExpr {
              args: a, callee, ..
            }) = &**e
            {
              if let ExprOrSuper::Expr(e) = callee {
                if let Expr::Ident(Ident { sym, .. }) = &**e {
                  if sym == "import" {
                    if a.len() == 0 {
                      // Do nothing, import_specifier will remain None
                      // triggering error below
                    } else if let Expr::Lit(Lit::Str(Str { value, .. })) = &*a[0].expr {
                      import_specifier = Some(value.clone());
                    }
                  }
                }
              }
            }
          }

          if let None = import_specifier {
            HANDLER.with(|handler| {
              handler
                .struct_span_err(
                  identifier.span,
                  "First argument for next/dynamic must be an arrow function returning a valid \
                   dynamic import call e.g. `dynamic(() => import('../some-component'))`",
                )
                .emit()
            });
          }

          // loadableGenerated: {
          //   webpack: () => [require.resolveWeak('../components/hello')],
          //   modules:
          // ["/project/src/file-being-transformed.js -> " + '../components/hello'] }
          let generated = Box::new(Expr::Object(ObjectLit {
            span: DUMMY_SP,
            props: vec![
              PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(Ident::new("webpack".into(), DUMMY_SP)),
                value: Box::new(Expr::Arrow(ArrowExpr {
                  params: vec![],
                  body: BlockStmtOrExpr::Expr(Box::new(Expr::Array(ArrayLit {
                    elems: vec![Some(ExprOrSpread {
                      expr: Box::new(Expr::Call(CallExpr {
                        callee: ExprOrSuper::Expr(Box::new(Expr::Member(MemberExpr {
                          obj: ExprOrSuper::Expr(Box::new(Expr::Ident(Ident {
                            sym: js_word!("require"),
                            span: DUMMY_SP,
                            optional: false,
                          }))),
                          prop: Box::new(Expr::Ident(Ident {
                            sym: "resolveWeak".into(),
                            span: DUMMY_SP,
                            optional: false,
                          })),
                          computed: false,
                          span: DUMMY_SP,
                        }))),
                        args: vec![ExprOrSpread {
                          expr: Box::new(Expr::Lit(Lit::Str(Str {
                            value: self.filename.to_string().into(),
                            span: DUMMY_SP,
                            kind: StrKind::Synthesized {},
                            has_escape: false,
                          }))),
                          spread: None,
                        }],
                        span: DUMMY_SP,
                        type_args: None,
                      })),
                      spread: None,
                    })],
                    span: DUMMY_SP,
                  }))),
                  is_async: false,
                  is_generator: false,
                  span: DUMMY_SP,
                  return_type: None,
                  type_params: None,
                })),
              }))),
              PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(Ident::new("modules".into(), DUMMY_SP)),
                value: Box::new(Expr::Array(ArrayLit {
                  elems: vec![Some(ExprOrSpread {
                    expr: Box::new(Expr::Bin(BinExpr {
                      span: DUMMY_SP,
                      op: BinaryOp::Add,
                      left: Box::new(Expr::Lit(Lit::Str(Str {
                        value: format!("{} -> ", self.filename).into(),
                        span: DUMMY_SP,
                        kind: StrKind::Synthesized {},
                        has_escape: false,
                      }))),
                      right: Box::new(Expr::Lit(Lit::Str(Str {
                        value: import_specifier.unwrap(),
                        span: DUMMY_SP,
                        kind: StrKind::Normal {
                          contains_quote: false,
                        },
                        has_escape: false,
                      }))),
                    })),
                    spread: None,
                  })],
                  span: DUMMY_SP,
                })),
              }))),
            ],
          }));

          let mut props = vec![PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(Ident::new("loadableGenerated".into(), DUMMY_SP)),
            value: generated,
          })))];

          if expr.args.len() == 2 {
            if let Expr::Object(ObjectLit {
              props: options_props,
              ..
            }) = &*expr.args[1].expr
            {
              props.extend(options_props.iter().cloned());
            }
          }

          let second_arg = ExprOrSpread {
            spread: None,
            expr: Box::new(Expr::Object(ObjectLit {
              span: DUMMY_SP,
              props,
            })),
          };

          expr.args.push(second_arg);
        }
      }
    }
    expr
  }
}
