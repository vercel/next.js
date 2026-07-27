use std::fs;

use rustc_hash::FxHashMap;
use swc_core::{
    common::{Span, SyntaxContext},
    ecma::{ast::*, transforms::testing::test_inline, visit::*},
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
};

pub struct TransformVisitor {
    errors: FxHashMap<String, String>,
    resolved_bindings: FxHashMap<Id, String>,
}

struct BindingCollector {
    bindings: FxHashMap<Id, String>,
}

impl Visit for BindingCollector {
    fn visit_var_declarator(&mut self, n: &VarDeclarator) {
        if let Pat::Ident(binding_ident) = &n.name {
            if let Some(init) = &n.init {
                let resolved = stringify_new_error_arg(init, &self.bindings);
                self.bindings.insert(binding_ident.to_id(), resolved);
            }
        }
        n.visit_children_with(self);
    }
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
        || name == "ImageError"
        || name == "InstantValidationError"
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

// Get the string representation of the message argument of `new Error(...)`
fn stringify_new_error_arg(expr: &Expr, bindings: &FxHashMap<Id, String>) -> String {
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
                    result.push_str(&stringify_new_error_arg(expr, bindings));
                }
            }
            result
        }

        Expr::Bin(bin_expr) => {
            format!(
                "{}{}",
                stringify_new_error_arg(&bin_expr.left, bindings),
                stringify_new_error_arg(&bin_expr.right, bindings)
            )
        }

        Expr::Ident(ident) => bindings
            .get(&ident.to_id())
            .cloned()
            .unwrap_or_else(|| "%s".to_string()),

        _ => "%s".to_string(),
    }
}

impl TransformVisitor {
    // Look up `error_message` in `errors.json`. On miss, spill to
    // `cwd/.errors/<hash>.json` so the check-error-codes consolidation step can
    // pick it up.
    fn lookup_or_emit(&self, error_message: String) -> Option<String> {
        // Normalize line endings by converting Windows CRLF (\r\n) to Unix LF (\n)
        // This ensures the comparison works consistently across different operating systems.
        // We assume `errors.json` uses Unix LF (\n) as line endings.
        let error_message = error_message.replace("\r\n", "\n");

        if let Some(code) = self
            .errors
            .iter()
            .find_map(|(key, value)| (*value == error_message).then_some(key))
        {
            return Some(format!("E{}", code));
        }

        let new_error = serde_json::to_string(&NewError { error_message }).unwrap();
        let hash_hex = format!("{:x}", md5::compute(new_error.as_bytes()));
        let file_path = format!("cwd/.errors/{}.json", &hash_hex[0..8]);

        let _ = fs::create_dir_all("cwd/.errors");
        let _ = fs::write(&file_path, new_error);

        None
    }

    // Build `Object.defineProperty(<target>, "__NEXT_ERROR_CODE", { value:
    // "<code>", enumerable: false, configurable: true })`.
    fn build_define_property_call(
        &self,
        span: Span,
        ctxt: SyntaxContext,
        code: String,
        target: Box<Expr>,
    ) -> CallExpr {
        CallExpr {
            span,
            callee: Callee::Expr(Box::new(Expr::Member(MemberExpr {
                span,
                obj: Box::new(Expr::Ident(Ident::new(
                    "Object".into(),
                    span,
                    Default::default(),
                ))),
                prop: MemberProp::Ident("defineProperty".into()),
            }))),
            args: vec![
                ExprOrSpread {
                    spread: None,
                    expr: target,
                },
                ExprOrSpread {
                    spread: None,
                    expr: Box::new(Expr::Lit(Lit::Str(Str {
                        span,
                        value: "__NEXT_ERROR_CODE".into(),
                        raw: None,
                    }))),
                },
                ExprOrSpread {
                    spread: None,
                    expr: Box::new(Expr::Object(ObjectLit {
                        span,
                        props: vec![
                            PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                                key: PropName::Ident("value".into()),
                                value: Box::new(Expr::Lit(Lit::Str(Str {
                                    span,
                                    value: code.into(),
                                    raw: None,
                                }))),
                            }))),
                            PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                                key: PropName::Ident("enumerable".into()),
                                value: Box::new(Expr::Lit(Lit::Bool(Bool { span, value: false }))),
                            }))),
                            PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                                key: PropName::Ident("configurable".into()),
                                value: Box::new(Expr::Lit(Lit::Bool(Bool { span, value: true }))),
                            }))),
                        ],
                    })),
                },
            ],
            type_args: None,
            ctxt,
        }
    }
}

