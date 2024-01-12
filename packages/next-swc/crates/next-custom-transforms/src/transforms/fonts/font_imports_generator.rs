use serde_json::Value;
use turbopack_binding::swc::core::{
    common::{errors::HANDLER, Spanned, DUMMY_SP},
    ecma::{
        ast::*,
        atoms::JsWord,
        visit::{noop_visit_type, Visit},
    },
};

pub struct FontImportsGenerator<'a> {
    pub state: &'a mut super::State,
    pub relative_path: &'a str,
}

impl<'a> FontImportsGenerator<'a> {
    fn check_call_expr(
        &mut self,
        call_expr: &CallExpr,
        variable_name: &Result<Ident, &Pat>,
    ) -> Option<ImportDecl> {
        if let Callee::Expr(callee_expr) = &call_expr.callee {
            if let Expr::Ident(ident) = &**callee_expr {
                if let Some(font_function) = self.state.font_functions.get(&ident.to_id()) {
                    self.state
                        .font_functions_in_allowed_scope
                        .insert(ident.span.lo);

                    let json: Result<Vec<Value>, ()> = call_expr
                        .args
                        .iter()
                        .map(|expr_or_spread| {
                            if let Some(span) = expr_or_spread.spread {
                                HANDLER.with(|handler| {
                                    handler
                                        .struct_span_err(span, "Font loaders don't accept spreads")
                                        .emit()
                                });
                            }

                            expr_to_json(&expr_or_spread.expr)
                        })
                        .collect();

                    if let Ok(json) = json {
                        let function_name = match &font_function.function_name {
                            Some(function) => String::from(&**function),
                            None => String::new(),
                        };
                        let mut query_json_values = serde_json::Map::new();
                        query_json_values.insert(
                            String::from("path"),
                            Value::String(self.relative_path.to_string()),
                        );
                        query_json_values
                            .insert(String::from("import"), Value::String(function_name));
                        query_json_values.insert(String::from("arguments"), Value::Array(json));
                        if let Ok(ident) = variable_name {
                            query_json_values.insert(
                                String::from("variableName"),
                                Value::String(ident.sym.to_string()),
                            );
                        }

                        let query_json = Value::Object(query_json_values);

                        return Some(ImportDecl {
                            src: Box::new(Str {
                                value: JsWord::from(format!(
                                    "{}/target.css?{}",
                                    font_function.loader, query_json
                                )),
                                raw: None,
                                span: DUMMY_SP,
                            }),
                            specifiers: vec![],
                            type_only: false,
                            with: None,
                            span: DUMMY_SP,
                        });
                    }
                }
            }
        }

        None
    }

    fn check_var_decl(&mut self, var_decl: &VarDecl) -> Option<Ident> {
        if let Some(decl) = var_decl.decls.first() {
            let ident = match &decl.name {
                Pat::Ident(ident) => Ok(ident.id.clone()),
                pattern => Err(pattern),
            };
            if let Some(expr) = &decl.init {
                if let Expr::Call(call_expr) = &**expr {
                    let import_decl = self.check_call_expr(call_expr, &ident);

                    if let Some(mut import_decl) = import_decl {
                        match var_decl.kind {
                            VarDeclKind::Const => {}
                            _ => {
                                HANDLER.with(|handler| {
                                    handler
                                        .struct_span_err(
                                            var_decl.span,
                                            "Font loader calls must be assigned to a const",
                                        )
                                        .emit()
                                });
                            }
                        }

                        match ident {
                            Ok(ident) => {
                                import_decl.specifiers =
                                    vec![ImportSpecifier::Default(ImportDefaultSpecifier {
                                        span: DUMMY_SP,
                                        local: ident.clone(),
                                    })];

                                self.state
                                    .font_imports
                                    .push(ModuleItem::ModuleDecl(ModuleDecl::Import(import_decl)));

                                return Some(ident);
                            }
                            Err(pattern) => {
                                HANDLER.with(|handler| {
                                    handler
                                        .struct_span_err(
                                            pattern.span(),
                                            "Font loader calls must be assigned to an identifier",
                                        )
                                        .emit()
                                });
                            }
                        }
                    }
                }
            }
        }
        None
    }
}

