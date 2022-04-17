use std::collections::hash_map::DefaultHasher;
use std::hash::Hasher;
use swc_common::DUMMY_SP;
use swc_ecmascript::ast::*;

use super::{ExternalStyle, JSXStyle, LocalStyle};

fn tpl_element(value: &str) -> TplElement {
    TplElement {
        raw: value.into(),
        cooked: None,
        span: DUMMY_SP,
        tail: false,
    }
}

pub fn compute_class_names(
    styles: &[JSXStyle],
    style_import_name: &str,
) -> (Option<String>, Option<Expr>) {
    let mut static_class_name = None;
    let mut external_jsx_id = None;
    let mut static_hashes = vec![];
    let mut dynamic_styles = vec![];
    let mut external_styles = vec![];
    for style_info in styles {
        match style_info {
            JSXStyle::Local(style_info) => {
                if !style_info.is_dynamic {
                    static_hashes.push(style_info.hash.clone());
                } else {
                    dynamic_styles.push(style_info);
                }
            }
            JSXStyle::External(external) => {
                if !external.is_global {
                    external_styles.push(external.expr.clone());
                }
            }
        }
    }

    if !external_styles.is_empty() {
        let mut quasis = vec![tpl_element("jsx-")];
        for _i in 1..external_styles.len() {
            quasis.push(tpl_element(" jsx-"))
        }
        quasis.push(tpl_element(""));
        external_jsx_id = Some(Expr::Tpl(Tpl {
            quasis,
            exprs: external_styles
                .iter()
                .map(|external| Box::new(external.clone()))
                .collect(),
            span: DUMMY_SP,
        }));
    }

    if !static_hashes.is_empty() {
        static_class_name = Some(format!("jsx-{}", hash_string(&static_hashes.join(","))));
    }

    let dynamic_class_name = match dynamic_styles.len() {
        0 => None,
        _ => Some(Expr::Call(CallExpr {
            callee: Callee::Expr(Box::new(Expr::Member(MemberExpr {
                obj: Box::new(Expr::Ident(Ident {
                    sym: style_import_name.into(),
                    span: DUMMY_SP,
                    optional: false,
                })),
                prop: MemberProp::Ident(Ident {
                    sym: "dynamic".into(),
                    span: DUMMY_SP,
                    optional: false,
                }),
                span: DUMMY_SP,
            }))),
            args: vec![ExprOrSpread {
                expr: Box::new(Expr::Array(ArrayLit {
                    elems: dynamic_styles
                        .iter()
                        .map(|style_info| {
                            let hash_input = match &static_class_name {
                                Some(class_name) => format!("{}{}", style_info.hash, class_name),
                                None => style_info.hash.clone(),
                            };
                            Some(ExprOrSpread {
                                expr: Box::new(Expr::Array(ArrayLit {
                                    elems: vec![
                                        Some(ExprOrSpread {
                                            expr: Box::new(string_literal_expr(&hash_string(
                                                &hash_input,
                                            ))),
                                            spread: None,
                                        }),
                                        Some(ExprOrSpread {
                                            expr: Box::new(Expr::Array(ArrayLit {
                                                elems: style_info
                                                    .expressions
                                                    .iter()
                                                    .map(|expression| {
                                                        Some(ExprOrSpread {
                                                            expr: expression.clone(),
                                                            spread: None,
                                                        })
                                                    })
                                                    .collect(),
                                                span: DUMMY_SP,
                                            })),
                                            spread: None,
                                        }),
                                    ],
                                    span: DUMMY_SP,
                                })),
                                spread: None,
                            })
                        })
                        .collect(),
                    span: DUMMY_SP,
                })),
                spread: None,
            }],
            span: DUMMY_SP,
            type_args: None,
        })),
    };

    let class_name_expr = match (
        static_class_name.clone(),
        dynamic_class_name,
        external_jsx_id,
    ) {
        (Some(static_class_name), Some(dynamic_class_name), Some(external_jsx_id)) => Some(add(
            add(
                external_jsx_id,
                string_literal_expr(&format!(" {} ", static_class_name)),
            ),
            dynamic_class_name,
        )),
        (Some(static_class_name), Some(dynamic_class_name), None) => Some(add(
            string_literal_expr(&format!("{} ", static_class_name)),
            dynamic_class_name,
        )),
        (Some(static_class_name), None, Some(external_jsx_id)) => Some(add(
            string_literal_expr(&format!("{} ", static_class_name)),
            external_jsx_id,
        )),
        (None, Some(dynamic_class_name), Some(external_jsx_id)) => Some(add(
            add(external_jsx_id, string_literal_expr(" ")),
            dynamic_class_name,
        )),
        (Some(static_class_name), None, None) => Some(string_literal_expr(&static_class_name)),
        (None, Some(dynamic_class_name), None) => Some(dynamic_class_name),
        (None, None, Some(external_jsx_id)) => Some(external_jsx_id),
        _ => None,
    };

    (static_class_name, class_name_expr)
}

