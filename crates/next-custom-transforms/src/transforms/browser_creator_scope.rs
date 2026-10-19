//! Browser test creator cells. This pass only adds body entry to an explicit
//! synchronous subset and never replaces a function/method object or parameters.
use anyhow::{Result, bail};
use swc_core::{
    common::{DUMMY_SP, SyntaxContext, util::take::Take},
    ecma::{
        ast::*,
        utils::{private_ident, quote_ident},
        visit::{Visit, VisitMut, VisitMutWith, VisitWith},
    },
    quote,
};

pub const CREATOR_BRIDGE: &str = "private-next-test-creator-scope";

/// Only parser-authored input reaches this check; generated bridge imports are
/// added afterwards. Resolution/issuer checks must additionally run on the graph.
pub fn browser_creator_scope(program: &mut Program) -> Result<usize> {
    let mut admission = Admission::default();
    program.visit_with(&mut admission);
    if let Some(reason) = admission.error {
        bail!("Browser creator source HOLD: {reason}");
    }
    if !matches!(program, Program::Module(_)) {
        bail!("Browser creator source HOLD: script/Annex-B semantics");
    }
    let mut pass = CreatorPass {
        capture: private_ident!("__next_creator_capture"),
        enter: private_ident!("__next_creator_enter"),
        pending: Vec::new(),
        error: None,
        count: 0,
        in_parameters: false,
        in_inline_body: false,
        repeated: false,
        function_depth: 0,
        suspended: false,
        labeled_loop: false,
    };
    program.visit_mut_with(&mut pass);
    if let Some(reason) = pass.error {
        bail!("Browser creator source HOLD: {reason}");
    }
    if pass.count != 0 {
        let mut import = quote!(
            "import { captureCreatorScope as $capture, enterCreatorScope as $enter } from \
             'private-next-test-creator-scope';" as ModuleItem,
            capture = pass.capture,
            enter = pass.enter
        );
        if let ModuleItem::ModuleDecl(ModuleDecl::Import(decl)) = &mut import {
            decl.span = DUMMY_SP;
            decl.src.span = DUMMY_SP;
        }
        if let Program::Module(module) = program {
            module.body.insert(0, import);
        }
    }
    Ok(pass.count)
}

/// Keep strict-block declaration names when final hygiene renames their bindings.
/// Function bodies have a different visitor and keep ordinary declaration emission.
pub fn preserve_browser_block_function_names(
    program: &mut Program,
    unresolved_ctxt: SyntaxContext,
) -> usize {
    struct BlockFunctionNames {
        unresolved_ctxt: SyntaxContext,
        count: usize,
    }
    impl VisitMut for BlockFunctionNames {
        fn visit_mut_function_body(&mut self, body: &mut FunctionBody) {
            // Visit nested blocks without adding operations to function-body scope.
            body.visit_mut_children_with(self);
        }
        fn visit_mut_block_stmt(&mut self, block: &mut BlockStmt) {
            block.visit_mut_children_with(self);
            let names: Vec<_> = block
                .stmts
                .iter()
                .filter_map(|statement| match statement {
                    Stmt::Decl(Decl::Fn(declaration)) if declaration.function.body.is_some() => {
                        Some(quote!(
                            "$object[\"defineProperty\"]($function, \"name\", { value: $name });"
                                as Stmt,
                            object = quote_ident!(self.unresolved_ctxt, "Object"),
                            function = declaration.ident.clone(),
                            name: Expr = declaration.ident.sym.to_string().into(),
                        ))
                    }
                    _ => None,
                })
                .collect();
            self.count += names.len();
            // The function binding is initialized on block entry, before any
            // authored call or name read, including on every loop iteration.
            let directives = block.stmts.iter().take_while(|stmt| matches!(stmt, Stmt::Expr(expr) if matches!(&*expr.expr, Expr::Lit(Lit::Str(_))))).count();
            block.stmts.splice(directives..directives, names);
        }
    }
    let mut pass = BlockFunctionNames {
        unresolved_ctxt,
        count: 0,
    };
    program.visit_mut_with(&mut pass);
    pass.count
}