impl VisitMut for TransformVisitor {
    fn visit_mut_program(&mut self, program: &mut Program) {
        let mut collector = BindingCollector {
            bindings: FxHashMap::default(),
        };
        program.visit_with(&mut collector);
        self.resolved_bindings = collector.bindings;
        program.visit_mut_children_with(self);
    }

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
                        // AggregateError(errors, message) has the message as the second arg
                        let message_arg_index = if ident.sym.as_str() == "AggregateError" {
                            1
                        } else {
                            0
                        };
                        if let Some(message_arg) = args.get(message_arg_index) {
                            new_error_expr = Some(new_expr.clone());
                            error_message = Some(stringify_new_error_arg(
                                &message_arg.expr,
                                &self.resolved_bindings,
                            ));
                        }
                    }
                }
                _ => {}
            },
            Expr::Call(call_expr) => match &call_expr.callee {
                Callee::Expr(expr) => match &**expr {
                    Expr::Ident(ident) if is_error_class_name(ident.sym.as_str()) => {
                        // AggregateError(errors, message) has the message as the second arg
                        let message_arg_index = if ident.sym.as_str() == "AggregateError" {
                            1
                        } else {
                            0
                        };
                        if let Some(message_arg) = call_expr.args.get(message_arg_index) {
                            error_message = Some(stringify_new_error_arg(
                                &message_arg.expr,
                                &self.resolved_bindings,
                            ));

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
        let error_message = error_message.unwrap();

        if let Some(code) = self.lookup_or_emit(error_message) {
            let span = new_error_expr.span;
            let ctxt = new_error_expr.ctxt;
            let call = self.build_define_property_call(
                span,
                ctxt,
                code,
                Box::new(Expr::New(new_error_expr)),
            );
            *expr = Expr::Call(call);
        }
    }

    fn visit_mut_class(&mut self, class: &mut Class) {
        // Visit children first so any `new Error(...)` inside methods is still
        // rewritten by `visit_mut_expr`.
        class.visit_mut_children_with(self);

        // Only classes that extend a recognized Error class.
        let super_class_name = match class.super_class.as_deref() {
            Some(Expr::Ident(ident)) if is_error_class_name(ident.sym.as_str()) => {
                ident.sym.as_str()
            }
            _ => return,
        };

        // `AggregateError(errors, message)` takes the message as the second
        // argument. All other recognized error classes take it as the first.
        let message_arg_index = if super_class_name == "AggregateError" {
            1
        } else {
            0
        };

        // Skip the injection if the class already declares `__NEXT_ERROR_CODE`
        // itself. This respects manual overrides in classes whose code can't
        // be derived statically from the `super(...)` message.
        let declares_error_code = class.body.iter().any(|member| match member {
            ClassMember::ClassProp(prop) => matches!(
                &prop.key,
                PropName::Ident(ident) if ident.sym.as_str() == "__NEXT_ERROR_CODE"
            ),
            _ => false,
        });
        if declares_error_code {
            return;
        }

        // Find the first constructor with a body.
        let ctor = class.body.iter_mut().find_map(|member| match member {
            ClassMember::Constructor(Constructor { body: Some(_), .. }) => {
                if let ClassMember::Constructor(ctor) = member {
                    Some(ctor)
                } else {
                    None
                }
            }
            _ => None,
        });
        let Some(ctor) = ctor else {
            return;
        };
        let Some(body) = ctor.body.as_mut() else {
            return;
        };

        // Locate the first top-level `super(arg)` statement.
        let mut super_index: Option<usize> = None;
        let mut super_info: Option<(Span, SyntaxContext, String)> = None;
        for (i, stmt) in body.stmts.iter().enumerate() {
            if let Stmt::Expr(ExprStmt { expr, .. }) = stmt
                && let Expr::Call(CallExpr {
                    callee: Callee::Super(_),
                    args,
                    span,
                    ctxt,
                    ..
                }) = &**expr
                && let Some(message_arg) = args.get(message_arg_index)
                && message_arg.spread.is_none()
            {
                let message = stringify_new_error_arg(&message_arg.expr, &self.resolved_bindings);
                super_index = Some(i);
                super_info = Some((*span, *ctxt, message));
                break;
            }
        }

        let Some(stmt_index) = super_index else {
            return;
        };
        let (span, ctxt, message) = super_info.unwrap();

        let Some(code) = self.lookup_or_emit(message) else {
            return;
        };

        // Insert `Object.defineProperty(this, "__NEXT_ERROR_CODE", { ... })`
        // immediately after the super call.
        let call = self.build_define_property_call(
            span,
            ctxt,
            code,
            Box::new(Expr::This(ThisExpr { span })),
        );
        let new_stmt = Stmt::Expr(ExprStmt {
            span,
            expr: Box::new(Expr::Call(call)),
        });
        body.stmts.insert(stmt_index + 1, new_stmt);
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

    let mut visitor = TransformVisitor {
        errors,
        resolved_bindings: FxHashMap::default(),
    };

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
            (
                "6".to_string(),
                "This is an extracted error message.".to_string()
            ),
        ]),
        resolved_bindings: FxHashMap::default(),
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
}

const extractedErrorMessage = 'This is an extracted error message.';

function test5() {
    throw new Error(extractedErrorMessage);
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
const extractedErrorMessage = 'This is an extracted error message.';
function test5() {
    throw Object.defineProperty(new Error(extractedErrorMessage), "__NEXT_ERROR_CODE", {
        value: "E6",
        enumerable: false,
        configurable: true
    });
}
"#
);

test_inline!(
    Default::default(),
    |_| visit_mut_pass(TransformVisitor {
        errors: FxHashMap::from_iter([
            ("7".to_string(), "Timeout reached".to_string()),
            ("8".to_string(), "Prefix: %s".to_string()),
        ]),
        resolved_bindings: FxHashMap::default(),
    }),
    subclass_super_messages,
    // Input codes
    r#"
class LiteralSuper extends Error {
    constructor() {
        super("Timeout reached");
    }
}

class TemplateSuper extends Error {
    constructor(x) {
        super(`Prefix: ${x}`);
    }
}

class ExtendsKnownSubclass extends ApiError {
    constructor() {
        super("Timeout reached");
        this.extra = 1;
    }
}

class NoCtor extends Error {}

class SpreadSuper extends Error {
    constructor(...args) {
        super(...args);
    }
}

class ExtendsUnknown extends Foo {
    constructor() {
        super("Timeout reached");
    }
}

class SuperInIf extends Error {
    constructor(cond) {
        if (cond) {
            super("Timeout reached");
        } else {
            super("Timeout reached");
        }
    }
}

class UnknownMessage extends Error {
    constructor() {
        super("Not in errors.json");
    }
}

class AggregateSubclass extends AggregateError {
    constructor(errors) {
        super(errors, "Timeout reached");
    }
}

class ManualErrorCode extends Error {
    __NEXT_ERROR_CODE = 'Manual';
    constructor(message) {
        super(message);
    }
}
"#,
    // Output codes after transformed with plugin
    r#"
class LiteralSuper extends Error {
    constructor(){
        super("Timeout reached");
        Object.defineProperty(this, "__NEXT_ERROR_CODE", {
            value: "E7",
            enumerable: false,
            configurable: true
        });
    }
}
class TemplateSuper extends Error {
    constructor(x){
        super(`Prefix: ${x}`);
        Object.defineProperty(this, "__NEXT_ERROR_CODE", {
            value: "E8",
            enumerable: false,
            configurable: true
        });
    }
}
class ExtendsKnownSubclass extends ApiError {
    constructor(){
        super("Timeout reached");
        Object.defineProperty(this, "__NEXT_ERROR_CODE", {
            value: "E7",
            enumerable: false,
            configurable: true
        });
        this.extra = 1;
    }
}
class NoCtor extends Error {
}
class SpreadSuper extends Error {
    constructor(...args){
        super(...args);
    }
}
class ExtendsUnknown extends Foo {
    constructor(){
        super("Timeout reached");
    }
}
class SuperInIf extends Error {
    constructor(cond){
        if (cond) {
            super("Timeout reached");
        } else {
            super("Timeout reached");
        }
    }
}
class UnknownMessage extends Error {
    constructor(){
        super("Not in errors.json");
    }
}
class AggregateSubclass extends AggregateError {
    constructor(errors){
        super(errors, "Timeout reached");
        Object.defineProperty(this, "__NEXT_ERROR_CODE", {
            value: "E7",
            enumerable: false,
            configurable: true
        });
    }
}
class ManualErrorCode extends Error {
    __NEXT_ERROR_CODE = 'Manual';
    constructor(message){
        super(message);
    }
}
"#
);