pub fn make_external_styled_jsx_el(style: &ExternalStyle, style_import_name: &str) -> JSXElement {
    let attrs = vec![JSXAttrOrSpread::JSXAttr(JSXAttr {
        name: JSXAttrName::Ident(Ident {
            sym: "id".into(),
            span: DUMMY_SP,
            optional: false,
        }),
        value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
            expr: JSXExpr::Expr(Box::new(style.expr.clone())),
            span: DUMMY_SP,
        })),
        span: DUMMY_SP,
    })];
    let opening = JSXOpeningElement {
        name: JSXElementName::Ident(Ident {
            sym: style_import_name.into(),
            span: DUMMY_SP,
            optional: false,
        }),
        attrs,
        span: DUMMY_SP,
        self_closing: false,
        type_args: None,
    };

    let closing = Some(JSXClosingElement {
        name: JSXElementName::Ident(Ident {
            sym: style_import_name.into(),
            span: DUMMY_SP,
            optional: false,
        }),
        span: DUMMY_SP,
    });

    let children = vec![JSXElementChild::JSXExprContainer(JSXExprContainer {
        expr: JSXExpr::Expr(Box::new(Expr::Ident(style.identifier.clone()))),
        span: DUMMY_SP,
    })];
    JSXElement {
        opening,
        closing,
        children,
        span: DUMMY_SP,
    }
}

pub fn make_local_styled_jsx_el(
    style_info: &LocalStyle,
    css_expr: Expr,
    style_import_name: &str,
    static_class_name: Option<&String>,
) -> JSXElement {
    let hash_input = match (&style_info.is_dynamic, &static_class_name) {
        (true, Some(class_name)) => format!("{}{}", style_info.hash, class_name),
        _ => style_info.hash.clone(),
    };
    let mut attrs = vec![JSXAttrOrSpread::JSXAttr(JSXAttr {
        name: JSXAttrName::Ident(Ident {
            sym: "id".into(),
            span: DUMMY_SP,
            optional: false,
        }),
        value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
            expr: JSXExpr::Expr(Box::new(string_literal_expr(
                hash_string(&hash_input).as_str(),
            ))),
            span: DUMMY_SP,
        })),
        span: DUMMY_SP,
    })];

    if style_info.is_dynamic {
        attrs.push(JSXAttrOrSpread::JSXAttr(JSXAttr {
            name: JSXAttrName::Ident(Ident {
                sym: "dynamic".into(),
                span: DUMMY_SP,
                optional: false,
            }),
            value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                expr: JSXExpr::Expr(Box::new(Expr::Array(ArrayLit {
                    elems: style_info
                        .expressions
                        .iter()
                        .map(|expression| {
                            Some(ExprOrSpread {
                                expr: expression.clone(),
                                spread: None,
                            })
                        })
                        .collect(),
                    span: DUMMY_SP,
                }))),
                span: DUMMY_SP,
            })),
            span: DUMMY_SP,
        }));
    }

    let opening = JSXOpeningElement {
        name: JSXElementName::Ident(Ident {
            sym: style_import_name.into(),
            span: DUMMY_SP,
            optional: false,
        }),
        attrs,
        span: DUMMY_SP,
        self_closing: false,
        type_args: None,
    };

    let closing = Some(JSXClosingElement {
        name: JSXElementName::Ident(Ident {
            sym: style_import_name.into(),
            span: DUMMY_SP,
            optional: false,
        }),
        span: DUMMY_SP,
    });

    let children = vec![JSXElementChild::JSXExprContainer(JSXExprContainer {
        expr: JSXExpr::Expr(Box::new(css_expr)),
        span: DUMMY_SP,
    })];
    JSXElement {
        opening,
        closing,
        children,
        span: DUMMY_SP,
    }
}

pub fn get_usable_import_specifier(_items: &[ModuleItem]) -> String {
    // TODO
    String::from("_JSXStyle")
}

pub fn styled_jsx_import_decl(style_import_name: &str) -> ModuleItem {
    ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
        asserts: None,
        span: DUMMY_SP,
        type_only: false,
        specifiers: vec![ImportSpecifier::Default(ImportDefaultSpecifier {
            local: Ident {
                sym: style_import_name.into(),
                span: DUMMY_SP,
                optional: false,
            },
            span: DUMMY_SP,
        })],
        src: Str {
            span: DUMMY_SP,
            value: "styled-jsx/style".into(),
            raw: None,
        },
    }))
}

// TODO: maybe use DJBHasher (need to implement)
pub fn hash_string(str: &str) -> String {
    let mut hasher = DefaultHasher::new();
    hasher.write(str.as_bytes());
    let hash_result = hasher.finish();
    format!("{:x}", hash_result)
}

pub fn string_literal_expr(str: &str) -> Expr {
    let str = str.replace("\\`", "`");
    Expr::Lit(Lit::Str(Str {
        value: str.into(),
        span: DUMMY_SP,
        raw: None,
    }))
}

pub fn ident(str: &str) -> Ident {
    Ident {
        sym: str.into(),
        span: DUMMY_SP,
        optional: false,
    }
}

pub fn is_capitalized(word: &str) -> bool {
    word.chars().next().unwrap().is_uppercase()
}

pub fn add(left: Expr, right: Expr) -> Expr {
    binary_expr(BinaryOp::Add, left, right)
}

pub fn and(left: Expr, right: Expr) -> Expr {
    binary_expr(BinaryOp::LogicalAnd, left, right)
}

pub fn or(left: Expr, right: Expr) -> Expr {
    binary_expr(BinaryOp::LogicalOr, left, right)
}

pub fn not_eq(left: Expr, right: Expr) -> Expr {
    binary_expr(BinaryOp::NotEq, left, right)
}

pub fn binary_expr(op: BinaryOp, left: Expr, right: Expr) -> Expr {
    Expr::Bin(BinExpr {
        op,
        left: Box::new(left),
        right: Box::new(right),
        span: DUMMY_SP,
    })
}