/// Validate the actual post-transform AST, not a caller-supplied mode flag.
/// Parser-authored imports have real spans and cannot manufacture private SWC
/// syntax contexts. Only this pass inserts the exact two-binding dummy import.
pub fn validate_creator_import(program: &Program) -> Result<bool> {
    let Program::Module(module) = program else {
        return Ok(false);
    };
    let mut found = false;
    for item in &module.body {
        let ModuleItem::ModuleDecl(ModuleDecl::Import(import)) = item else {
            continue;
        };
        if import.src.value != CREATOR_BRIDGE {
            continue;
        }
        if found
            || import.span != DUMMY_SP
            || import.src.span != DUMMY_SP
            || import.specifiers.len() != 2
        {
            bail!("Browser creator certificate refuses an authored/duplicate bridge import");
        }
        let mut names = Vec::new();
        for specifier in &import.specifiers {
            let ImportSpecifier::Named(named) = specifier else {
                bail!("Browser creator certificate requires exact compiler bindings");
            };
            let Some(ModuleExportName::Ident(imported)) = &named.imported else {
                bail!("Browser creator certificate requires exact compiler binding names");
            };
            if named.is_type_only
                || named.local.ctxt == Default::default()
                || !named.local.sym.starts_with("__next_creator_")
            {
                bail!("Browser creator certificate refuses unissued binding identity");
            }
            names.push(imported.sym.as_ref());
        }
        if names != ["captureCreatorScope", "enterCreatorScope"] {
            bail!("Browser creator certificate requires capture/entry bindings");
        }
        found = true;
    }
    Ok(found)
}

// These wrappers retain a binding reference when erased. Comma/property/
// optional calls intentionally stop: they are not direct eval lexical access.
fn transparent_callee_ident(expression: &Expr) -> Option<&Ident> {
    match expression {
        Expr::Ident(ident) => Some(ident),
        Expr::Paren(value) => transparent_callee_ident(&value.expr),
        Expr::TsAs(value) => transparent_callee_ident(&value.expr),
        Expr::TsSatisfies(value) => transparent_callee_ident(&value.expr),
        Expr::TsTypeAssertion(value) => transparent_callee_ident(&value.expr),
        Expr::TsConstAssertion(value) => transparent_callee_ident(&value.expr),
        Expr::TsNonNull(value) => transparent_callee_ident(&value.expr),
        Expr::TsInstantiation(value) => transparent_callee_ident(&value.expr),
        _ => None,
    }
}

#[derive(Default)]
struct Admission {
    error: Option<&'static str>,
}
impl Admission {
    fn request(&mut self, value: &str) {
        if value == CREATOR_BRIDGE || value.contains("experimental/testing/client/") {
            self.error
                .get_or_insert("authored private creator/runtime request");
        }
    }
}
impl Visit for Admission {
    fn visit_ident(&mut self, ident: &Ident) {
        if ident.sym.starts_with("__next_creator_") || ident.sym.starts_with("__turbopack_") {
            self.error.get_or_insert("reserved compiler identifier");
        }
    }
    fn visit_import_decl(&mut self, node: &ImportDecl) {
        self.request(&node.src.value.to_string_lossy());
        node.visit_children_with(self);
    }
    fn visit_named_export(&mut self, node: &NamedExport) {
        if let Some(src) = &node.src {
            self.request(&src.value.to_string_lossy());
        }
        node.visit_children_with(self);
    }
    fn visit_export_all(&mut self, node: &ExportAll) {
        self.request(&node.src.value.to_string_lossy());
        node.visit_children_with(self);
    }
    fn visit_call_expr(&mut self, node: &CallExpr) {
        let request = match &node.callee {
            Callee::Import(_) => true,
            Callee::Expr(expr) => match transparent_callee_ident(expr) {
                Some(ident) if ident.sym == *"eval" => {
                    self.error.get_or_insert("direct eval lexical transparency");
                    false
                }
                Some(ident) => ident.sym == *"require",
                None => false,
            },
            _ => false,
        };
        if request {
            match node
                .args
                .first()
                .filter(|arg| arg.spread.is_none())
                .map(|arg| &*arg.expr)
            {
                Some(Expr::Lit(Lit::Str(value))) => self.request(&value.value.to_string_lossy()),
                _ => {
                    self.error.get_or_insert("computed/indirect module request");
                }
            }
        }
        node.visit_children_with(self);
    }
}

