use serde_json::{Map, Number, Value};
use swc_core::{
    atoms::Atom,
    common::{Mark, SyntaxContext},
    ecma::{
        ast::{
            BindingIdent, Decl, ExportDecl, Expr, Lit, Module, ModuleDecl, ModuleItem, Pat,
            Program, Prop, PropName, PropOrSpread, VarDecl, VarDeclKind, VarDeclarator,
        },
        utils::{ExprCtx, ExprExt},
    },
};

/// The values extracted for the corresponding AST node.
/// refer extract_expored_const_values for the supported value types.
/// Undefined / null is treated as None.
pub enum Const {
    Value(Value),
    Unsupported(String),
}

pub(crate) struct CollectExportedConstVisitor<'a, M>
where
    M: GetMut<Atom, Option<Const>>,
{
    pub properties: &'a mut M,
    expr_ctx: ExprCtx,
}

impl<'a, M> CollectExportedConstVisitor<'a, M>
where
    M: GetMut<Atom, Option<Const>>,
{
    pub fn new(properties: &'a mut M) -> Self {
        Self {
            properties,
            expr_ctx: ExprCtx {
                unresolved_ctxt: SyntaxContext::empty().apply_mark(Mark::new()),
                is_unresolved_ref_safe: false,
                in_strict: false,
                remaining_depth: 4,
            },
        }
    }

    pub fn check_program(&mut self, program: &Program) {
        let Program::Module(Module { body, .. }) = program else {
            return;
        };

        for module_item in body {
            if let ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                decl: Decl::Var(decl),
                ..
            })) = module_item
            {
                let VarDecl { kind, decls, .. } = &**decl;
                if kind == &VarDeclKind::Const {
                    for decl in decls {
                        if let VarDeclarator {
                            name: Pat::Ident(BindingIdent { id, .. }),
                            init: Some(init),
                            ..
                        } = decl
                        {
                            let id = &id.sym;
                            if let Some(prop) = self.properties.get_mut(id) {
                                *prop = extract_value(self.expr_ctx, init, id.to_string());
                            };
                        }
                    }
                }
            }
        }
    }
}

pub trait GetMut<K, V> {
    fn get_mut(&mut self, key: &K) -> Option<&mut V>;
}

/// Coerece the actual value of the given ast node.
fn extract_value(ctx: ExprCtx, init: &Expr, id: String) -> Option<Const> {
    match init {
        init if init.is_undefined(ctx) => Some(Const::Value(Value::Null)),
        Expr::Ident(ident) => Some(Const::Unsupported(format!(
            "Unknown identifier \"{}\" at \"{}\".",
            ident.sym, id
        ))),
        Expr::Lit(lit) => match lit {
            Lit::Num(num) => Some(Const::Value(Value::Number(
                Number::from_f64(num.value).expect("Should able to convert f64 to Number"),
            ))),
            Lit::Null(_) => Some(Const::Value(Value::Null)),
            Lit::Str(s) => Some(Const::Value(Value::String(s.value.to_string()))),
            Lit::Bool(b) => Some(Const::Value(Value::Bool(b.value))),
            Lit::Regex(r) => Some(Const::Value(Value::String(format!(
                "/{}/{}",
                r.exp, r.flags
            )))),
            _ => Some(Const::Unsupported("Unsupported Literal".to_string())),
        },
        Expr::Array(arr) => {
            let mut a = vec![];

            for elem in &arr.elems {
                match elem {
                    Some(elem) => {
                        if elem.spread.is_some() {
                            return Some(Const::Unsupported(format!(
                                "Unsupported spread operator in the Array Expression at \"{id}\""
                            )));
                        }

                        match extract_value(ctx, &elem.expr, id.clone()) {
                            Some(Const::Value(value)) => a.push(value),
                            Some(Const::Unsupported(message)) => {
                                return Some(Const::Unsupported(format!(
                                    "Unsupported value in the Array Expression: {message}"
                                )))
                            }
                            _ => {
                                return Some(Const::Unsupported(
                                    "Unsupported value in the Array Expression".to_string(),
                                ))
                            }
                        }
                    }
                    None => {
                        a.push(Value::Null);
                    }
                }
            }

            Some(Const::Value(Value::Array(a)))
        }
        Expr::Object(obj) => {
            let mut o = Map::new();

            for prop in &obj.props {
                let (key, value) = match prop {
                    PropOrSpread::Prop(box Prop::KeyValue(kv)) => (
                        match &kv.key {
                            PropName::Ident(i) => i.sym.as_ref(),
                            PropName::Str(s) => s.value.as_ref(),
                            _ => {
                                return Some(Const::Unsupported(format!(
                                    "Unsupported key type in the Object Expression at \"{id}\""
                                )))
                            }
                        },
                        &kv.value,
                    ),
                    _ => {
                        return Some(Const::Unsupported(format!(
                            "Unsupported spread operator in the Object Expression at \"{id}\""
                        )))
                    }
                };
                let new_value = extract_value(ctx, value, format!("{id}.{key}"));
                if let Some(Const::Unsupported(msg)) = new_value {
                    return Some(Const::Unsupported(msg));
                }

                if let Some(Const::Value(value)) = new_value {
                    o.insert(key.to_string(), value);
                }
            }

            Some(Const::Value(Value::Object(o)))
        }
        Expr::Tpl(tpl) => {
            // [TODO] should we add support for `${'e'}d${'g'}'e'`?
            if !tpl.exprs.is_empty() {
                Some(Const::Unsupported(format!(
                    "Unsupported template literal with expressions at \"{id}\"."
                )))
            } else {
                Some(
                    tpl.quasis
                        .first()
                        .map(|q| {
                            // When TemplateLiteral has 0 expressions, the length of quasis is
                            // always 1. Because when parsing
                            // TemplateLiteral, the parser yields the first quasi,
                            // then the first expression, then the next quasi, then the next
                            // expression, etc., until the last quasi.
                            // Thus if there is no expression, the parser ends at the frst and also
                            // last quasis
                            //
                            // A "cooked" interpretation where backslashes have special meaning,
                            // while a "raw" interpretation where
                            // backslashes do not have special meaning https://exploringjs.com/impatient-js/ch_template-literals.html#template-strings-cooked-vs-raw
                            let cooked = q.cooked.as_ref();
                            let raw = q.raw.as_ref();

                            Const::Value(Value::String(
                                cooked.map(|c| c.to_string()).unwrap_or(raw.to_string()),
                            ))
                        })
                        .unwrap_or(Const::Unsupported(format!(
                            "Unsupported node type at \"{id}\""
                        ))),
                )
            }
        }
        _ => Some(Const::Unsupported(format!(
            "Unsupported node type at \"{id}\""
        ))),
    }
}