impl<'a> Visit for FontImportsGenerator<'a> {
    noop_visit_type!();

    fn visit_module_item(&mut self, item: &ModuleItem) {
        match item {
            ModuleItem::Stmt(Stmt::Decl(Decl::Var(var_decl))) => {
                if self.check_var_decl(var_decl).is_some() {
                    self.state.removeable_module_items.insert(var_decl.span.lo);
                }
            }
            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export_decl)) => {
                if let Decl::Var(var_decl) = &export_decl.decl {
                    if let Some(ident) = self.check_var_decl(var_decl) {
                        self.state
                            .removeable_module_items
                            .insert(export_decl.span.lo);

                        self.state.font_exports.push(ModuleItem::ModuleDecl(
                            ModuleDecl::ExportNamed(NamedExport {
                                span: DUMMY_SP,
                                specifiers: vec![ExportSpecifier::Named(ExportNamedSpecifier {
                                    orig: ModuleExportName::Ident(ident),
                                    span: DUMMY_SP,
                                    exported: None,
                                    is_type_only: false,
                                })],
                                src: None,
                                type_only: false,
                                with: None,
                            }),
                        ));
                    }
                }
            }
            _ => {}
        }
    }
}

fn object_lit_to_json(object_lit: &ObjectLit) -> Value {
    let mut values = serde_json::Map::new();
    for prop in &object_lit.props {
        match prop {
            PropOrSpread::Prop(prop) => match &**prop {
                Prop::KeyValue(key_val) => {
                    let key = match &key_val.key {
                        PropName::Ident(ident) => Ok(String::from(&*ident.sym)),
                        key => {
                            HANDLER.with(|handler| {
                                handler
                                    .struct_span_err(key.span(), "Unexpected object key type")
                                    .emit()
                            });
                            Err(())
                        }
                    };
                    let val = expr_to_json(&key_val.value);
                    if let (Ok(key), Ok(val)) = (key, val) {
                        values.insert(key, val);
                    }
                }
                key => HANDLER.with(|handler| {
                    handler.struct_span_err(key.span(), "Unexpected key").emit();
                }),
            },
            PropOrSpread::Spread(spread_span) => HANDLER.with(|handler| {
                handler
                    .struct_span_err(spread_span.dot3_token, "Unexpected spread")
                    .emit();
            }),
        }
    }

    Value::Object(values)
}

fn expr_to_json(expr: &Expr) -> Result<Value, ()> {
    match expr {
        Expr::Lit(Lit::Str(str)) => Ok(Value::String(String::from(&*str.value))),
        Expr::Lit(Lit::Bool(Bool { value, .. })) => Ok(Value::Bool(*value)),
        Expr::Lit(Lit::Num(Number { value, .. })) => {
            Ok(Value::Number(serde_json::Number::from_f64(*value).unwrap()))
        }
        Expr::Object(object_lit) => Ok(object_lit_to_json(object_lit)),
        Expr::Array(ArrayLit {
            elems,
            span: array_span,
            ..
        }) => {
            let elements: Result<Vec<Value>, ()> = elems
                .iter()
                .map(|e| {
                    if let Some(expr) = e {
                        match expr.spread {
                            Some(spread_span) => HANDLER.with(|handler| {
                                handler
                                    .struct_span_err(spread_span, "Unexpected spread")
                                    .emit();
                                Err(())
                            }),
                            None => expr_to_json(&expr.expr),
                        }
                    } else {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(*array_span, "Unexpected empty value in array")
                                .emit();
                            Err(())
                        })
                    }
                })
                .collect();

            elements.map(Value::Array)
        }
        lit => HANDLER.with(|handler| {
            handler
                .struct_span_err(
                    lit.span(),
                    "Font loader values must be explicitly written literals.",
                )
                .emit();
            Err(())
        }),
    }
}