struct CreatorPass {
    capture: Ident,
    enter: Ident,
    pending: Vec<Stmt>,
    error: Option<&'static str>,
    count: usize,
    in_parameters: bool,
    in_inline_body: bool,
    repeated: bool,
    function_depth: usize,
    suspended: bool,
    labeled_loop: bool,
}
impl CreatorPass {
    fn cell(&mut self) -> Ident {
        if self.suspended {
            self.error
                .get_or_insert("suspended creator evaluation before cell placement");
        }
        if self.in_parameters || self.in_inline_body || self.repeated {
            self.error
                .get_or_insert("creator placement in parameters/concise arrow/repeated header");
        }
        let cell = private_ident!("__next_creator_cell");
        self.pending.push(quote!(
            "const $cell = $capture();" as Stmt,
            cell = cell.clone(),
            capture = self.capture.clone()
        ));
        cell
    }
    fn simple(&mut self, params: &[Param]) {
        if params.iter().any(|param| !simple_pattern(&param.pat)) {
            self.error
                .get_or_insert("parameter initialization/destructuring before entry");
        }
    }
    fn body(&mut self, body: &mut FunctionBody, cell: &Ident) {
        let leave = private_ident!("__next_creator_leave");
        let prologue = quote!(
            "const $leave = $enter($cell);" as Stmt,
            leave = leave.clone(),
            enter = self.enter.clone(),
            cell = cell.clone()
        );
        if body
            .stmts
            .iter()
            .any(|stmt| matches!(stmt, Stmt::Decl(Decl::Fn(_))))
        {
            self.error
                .get_or_insert("function-body declaration hoisting through finally");
        }
        let directives = body.stmts.iter().take_while(|stmt| matches!(stmt, Stmt::Expr(expr) if matches!(&*expr.expr, Expr::Lit(Lit::Str(_))))).count();
        let rest = body.stmts.split_off(directives);
        body.stmts.push(prologue);
        body.stmts.push(Stmt::Try(Box::new(TryStmt {
            span: DUMMY_SP,
            block: BlockStmt {
                stmts: rest,
                ..Default::default()
            },
            handler: None,
            finalizer: Some(BlockStmt {
                stmts: vec![quote!("$leave();" as Stmt, leave = leave)],
                ..Default::default()
            }),
        })));
        self.count += 1;
    }
    fn class(&mut self, class: &mut Class) {
        if class.body.iter().any(|member| {
            matches!(
                member,
                ClassMember::StaticBlock(_)
                    | ClassMember::ClassProp(_)
                    | ClassMember::PrivateProp(_)
                    | ClassMember::Constructor(_)
            )
        }) {
            self.error.get_or_insert(
                "class constructor/field/static evaluation requires separate placement proof",
            );
        }
        class.visit_mut_children_with(self);
        let supported = class.body.iter().any(|member| match member {
            ClassMember::Method(method) => {
                !method.function.is_async && !method.function.is_generator
            }
            ClassMember::PrivateMethod(method) => {
                !method.function.is_async && !method.function.is_generator
            }
            _ => false,
        });
        if !supported {
            return;
        }
        let cell = self.cell();
        for member in &mut class.body {
            match member {
                ClassMember::Method(method)
                    if !method.function.is_async && !method.function.is_generator =>
                {
                    self.function(&mut method.function, &cell)
                }
                ClassMember::PrivateMethod(method)
                    if !method.function.is_async && !method.function.is_generator =>
                {
                    self.function(&mut method.function, &cell)
                }
                _ => {}
            }
        }
    }
    fn function(&mut self, function: &mut Function, cell: &Ident) {
        self.simple(&function.params);
        if let Some(body) = &mut function.body {
            self.body(body, cell);
        }
    }
}
fn simple_pattern(pattern: &Pat) -> bool {
    matches!(pattern, Pat::Ident(_))
        || matches!(pattern, Pat::Rest(rest) if matches!(&*rest.arg, Pat::Ident(_)))
}
impl VisitMut for CreatorPass {
    fn visit_mut_module_items(&mut self, items: &mut Vec<ModuleItem>) {
        let outer = self.pending.take();
        let mut output = Vec::with_capacity(items.len());
        for mut item in items.take() {
            let suspended = self.suspended;
            self.suspended = false;
            match &mut item {
                ModuleItem::Stmt(statement) => statement.visit_mut_children_with(self),
                ModuleItem::ModuleDecl(declaration) => declaration.visit_mut_children_with(self),
            }
            self.suspended = suspended;
            output.extend(self.pending.take().into_iter().map(ModuleItem::Stmt));
            output.push(item);
        }
        *items = output;
        self.pending = outer;
    }
    fn visit_mut_stmts(&mut self, statements: &mut Vec<Stmt>) {
        let outer = self.pending.take();
        let mut output = Vec::with_capacity(statements.len());
        for mut statement in statements.take() {
            let suspended = self.suspended;
            self.suspended = false;
            statement.visit_mut_children_with(self);
            self.suspended = suspended;
            output.extend(self.pending.take());
            output.push(statement);
        }
        *statements = output;
        self.pending = outer;
    }
    fn visit_mut_stmt(&mut self, statement: &mut Stmt) {
        let outer = self.pending.take();
        let suspended = self.suspended;
        self.suspended = false;
        statement.visit_mut_children_with(self);
        self.suspended = suspended;
        let mut captures = self.pending.take();
        if !captures.is_empty() {
            captures.push(statement.take());
            *statement = Stmt::Block(BlockStmt {
                stmts: captures,
                ..Default::default()
            });
        }
        self.pending = outer;
    }
    fn visit_mut_function(&mut self, function: &mut Function) {
        let parameters = self.in_parameters;
        let inline = self.in_inline_body;
        let repeated = self.repeated;
        let suspended = self.suspended;
        let labeled = self.labeled_loop;
        self.suspended = false;
        self.labeled_loop = false;
        self.in_parameters = true;
        function.params.visit_mut_with(self);
        self.in_parameters = false;
        self.in_inline_body = false;
        self.repeated = false;
        self.function_depth += 1;
        function.body.visit_mut_with(self);
        self.function_depth -= 1;
        self.in_parameters = parameters;
        self.in_inline_body = inline;
        self.repeated = repeated;
        self.suspended = suspended;
        self.labeled_loop = labeled;
    }
    fn visit_mut_arrow_expr(&mut self, arrow: &mut ArrowExpr) {
        let parameters = self.in_parameters;
        let inline = self.in_inline_body;
        let repeated = self.repeated;
        let suspended = self.suspended;
        let labeled = self.labeled_loop;
        self.suspended = false;
        self.labeled_loop = false;
        self.in_parameters = true;
        arrow.params.visit_mut_with(self);
        self.in_parameters = false;
        self.repeated = false;
        self.in_inline_body = matches!(&*arrow.body, ArrowFunctionBody::Expr(_));
        self.function_depth += 1;
        arrow.body.visit_mut_with(self);
        self.function_depth -= 1;
        self.in_parameters = parameters;
        self.in_inline_body = inline;
        self.repeated = repeated;
        self.suspended = suspended;
        self.labeled_loop = labeled;
    }
    fn visit_mut_fn_decl(&mut self, declaration: &mut FnDecl) {
        // Declarations keep their original lexical scope and normal hoisting.
        // Only visit their children; this handler does not wrap the declaration.
        declaration.visit_mut_children_with(self);
    }
    fn visit_mut_fn_expr(&mut self, expression: &mut FnExpr) {
        expression.visit_mut_children_with(self);
        if !expression.function.is_async && !expression.function.is_generator {
            let cell = self.cell();
            self.function(&mut expression.function, &cell);
        }
    }
    fn visit_mut_class_decl(&mut self, declaration: &mut ClassDecl) {
        self.class(&mut declaration.class);
    }
    fn visit_mut_class_expr(&mut self, expression: &mut ClassExpr) {
        self.class(&mut expression.class);
    }
    fn visit_mut_object_lit(&mut self, object: &mut ObjectLit) {
        object.visit_mut_children_with(self);
        let supported = object.props.iter().any(|prop| match prop {
            PropOrSpread::Prop(prop) => match &**prop {
                Prop::Method(method) => !method.function.is_async && !method.function.is_generator,
                Prop::Getter(_) | Prop::Setter(_) => true,
                _ => false,
            },
            _ => false,
        });
        if !supported {
            return;
        }
        let cell = self.cell();
        for prop in &mut object.props {
            if let PropOrSpread::Prop(prop) = prop {
                match &mut **prop {
                    Prop::Method(method)
                        if !method.function.is_async && !method.function.is_generator =>
                    {
                        self.function(&mut method.function, &cell)
                    }
                    Prop::Getter(getter) => self.function(&mut getter.function, &cell),
                    Prop::Setter(setter) => self.function(&mut setter.function, &cell),
                    _ => {}
                }
            }
        }
    }
    fn visit_mut_await_expr(&mut self, expression: &mut AwaitExpr) {
        // The operand is evaluated before suspension, including its creators.
        expression.arg.visit_mut_with(self);
        self.suspended = true;
    }
    fn visit_mut_yield_expr(&mut self, expression: &mut YieldExpr) {
        expression.arg.visit_mut_with(self);
        self.suspended = true;
    }
    fn visit_mut_labeled_stmt(&mut self, statement: &mut LabeledStmt) {
        let previous = self.labeled_loop;
        self.labeled_loop = matches!(
            &*statement.body,
            Stmt::For(_) | Stmt::ForIn(_) | Stmt::ForOf(_) | Stmt::While(_) | Stmt::DoWhile(_)
        );
        statement.body.visit_mut_with(self);
        self.labeled_loop = previous;
    }
    fn visit_mut_catch_clause(&mut self, clause: &mut CatchClause) {
        let previous = self.in_parameters;
        self.in_parameters = true;
        clause.param.visit_mut_with(self);
        self.in_parameters = previous;
        clause.body.visit_mut_with(self);
    }
    fn visit_mut_while_stmt(&mut self, statement: &mut WhileStmt) {
        let previous = self.repeated;
        let labeled = self.labeled_loop;
        self.repeated = true;
        statement.test.visit_mut_with(self);
        self.repeated = previous;
        self.labeled_loop = false;
        statement.body.visit_mut_with(self);
        self.labeled_loop = labeled;
    }
    fn visit_mut_do_while_stmt(&mut self, statement: &mut DoWhileStmt) {
        let labeled = self.labeled_loop;
        self.labeled_loop = false;
        statement.body.visit_mut_with(self);
        self.labeled_loop = labeled;
        let previous = self.repeated;
        self.repeated = true;
        statement.test.visit_mut_with(self);
        self.repeated = previous;
    }
    fn visit_mut_for_stmt(&mut self, statement: &mut ForStmt) {
        let previous = self.repeated;
        let labeled = self.labeled_loop;
        self.repeated |= labeled;
        statement.init.visit_mut_with(self);
        self.repeated = true;
        statement.test.visit_mut_with(self);
        statement.update.visit_mut_with(self);
        self.repeated = previous;
        self.labeled_loop = false;
        statement.body.visit_mut_with(self);
        self.labeled_loop = labeled;
    }
    fn visit_mut_for_in_stmt(&mut self, statement: &mut ForInStmt) {
        let previous = self.repeated;
        let labeled = self.labeled_loop;
        self.repeated = true;
        statement.left.visit_mut_with(self);
        self.repeated = previous || labeled;
        statement.right.visit_mut_with(self);
        self.repeated = previous;
        self.labeled_loop = false;
        statement.body.visit_mut_with(self);
        self.labeled_loop = labeled;
    }
    fn visit_mut_for_of_stmt(&mut self, statement: &mut ForOfStmt) {
        let previous = self.repeated;
        let labeled = self.labeled_loop;
        self.repeated = true;
        statement.left.visit_mut_with(self);
        self.repeated = previous || labeled;
        statement.right.visit_mut_with(self);
        self.repeated = previous;
        self.labeled_loop = false;
        statement.body.visit_mut_with(self);
        self.labeled_loop = labeled;
    }
}

