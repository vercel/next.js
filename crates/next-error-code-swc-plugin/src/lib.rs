use std::fs;

use rustc_hash::FxHashMap;
use swc_core::{
    ecma::{ast::*, transforms::testing::test_inline, visit::*},
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
};

pub struct TransformVisitor {
    errors: FxHashMap<String, String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NewError {
    error_message: String,
}

fn is_error_class_name(name: &str) -> bool {
    // Error classes are collected by https://gist.github.com/eps1lon/6cce3059dfa061f2a7dc28305fdaddae#file-collect-error-constructors-mjs
    name == "AggregateError"
        // built-in error classes
        || name == "Error"
        || name == "EvalError"
        || name == "RangeError"
        || name == "ReferenceError"
        || name == "SyntaxError"
        || name == "TypeError"
        || name == "URIError"
        // custom error classes
        || name == "ApiError"
        || name == "BailoutToCSRError"
        || name == "BubbledError"
        || name == "CanaryOnlyError"
        || name == "Cancel"
        || name == "CompileError"
        || name == "CssSyntaxError"
        || name == "DecodeError"
        || name == "DynamicServerError"
        || name == "ExportError"
        || name == "FatalError"
        || name == "ImageError"
        || name == "InvariantError"
        || name == "ModuleBuildError"
        || name == "NestedMiddlewareError"
        || name == "NoFallbackError"
        || name == "NoSuchDeclarationError"
        || name == "PageSignatureError"
        || name == "PostCSSSyntaxError"
        || name == "ReadonlyHeadersError"
        || name == "ReadonlyRequestCookiesError"
        || name == "ReadonlyURLSearchParamsError"
        || name == "ResponseAborted"
        || name == "SerializableError"
        || name == "StaticGenBailoutError"
        || name == "TimeoutError"
        || name == "UnrecognizedActionError"
        || name == "Warning"
}

// Get the string representation of the first argument of `new Error(...)`
fn stringify_new_error_arg(expr: &Expr) -> String {
    match expr {
        Expr::Lit(lit) => match lit {
            Lit::Str(str_lit) => str_lit.value.to_string(),
            _ => "%s".to_string(),
        },

        Expr::Tpl(tpl) => {
            let mut result = String::new();
            let mut expr_iter = tpl.exprs.iter();

            for (_i, quasi) in tpl.quasis.iter().enumerate() {
                result.push_str(&quasi.raw);
                if let Some(expr) = expr_iter.next() {
                    result.push_str(&stringify_new_error_arg(expr));
                }
            }
            result
        }

        Expr::Bin(bin_expr) => {
            // Assume binary expression is always add for two strings
            format!(
                "{}{}",
                stringify_new_error_arg(&bin_expr.left),
                stringify_new_error_arg(&bin_expr.right)
            )
        }

        _ => "%s".to_string(),
    }
}

impl TransformVisitor {}

impl VisitMut for TransformVisitor {
    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        let mut error_message: Option<String> = None;

        // The first arg to `Object.defineProperty(new Error(...), "__NEXT_ERROR_CODE", { value:
        // "$code", enumerable: false })`
        let mut new_error_expr: Option<NewExpr> = None;

        // Find expressions like `new Error(...)` or `Error(...)`
        // And populate `error_message` and `new_error_expr` when found
        match expr {
            Expr::New(new_expr) => match &*new_expr.callee {
                Expr::Ident(ident) if is_error_class_name(ident.sym.as_str()) => {
                    if let Some(args) = &new_expr.args {
                        if let Some(first_arg) = args.first() {
                            new_error_expr = Some(new_expr.clone());
                            error_message = Some(stringify_new_error_arg(&first_arg.expr));
                        }
                    }
                }
                _ => {}
            },
            Expr::Call(call_expr) => match &call_expr.callee {
                Callee::Expr(expr) => match &**expr {
                    Expr::Ident(ident) if is_error_class_name(ident.sym.as_str()) => {
                        if let Some(first_arg) = call_expr.args.first() {
                            error_message = Some(stringify_new_error_arg(&first_arg.expr));

                            // For `Error(...)`, we convert it to `new Error(...)` to make the
                            // following code simpler
                            new_error_expr = Some(NewExpr {
                                span: call_expr.span,
                                callee: Box::new(Expr::Ident(ident.clone())),
                                args: Some(call_expr.args.clone()),
                                type_args: None,
                                ctxt: call_expr.ctxt,
                            });
                        }
                    }
                    _ => {}
                },
                _ => {}
            },
            _ => {}
        }

        if new_error_expr.is_none() || error_message.is_none() {
            assert!(
                new_error_expr.is_none() && error_message.is_none(),
                "Expected both new_error_expr and error_message to be None, but new_error_expr is \
                 {:?} and error_message is {:?}",
                new_error_expr,
                error_message
            );
            expr.visit_mut_children_with(self);
            return;
        }

        let new_error_expr: NewExpr = new_error_expr.unwrap();

        // Normalize line endings by converting Windows CRLF (\r\n) to Unix LF (\n)
        // This ensures the comparison works consistently across different operating systems
        let error_message = error_message.unwrap().replace("\r\n", "\n");

        let code = self.errors.iter().find_map(|(key, value)| {
            // We assume `errors.json` uses Unix LF (\n) as line endings
            if *value == error_message {
                Some(key)
            } else {
                None
            }
        });