#[cfg(test)]
mod tests {
    use swc_core::{
        common::{FileName, GLOBALS, SourceMap},
        ecma::{
            codegen::to_code,
            parser::{Syntax, parse_file_as_module},
        },
    };

    use super::*;

    fn parse(source: &str) -> Program {
        let map = SourceMap::default();
        let file = map.new_source_file(
            FileName::Custom("creator-input.mjs".into()).into(),
            source.to_owned(),
        );
        Program::Module(
            parse_file_as_module(
                &file,
                Syntax::default(),
                EsVersion::latest(),
                None,
                &mut vec![],
            )
            .expect("valid authored module"),
        )
    }
    fn transformed(source: &str) -> Result<(Program, usize)> {
        let mut program = parse(source);
        let count = browser_creator_scope(&mut program)?;
        Ok((program, count))
    }
    #[test]
    fn transforms_actual_original_fixture_without_renaming_methods_or_parameters() {
        GLOBALS.set(&Default::default(), || {
            let source = include_str!(
                "../../../../test/unit/app-dir/next-testing-stable-release-gaps/fixtures/\
                 browser-promise-await-observability/contract.case.mjs"
            );
            let (program, count) = transformed(source).unwrap();
            assert!(count >= 3);
            assert!(validate_creator_import(&program).unwrap());
            let output = to_code(&program);
            assert!(output.contains("then(...args)"));
            assert!(output.contains("super.then(...args)"));
            assert!(output.contains("return function(...args)"));
            assert!(output.contains("finally"));
            assert!(output.contains("captureCreatorScope as __next_creator_capture"));
        });
    }
    #[test]
    fn generated_import_is_private_and_authored_or_copied_import_is_not_a_certificate() {
        GLOBALS.set(&Default::default(), || {
            let (program, count) = transformed(
                "export function make(){ return function named(a,...rest){ return \
                 [this,a,rest,new.target] } }",
            )
            .unwrap();
            assert_eq!(count, 1);
            assert!(validate_creator_import(&program).unwrap());
            // Code generation/parsing intentionally loses the private native identity.
            let copied = parse(&to_code(&program));
            assert!(validate_creator_import(&copied).is_err());
            assert!(!validate_creator_import(&parse("export const value = 1")).unwrap());
        });
    }
    #[test]
    fn all_authored_private_request_spellings_refuse_without_a_creator_grant() {
        GLOBALS.set(&Default::default(), || {
            for source in [
                "import { captureCreatorScope } from 'private-next-test-creator-scope'",
                "export { captureCreatorScope } from 'private-next-test-creator-scope'",
                "export * from 'private-next-test-creator-scope'",
                "import('private-next-test-creator-scope')",
                "require('private-next-test-creator-scope')",
                "require('next/dist/experimental/testing/client/async-context.js')",
                "import('next/dist/experimental/testing/client/async-context.js')",
                "require('private-next-test-' + 'creator-scope')",
                "import(['private-next-test-creator-scope'][0])",
                "const __next_creator_capture = () => 1",
                "__turbopack_context__.r('anything')",
            ] {
                assert!(transformed(source).is_err(), "must refuse {source}");
            }
        });
    }
    #[test]
    fn unsupported_semantic_shapes_hold_instead_of_changing_initialization_or_hoisting() {
        GLOBALS.set(&Default::default(), || {
            for source in [
                "function f(){ return function(a=read()){ return a } }",
                "function f(){ return function({a}){ return a } }",
                "function f(){ return function(){ function g(){}; return g } }",
                "const f = () => ({ method(){} })",
                "while ({ method(){} }) break",
                "class C { static x = read(); method(){} }",
                "async function f(){ class C extends (await base) { method(){} } }",
                "async function f(){ const value = [(await first), { method(){} }] }",
                "function f(){ return function(){ return eval('cell') } }",
            ] {
                assert!(transformed(source).is_err(), "must HOLD {source}");
            }
        });
    }
    #[test]
    fn transparent_direct_eval_refuses_but_indirect_and_optional_keep_their_kind() {
        GLOBALS.set(&Default::default(), || {
            for callee in [
                "(eval)",
                "((eval))",
                "(eval as typeof eval)",
                "(eval satisfies typeof eval)",
                "(<typeof eval>eval)",
                "eval!",
                "(eval!)",
            ] {
                let source = format!(
                    "export const f = function ordinary(){{ return {callee}('typeof \
                     __next_creator_leave') }}"
                );
                let map = SourceMap::default();
                let file =
                    map.new_source_file(FileName::Custom("direct-eval.ts".into()).into(), source);
                let mut errors = Vec::new();
                let module = parse_file_as_module(
                    &file,
                    swc_core::ecma::parser::Syntax::Typescript(Default::default()),
                    EsVersion::latest(),
                    None,
                    &mut errors,
                )
                .expect("valid TypeScript wrapper");
                assert!(errors.is_empty(), "unexpected parse errors: {errors:?}");
                let mut program = Program::Module(module);
                assert!(
                    browser_creator_scope(&mut program)
                        .unwrap_err()
                        .to_string()
                        .contains("direct eval lexical transparency"),
                    "must refuse {callee}"
                );
            }
            for source in [
                "export const f = function ordinary(){ return (0,eval)('typeof \
                 __next_creator_leave') }",
                "export const f = function ordinary(){ return eval?.('typeof \
                 __next_creator_leave') }",
                "export const f = function ordinary(){ return globalThis.eval('typeof \
                 __next_creator_leave') }",
            ] {
                let (program, count) = transformed(source).unwrap();
                assert_eq!(count, 1);
                assert!(validate_creator_import(&program).unwrap());
            }
        });
    }
    #[test]
    fn labeled_iteration_and_repeated_binding_creators_hold_before_publication() {
        GLOBALS.set(&Default::default(), || {
            for source in [
                "outer: for (let f = function ordinary() {}; condition; update()) { continue outer }",
                "outer: for (const f of [{ method(){} }]) { continue outer }",
                "for (const { f = function ordinary(){} } of values) use(f)",
                "for (globalThis[function key(){}] in source) use(value)",
                "async function f(){ for await (const { f = function ordinary(){} } of values) use(f) }",
            ] { assert!(transformed(source).is_err(), "must HOLD repeated/labeled header {source}"); }
            let (program, count) = transformed("outer: for (;;) { const f = function ordinary(){}; use(f); continue outer }").unwrap();
            assert_eq!(count, 1);
            let Program::Module(module) = program else { unreachable!() };
            assert!(matches!(&module.body[1], ModuleItem::Stmt(Stmt::Labeled(labeled)) if matches!(&*labeled.body, Stmt::For(_))));
        });
    }
    #[test]
    fn await_operand_creation_is_before_suspension_and_later_creation_refuses() {
        GLOBALS.set(&Default::default(), || {
            let (program, count) = transformed(
                "async function f(){ await { then(resolve){ resolve() } }; async function \
                 later(){ await value }; async function* values(){ yield 1 } }",
            )
            .unwrap();
            assert_eq!(count, 1);
            assert!(validate_creator_import(&program).unwrap());
            assert!(
                transformed("async function f(){ const value = [(await first), { method(){} }] }")
                    .is_err()
            );
            assert!(
                transformed("async function f(){ class C extends(await base){ method(){} } }")
                    .is_err()
            );
        });
    }
    #[test]
    fn object_home_object_and_class_bindings_stay_at_original_lexical_position() {
        GLOBALS.set(&Default::default(), || {
            let (program, count) = transformed("export class C extends Base { method(a,...rest){ return super.method(a,...rest) } }; export const obj = { get value(){ return super.value }, set value(v){ super.value = v }, method(a){ return this === obj } }").unwrap();
            assert_eq!(count, 4);
            let output = to_code(&program);
            assert!(output.contains("export class C extends Base"));
            assert!(output.contains("export const obj"));
            println!("ACTUAL_CREATOR_OBJECT_OUTPUT\n{output}");
            struct Methods { getters: usize, setters: usize }
            impl Visit for Methods {
                fn visit_getter_prop(&mut self, getter: &GetterProp) {
                    assert!(getter.function.params.is_empty());
                    self.getters += 1;
                    getter.visit_children_with(self);
                }
                fn visit_setter_prop(&mut self, setter: &SetterProp) {
                    assert_eq!(setter.function.params.len(), 1);
                    assert!(matches!(&setter.function.params[0].pat, Pat::Ident(ident) if ident.sym == *"v"));
                    self.setters += 1;
                    setter.visit_children_with(self);
                }
            }
            let mut methods = Methods { getters: 0, setters: 0 };
            program.visit_with(&mut methods);
            assert_eq!((methods.getters, methods.setters), (1, 1));
            assert!(output.contains("super.method(a, ...rest)"));
            assert!(!output.contains("new Proxy"));
            assert!(!output.contains(".bind("));
        });
    }
    #[test]
    fn ordinary_nested_declarations_keep_native_hoisting_and_emission() {
        GLOBALS.set(&Default::default(), || {
            for source in [
                "export async function outer(){ const before = inner(2); function inner(value){ \
                 return value + 1 }; var inner; return [before, inner(4), inner.name, \
                 inner.length] }",
                "export const callback = async () => { const before = inner(2); await \
                 Promise.resolve(); function inner(value){ return value + 1 }; return [before, \
                 inner(4), inner.name, inner.length] }",
                "export function outer(){ { const before = inner(); function inner(){ return 7 }; \
                 return before } }",
            ] {
                let original = to_code(&parse(source));
                let (program, count) = transformed(source).unwrap();
                assert_eq!(count, 0);
                assert_eq!(to_code(&program), original);
            }
        });
    }