        if code.is_none() {
            let new_error = serde_json::to_string(&NewError { error_message }).unwrap();

            let hash_hex = format!("{:x}", md5::compute(new_error.as_bytes()));
            let file_path = format!("cwd/.errors/{}.json", &hash_hex[0..8]);

            let _ = fs::create_dir_all("cwd/.errors");
            let _ = fs::write(&file_path, new_error);
        } else {
            let code = format!("E{}", code.unwrap());

            // Mutate to Object.defineProperty(new Error(...), "__NEXT_ERROR_CODE", { value:
            // "$code", enumerable: false })
            *expr = Expr::Call(CallExpr {
                span: new_error_expr.span,
                callee: Callee::Expr(Box::new(Expr::Member(MemberExpr {
                    span: new_error_expr.span,
                    obj: Box::new(Expr::Ident(Ident::new(
                        rcstr!("Object"),
                        new_error_expr.span,
                        Default::default(),
                    ))),
                    prop: MemberProp::Ident(rcstr!("defineProperty")),
                }))), // Object.defineProperty(
                args: vec![
                    ExprOrSpread {
                        spread: None,
                        expr: Box::new(Expr::New(new_error_expr.clone())), // new Error(...)
                    },
                    ExprOrSpread {
                        spread: None,
                        expr: Box::new(Expr::Lit(Lit::Str(Str {
                            span: new_error_expr.span,
                            value: rcstr!("__NEXT_ERROR_CODE"),
                            raw: None,
                        }))), // "__NEXT_ERROR_CODE"
                    },
                    ExprOrSpread {
                        spread: None,
                        expr: Box::new(Expr::Object(ObjectLit {
                            span: new_error_expr.span,
                            props: vec![
                                PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                                    key: PropName::Ident(rcstr!("value")),
                                    value: Box::new(Expr::Lit(Lit::Str(Str {
                                        span: new_error_expr.span,
                                        value: code.into(),
                                        raw: None,
                                    }))),
                                }))),
                                PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                                    key: PropName::Ident(rcstr!("enumerable")),
                                    value: Box::new(Expr::Lit(Lit::Bool(Bool {
                                        span: new_error_expr.span,
                                        value: false,
                                    }))),
                                }))),
                                PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                                    key: PropName::Ident(rcstr!("configurable")),
                                    value: Box::new(Expr::Lit(Lit::Bool(Bool {
                                        span: new_error_expr.span,
                                        value: true,
                                    }))),
                                }))),
                            ],
                        })), // { value: "$code", enumerable: false }
                    },
                ],
                type_args: None,
                ctxt: new_error_expr.ctxt,
            });
        }
    }
}

#[plugin_transform]
pub fn process_transform(
    mut program: Program,
    _metadata: TransformPluginProgramMetadata,
) -> Program {
    let errors_json = fs::read_to_string("/cwd/errors.json")
        .unwrap_or_else(|e| panic!("failed to read errors.json: {}", e));
    let errors: FxHashMap<String, String> = serde_json::from_str(&errors_json)
        .unwrap_or_else(|e| panic!("failed to parse errors.json: {}", e));

    let mut visitor = TransformVisitor { errors };

    visitor.visit_mut_program(&mut program);
    program
}

test_inline!(
    Default::default(),
    |_| visit_mut_pass(TransformVisitor {
        errors: FxHashMap::from_iter([
            ("1".to_string(), "Failed to fetch user %s: %s".to_string()),
            ("2".to_string(), "Request failed: %s".to_string()),
            ("3".to_string(), "Generic error".to_string()),
            ("4".to_string(), "Empty error".to_string()),
            (
                "5".to_string(),
                "Pattern should define hostname but found\n%s".to_string()
            ),
        ]),
    }),
    realistic_api_handler,
    // Input codes
    r#"
async function fetchUserData(userId) {
    try {
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch user ${userId}: ${response.statusText}`);
        }
        return await response.json();
    } catch (err) {
        throw new Error(`Request failed: ${err.message}`);
    }
}

function test1() {
    throw Error("Generic error");
}

function test2() {
    throw Error();
}

function test3() {
    throw new Error("Generic error");
}

function test4() {
    throw new Error();
    throw new Error("Pattern should define hostname but found\n" + JSON.stringify(pattern));
}"#,
    // Output codes after transformed with plugin
    r#"
async function fetchUserData(userId) {
    try {
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) {
            throw Object.defineProperty(new Error(`Failed to fetch user ${userId}: ${response.statusText}`), "__NEXT_ERROR_CODE", {
                value: "E1",
                enumerable: false,
                configurable: true
            });
        }
        return await response.json();
    } catch (err) {
        throw Object.defineProperty(new Error(`Request failed: ${err.message}`), "__NEXT_ERROR_CODE", {
            value: "E2",
            enumerable: false,
            configurable: true
        });
    }
}
function test1() {
    throw Object.defineProperty(new Error("Generic error"), "__NEXT_ERROR_CODE", {
        value: "E3",
        enumerable: false,
        configurable: true
    });
}
function test2() {
    throw Error();
}
function test3() {
    throw Object.defineProperty(new Error("Generic error"), "__NEXT_ERROR_CODE", {
        value: "E3",
        enumerable: false,
        configurable: true
    });
}
function test4() {
    throw new Error();
    throw Object.defineProperty(new Error("Pattern should define hostname but found\n" + JSON.stringify(pattern)), "__NEXT_ERROR_CODE", {
        value: "E5",
        enumerable: false,
        configurable: true
    });
}
"#
);