    #[test]
    fn original_define_helper_fixture_allows_ordinary_nested_function_declaration() {
        GLOBALS.set(&Default::default(), || {
            let source = include_str!(
                "../../../../test/unit/app-dir/next-testing-mocked/fixtures/define-helper.case.mjs"
            );
            let (program, count) = transformed(source).unwrap();
            assert!(count > 0);
            assert!(validate_creator_import(&program).unwrap());
            let output = to_code(&program);
            assert!(output.contains("function functionThenable()"));
            assert!(output.contains("functionThenable.then ="));
        });
    }

    #[test]
    fn block_function_name_preservation_keeps_declarations_and_entry_order() {
        GLOBALS.set(&Default::default(), || {
            let mut program = parse(
                "export function outer(){ { 'directive'; const before = block(); function \
                 block(){ return 7 }; use(block.name) }; return typeof block }",
            );
            assert_eq!(
                preserve_browser_block_function_names(&mut program, Default::default()),
                1
            );
            let output = to_code(&program);
            let directive = output
                .find("'directive'")
                .or_else(|| output.find("\"directive\""))
                .unwrap();
            let name = output
                .find("Object[\"defineProperty\"](block, \"name\"")
                .unwrap();
            let before = output.find("const before = block()").unwrap();
            let declaration = output.find("function block()").unwrap();
            assert!(directive < name && name < before && before < declaration);
            assert!(output.contains("return 7"));
            assert!(output.contains("typeof block"));
            assert!(!output.contains("function(block"));
        });
    }

    #[test]
    fn block_function_names_survive_actual_hygiene_and_local_object_bindings() {
        GLOBALS.set(&Default::default(), || {
            use swc_core::{
                common::Mark,
                ecma::transforms::base::{
                    hygiene::{Config, hygiene_with_config},
                    resolver,
                },
            };
            let unresolved = Mark::new();
            let top_level = Mark::new();
            let mut program = parse(
                "export function outer(Object){ { const before = block(); function block(){ \
                 return block }; use(block.name) }; return typeof block }",
            );
            program.visit_mut_with(&mut resolver(unresolved, top_level, false));
            assert_eq!(
                preserve_browser_block_function_names(
                    &mut program,
                    SyntaxContext::empty().apply_mark(unresolved)
                ),
                1
            );
            program.visit_mut_with(&mut hygiene_with_config(Config {
                top_level_mark: top_level,
                ..Default::default()
            }));
            let output = to_code(&program);
            assert!(output.contains("function block1()"), "{output}");
            assert!(
                output.contains("Object[\"defineProperty\"](block1, \"name\""),
                "{output}"
            );
            assert!(output.contains("value: \"block\""), "{output}");
            assert!(output.contains("outer(Object1)"), "{output}");
            assert!(output.contains("return block1"), "{output}");
            assert!(output.contains("typeof block"), "{output}");
        });
    }

    #[test]
    fn ordinary_function_body_declarations_and_empty_blocks_are_unchanged() {
        GLOBALS.set(&Default::default(), || {
            for source in [
                "export function outer(){ 'use strict'; const before = inner(); function inner(){ \
                 return 7 }; return before }",
                "export const callback = () => { function inner(){ return 7 }; return inner }",
                "export function outer(){ if (ready) { use(value) } }",
            ] {
                let mut program = parse(source);
                let before = to_code(&program);
                assert_eq!(
                    preserve_browser_block_function_names(&mut program, Default::default()),
                    0
                );
                assert_eq!(to_code(&program), before);
            }
        });
    }
}
