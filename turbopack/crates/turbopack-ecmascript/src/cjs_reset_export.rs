//! A bounded final export proof for compiled CommonJS require-lifetime roots.
use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::{GLOBALS, Mark},
    ecma::{
        ast::{
            AssignOp, AssignTarget, BinExpr, BinaryOp, Decl, Expr, Id, Lit, MemberProp, ModuleItem,
            ObjectLit, Pat, Program, Prop, PropName, PropOrSpread, SimpleAssignTarget, Stmt,
        },
        visit::{Visit, VisitWith},
    },
};
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    EcmascriptModuleAsset, EcmascriptParsable,
    analyzer::cjs_ast::{is_global, is_module_dot_exports},
    parse::ParseResult,
};

#[turbo_tasks::task_input]
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Encode, Decode)]
pub enum CommonJsResetExportShape {
    Unsupported,
    ObjectLiteral,
    FunctionBinding,
    AnonymousFunctionExpression,
}

#[turbo_tasks::value(shared)]
pub struct CommonJsResetExportCertificate {
    pub module: ResolvedVc<EcmascriptModuleAsset>,
    pub shape: CommonJsResetExportShape,
}

fn permitted_key(key: &str) -> bool {
    !matches!(
        key,
        "then" | "__proto__" | "prototype" | "caller" | "arguments" | "name" | "length"
    )
}
fn property_key(key: &PropName) -> Option<&str> {
    match key {
        PropName::Ident(key) => Some(&key.sym),
        PropName::Str(key) => key.value.as_str(),
        _ => None,
    }
}
fn ordinary_object(object: &ObjectLit) -> bool {
    object.props.iter().all(|property| match property {
        PropOrSpread::Prop(property) => match &**property {
            Prop::KeyValue(property) => property_key(&property.key).is_some_and(permitted_key),
            Prop::Shorthand(name) => permitted_key(&name.sym),
            Prop::Method(property) => property_key(&property.key).is_some_and(permitted_key),
            _ => false,
        },
        PropOrSpread::Spread(_) => false,
    })
}
struct ForbiddenUse<'a> {
    unresolved: Mark,
    function: Option<&'a Id>,
    found: bool,
}
impl Visit for ForbiddenUse<'_> {
    fn visit_bin_expr(&mut self, expression: &BinExpr) {
        let exact_binding = |value: &Expr| matches!(value, Expr::Ident(ident) if self.function.is_some_and(|binding| *binding == ident.to_id()));
        if matches!(expression.op, BinaryOp::EqEqEq | BinaryOp::NotEqEq)
            && ((matches!(&*expression.left, Expr::This(_)) && exact_binding(&expression.right))
                || (matches!(&*expression.right, Expr::This(_)) && exact_binding(&expression.left)))
        {
            // These two leaves produce only an identity boolean; neither publishes the binding.
            return;
        }
        expression.visit_children_with(self);
    }

    fn visit_ident(&mut self, ident: &swc_core::ecma::ast::Ident) {
        if is_global(ident, "module", self.unresolved)
            || is_global(ident, "exports", self.unresolved)
            || self
                .function
                .is_some_and(|binding| *binding == ident.to_id())
        {
            self.found = true;
        }
    }
}
fn clean<'a>(
    node: &impl VisitWith<ForbiddenUse<'a>>,
    unresolved: Mark,
    function: Option<&'a Id>,
) -> bool {
    let mut visitor = ForbiddenUse {
        unresolved,
        function,
        found: false,
    };
    node.visit_with(&mut visitor);
    !visitor.found
}
fn assignment(statement: &Stmt) -> Option<&swc_core::ecma::ast::AssignExpr> {
    let Stmt::Expr(statement) = statement else {
        return None;
    };
    let Expr::Assign(value) = &*statement.expr else {
        return None;
    };
    (value.op == AssignOp::Assign).then_some(value)
}
fn own_definition<'a>(
    statement: &'a Stmt,
    binding: &Id,
    unresolved: Mark,
    key: &str,
) -> Option<&'a ObjectLit> {
    let Stmt::Expr(statement) = statement else {
        return None;
    };
    let Expr::Call(call) = &*statement.expr else {
        return None;
    };
    let swc_core::ecma::ast::Callee::Expr(callee) = &call.callee else {
        return None;
    };
    let Expr::Member(member) = &**callee else {
        return None;
    };
    if !matches!(&*member.obj, Expr::Ident(ident) if is_global(ident, "Object", unresolved))
        || !matches!(&member.prop, MemberProp::Ident(key) if key.sym == "defineProperty")
        || call.type_args.is_some()
        || call.args.len() != 3
        || call.args.iter().any(|arg| arg.spread.is_some())
        || !matches!(&*call.args[0].expr, Expr::Ident(ident) if ident.to_id() == *binding)
        || !matches!(&*call.args[1].expr, Expr::Lit(Lit::Str(property)) if property.value.as_str() == Some(key))
    {
        return None;
    }
    let Expr::Object(descriptor) = &*call.args[2].expr else {
        return None;
    };
    Some(descriptor)
}
fn own_true_flag_definition(statement: &Stmt, binding: &Id, unresolved: Mark) -> bool {
    let Some(descriptor) = own_definition(statement, binding, unresolved, "__esModule") else {
        return false;
    };
    if descriptor.props.len() != 3 {
        return false;
    }
    let mut fields = [false; 3];
    for property in &descriptor.props {
        let PropOrSpread::Prop(property) = property else {
            return false;
        };
        let Prop::KeyValue(property) = &**property else {
            return false;
        };
        let Some(index) = (match property_key(&property.key) {
            Some("value") => Some(0),
            Some("writable") => Some(1),
            Some("configurable") => Some(2),
            _ => None,
        }) else {
            return false;
        };
        if fields[index] || !matches!(&*property.value, Expr::Lit(Lit::Bool(value)) if value.value)
        {
            return false;
        }
        fields[index] = true;
    }
    fields.into_iter().all(|field| field)
}

#[derive(Default)]
struct HasReturn(bool);
impl Visit for HasReturn {
    fn visit_return_stmt(&mut self, _: &swc_core::ecma::ast::ReturnStmt) {
        self.0 = true;
    }
}
fn own_true_getter_flag_definition(statement: &Stmt, binding: &Id, unresolved: Mark) -> bool {
    let Some(descriptor) = own_definition(statement, binding, unresolved, "__esModule") else {
        return false;
    };
    if descriptor.props.len() != 3 {
        return false;
    }
    let mut fields = [false; 3];
    for property in &descriptor.props {
        let PropOrSpread::Prop(property) = property else {
            return false;
        };
        let index = match &**property {
            Prop::KeyValue(property) => {
                if !matches!(&*property.value, Expr::Lit(Lit::Bool(value)) if value.value) {
                    return false;
                }
                match property_key(&property.key) {
                    Some("enumerable") => 0,
                    Some("configurable") => 1,
                    _ => return false,
                }
            }
            Prop::Method(property)
                if property_key(&property.key) == Some("get")
                    && property.function.params.is_empty()
                    && !property.function.is_async
                    && !property.function.is_generator =>
            {
                let Some(body) = &property.function.body else {
                    return false;
                };
                let Some((last, preceding)) = body.stmts.split_last() else {
                    return false;
                };
                if !matches!(last, Stmt::Return(value) if matches!(value.arg.as_deref(), Some(Expr::Lit(Lit::Bool(value))) if value.value))
                    || !clean(body, unresolved, Some(binding))
                {
                    return false;
                }
                let mut returns = HasReturn::default();
                preceding.visit_with(&mut returns);
                if returns.0 {
                    return false;
                }
                2
            }
            _ => return false,
        };
        if fields[index] {
            return false;
        }
        fields[index] = true;
    }
    fields.into_iter().all(|field| field)
}
fn own_hidden_function_default_definition(
    statement: &Stmt,
    binding: &Id,
    unresolved: Mark,
) -> bool {
    let Some(descriptor) = own_definition(statement, binding, unresolved, "default") else {
        return false;
    };
    if descriptor.props.len() != 3 {
        return false;
    }
    let mut fields = [false; 3];
    for property in &descriptor.props {
        let PropOrSpread::Prop(property) = property else {
            return false;
        };
        let Prop::KeyValue(property) = &**property else {
            return false;
        };
        let index = match property_key(&property.key) {
            Some("value")
                if matches!(&*property.value, Expr::Fn(function) if function.function.body.is_some())
                    && clean(&*property.value, unresolved, Some(binding)) =>
            {
                0
            }
            Some("writable") if matches!(&*property.value, Expr::Lit(Lit::Bool(value)) if value.value) => {
                1
            }
            Some("configurable") if matches!(&*property.value, Expr::Lit(Lit::Bool(value)) if value.value) => {
                2
            }
            _ => return false,
        };
        if fields[index] {
            return false;
        }
        fields[index] = true;
    }
    fields.into_iter().all(|field| field)
}

fn certify(program: &Program, unresolved: Mark) -> CommonJsResetExportShape {
    certify_for_callable_publication(program, unresolved, false)
}

fn certify_for_callable_publication(
    program: &Program,
    unresolved: Mark,
    allow_self_default: bool,
) -> CommonJsResetExportShape {
    let unsupported = CommonJsResetExportShape::Unsupported;
    let statements: Vec<&Stmt> = match program {
        Program::Script(script) => script.body.iter().collect(),
        Program::Module(module) => {
            let mut statements = Vec::new();
            for item in &module.body {
                let ModuleItem::Stmt(statement) = item else {
                    return unsupported;
                };
                statements.push(statement);
            }
            statements
        }
    };
    let Some(last) = statements
        .iter()
        .rposition(|statement| !matches!(statement, Stmt::Empty(_)))
    else {
        return unsupported;
    };
    let Some(publication) = assignment(statements[last]) else {
        return unsupported;
    };
    let AssignTarget::Simple(SimpleAssignTarget::Member(member)) = &publication.left else {
        return unsupported;
    };
    if !is_module_dot_exports(member, unresolved) {
        return unsupported;
    }
    let (shape, binding) = match &*publication.right {
        Expr::Object(object) if ordinary_object(object) => {
            (CommonJsResetExportShape::ObjectLiteral, None)
        }
        Expr::Fn(function)
            if function.ident.is_none()
                && function.function.body.is_some()
                && !function.function.is_async
                && !function.function.is_generator
                && function
                    .function
                    .params
                    .iter()
                    .all(|parameter| matches!(&parameter.pat, Pat::Ident(_))) =>
        {
            (CommonJsResetExportShape::AnonymousFunctionExpression, None)
        }
        Expr::Ident(ident) => {
            let binding = ident.to_id();
            let declarations = statements.iter().filter(|statement| matches!(statement, Stmt::Decl(Decl::Fn(function)) if function.ident.to_id() == binding && function.function.body.is_some())).count();
            if declarations != 1 {
                return unsupported;
            }
            (CommonJsResetExportShape::FunctionBinding, Some(binding))
        }
        _ => return unsupported,
    };
    let mut flag_definitions = 0;
    let mut hidden_default_definitions = 0;
    let mut self_default_assignments = 0;
    let mut default_assignments = 0;
    let mut flag_assignments = 0;
    let mut true_flag_assignments = 0;
    for (index, statement) in statements.iter().enumerate() {
        if index == last {
            if binding.is_none() && !clean(&*publication.right, unresolved, None) {
                return unsupported;
            }
            continue;
        }
        if let Some(binding) = &binding {
            if allow_self_default
                && (own_true_flag_definition(statement, binding, unresolved)
                    || own_true_getter_flag_definition(statement, binding, unresolved))
            {
                flag_definitions += 1;
                flag_assignments += 1;
                true_flag_assignments += 1;
                continue;
            }
            if allow_self_default
                && own_hidden_function_default_definition(statement, binding, unresolved)
            {
                hidden_default_definitions += 1;
                default_assignments += 1;
                continue;
            }
            if let Stmt::Decl(Decl::Fn(function)) = statement
                && function.ident.to_id() == *binding
            {
                if !clean(&function.function, unresolved, Some(binding)) {
                    return unsupported;
                }
                continue;
            }
            if let Some(assignment) = assignment(statement)
                && let AssignTarget::Simple(SimpleAssignTarget::Member(member)) = &assignment.left
                && matches!(&*member.obj, Expr::Ident(ident) if ident.to_id() == *binding)
                && matches!(&member.prop, MemberProp::Ident(key) if permitted_key(&key.sym))
            {
                if allow_self_default {
                    if matches!(&member.prop, MemberProp::Ident(key) if key.sym == "default") {
                        default_assignments += 1;
                        if matches!(&*assignment.right, Expr::Ident(ident) if ident.to_id() == *binding)
                        {
                            self_default_assignments += 1;
                            continue;
                        }
                    }
                    if matches!(&member.prop, MemberProp::Ident(key) if key.sym == "__esModule") {
                        flag_assignments += 1;
                        if matches!(&*assignment.right, Expr::Lit(Lit::Bool(value)) if value.value)
                        {
                            true_flag_assignments += 1;
                        }
                    }
                }
                if !clean(&*assignment.right, unresolved, Some(binding)) {
                    return unsupported;
                }
                continue;
            }
        }
        if !clean(*statement, unresolved, binding.as_ref()) {
            return unsupported;
        }
    }
    if (self_default_assignments != 0 || flag_definitions != 0 || hidden_default_definitions != 0)
        && !(default_assignments == 1
            && flag_assignments == 1
            && true_flag_assignments == 1
            && ((self_default_assignments == 1 && hidden_default_definitions == 0)
                || (hidden_default_definitions == 1
                    && self_default_assignments == 0
                    && flag_definitions == 0)))
    {
        return unsupported;
    }
    shape
}

/// The certificate belongs to this exact parsed full owner and resolver globals.
#[turbo_tasks::function]
pub async fn commonjs_reset_export_certificate(
    module: ResolvedVc<EcmascriptModuleAsset>,
) -> Result<Vc<CommonJsResetExportCertificate>> {
    let parsed = module.failsafe_parse().await?;
    let shape = if let ParseResult::Ok {
        program,
        eval_context,
        globals,
        ..
    } = &*parsed
    {
        GLOBALS.set(&globals, || certify(&program, eval_context.unresolved_mark))
    } else {
        CommonJsResetExportShape::Unsupported
    };
    Ok(CommonJsResetExportCertificate { module, shape }.cell())
}

/// Optional leaf-callable publication may retain one exact self-default data edge.
/// Existing supported/unsupported reset certificates keep their original identity.
#[turbo_tasks::function]
pub async fn commonjs_callable_publication_certificate(
    module: ResolvedVc<EcmascriptModuleAsset>,
) -> Result<Vc<CommonJsResetExportCertificate>> {
    let strict = commonjs_reset_export_certificate(*module);
    if strict.await?.shape != CommonJsResetExportShape::Unsupported {
        return Ok(strict);
    }
    let parsed = module.failsafe_parse().await?;
    let shape = if let ParseResult::Ok {
        program,
        eval_context,
        globals,
        ..
    } = &*parsed
    {
        GLOBALS.set(&globals, || {
            certify_for_callable_publication(&program, eval_context.unresolved_mark, true)
        })
    } else {
        CommonJsResetExportShape::Unsupported
    };
    if shape == CommonJsResetExportShape::Unsupported {
        return Ok(strict);
    }
    Ok(CommonJsResetExportCertificate { module, shape }.cell())
}

#[cfg(test)]
mod tests {
    use swc_core::{
        common::{FileName, GLOBALS, Mark, SourceMap, sync::Lrc},
        ecma::{
            ast::EsVersion,
            parser::{EsSyntax, Syntax, parse_file_as_program},
            transforms::base::resolver,
            visit::VisitMutWith,
        },
    };

    use crate::cjs_reset_export::{
        CommonJsResetExportShape, certify, certify_for_callable_publication,
    };

    fn check(source: &str, expected: CommonJsResetExportShape) {
        GLOBALS.set(&Default::default(), || {
            let map = Lrc::new(SourceMap::default());
            let file = map.new_source_file(Lrc::new(FileName::Anon), source.to_owned());
            let mut errors = Vec::new();
            let mut program = parse_file_as_program(
                &file,
                Syntax::Es(EsSyntax::default()),
                EsVersion::latest(),
                None,
                &mut errors,
            )
            .expect("valid literal certificate control");
            assert!(errors.is_empty(), "{source}: {errors:?}");
            let unresolved = Mark::new();
            program.visit_mut_with(&mut resolver(unresolved, Mark::new(), false));
            assert_eq!(certify(&program, unresolved), expected, "{source}");
        });
    }

    #[test]
    fn accepts_final_object_and_exact_callable_bindings() {
        for source in [
            "const dependency = require('./dependency.cjs'); module.exports = { dependency, \
             value: 1, read() { return dependency.value } }",
            "module.exports = { '__esModule': true, default: 1, value: 2 }",
            "function read(module) { return module.exports }; module.exports = {read}",
        ] {
            check(source, CommonJsResetExportShape::ObjectLiteral);
        }
        for source in [
            "const dependency = require('./dependency.cjs'); function exported(value) { return \
             [dependency.value, value] }; exported.dependency = dependency; module.exports = \
             exported",
            "function exported() { function exported() { return 1 }; return exported() }; \
             module.exports = exported",
        ] {
            check(source, CommonJsResetExportShape::FunctionBinding);
        }
    }

    #[test]
    fn rejects_unknown_export_shape_and_publication_history() {
        for source in [
            "module.exports = Promise.resolve(1)",
            "module.exports = []",
            "module.exports = Object.create(null)",
            "module.exports = {then() {}}",
            "module.exports = {__proto__: null, value: 1}",
            "module.exports = {['value']: 1}",
            "module.exports = {...{value: 1}}",
            "module.exports = {get value() { return 1 }}",
            "module.exports = {value: 1}; module.exports.value = 2",
            "module.exports = {}; module.exports = {value: 1}",
            "exports.value = 1; module.exports = {value: 1}",
            "if (globalThis.choice) module.exports = {}; module.exports = {value: 1}",
            "const module = {}; module.exports = {value: 1}",
            "const escaped = module; module.exports = {value: 1}",
        ] {
            check(source, CommonJsResetExportShape::Unsupported);
        }
    }

    #[test]
    fn rejects_callable_aliases_escapes_reassignments_and_prototype_writes() {
        for source in [
            "function exported() {}; const alias = exported; module.exports = exported",
            "function exported() {}; consume(exported); module.exports = exported",
            "function exported() {}; exported = () => 1; module.exports = exported",
            "function exported() {}; exported.prototype.value = 1; module.exports = exported",
            "function exported() {}; exported['value'] = 1; module.exports = exported",
            "function exported() {}; exported.then = () => 1; module.exports = exported",
            "function exported() {}; Object.setPrototypeOf(exported, {}); module.exports = \
             exported",
            "function exported() { return exported }; module.exports = exported",
            "function exported() { return module.exports }; module.exports = exported",
            "function exported() {}; if (globalThis.choice) exported.value = 1; module.exports = \
             exported",
        ] {
            check(source, CommonJsResetExportShape::Unsupported);
        }
    }

    #[test]
    fn accepts_only_exact_callable_this_identity_comparisons() {
        for comparison in [
            "this === exported",
            "exported === this",
            "this !== exported",
            "exported !== this",
        ] {
            check(
                &format!(
                    "function exported() {{ return {comparison} }}; module.exports = exported"
                ),
                CommonJsResetExportShape::FunctionBinding,
            );
        }
        for source in [
            "function exported() { return this == exported }; module.exports = exported",
            "function exported() { return this != exported }; module.exports = exported",
            "function exported() { return exported === other }; module.exports = exported",
            "function exported() { return receiver() === exported }; module.exports = exported",
            "function exported() { return this === exported.value }; module.exports = exported",
            "function exported() { return this === (exported = this) }; module.exports = exported",
            "function exported() { return this === exported || exported }; module.exports = \
             exported",
            "function exported() { return exported === this && module.exports }; module.exports = \
             exported",
            "function exported() { return (function(exported) { return this === exported \
             })(exported) }; module.exports = exported",
            "function exported() { function inner(exported) { return this !== exported }; return \
             exported }; module.exports = exported",
        ] {
            check(source, CommonJsResetExportShape::Unsupported);
        }
        check(
            "function exported(exported) { return this === exported }; module.exports = exported",
            CommonJsResetExportShape::FunctionBinding,
        );
    }

    #[test]
    fn accepts_terminal_anonymous_plain_parameter_functions() {
        for source in [
            "const dependency = require('./dependency.cjs'); module.exports = function(value, \
             receiver) { return [dependency.value, this === receiver, value] }",
            "module.exports = function() { return 1 }",
            "const dependency = require('./dependency.cjs'); module.exports = function(module, \
             exports) { return [module.exports, exports, dependency.value] }",
            "module.exports = function(value) { function read(module) { return module.exports }; \
             return read(value) }",
        ] {
            check(
                source,
                CommonJsResetExportShape::AnonymousFunctionExpression,
            );
        }
    }

    #[test]
    fn rejects_unmeasured_function_expression_forms_and_global_publication_use() {
        for source in [
            "module.exports = function named() { return 1 }",
            "module.exports = async function() { return 1 }",
            "module.exports = function*() { yield 1 }",
            "module.exports = async function*() { yield 1 }",
            "module.exports = () => 1",
            "module.exports = class {}",
            "module.exports = function(value = 1) { return value }",
            "module.exports = function(...values) { return values }",
            "module.exports = function({value}) { return value }",
            "module.exports = function([value]) { return value }",
            "module.exports = function() { return module.exports }",
            "module.exports = function() { module.exports = 1 }",
            "module.exports = function() { return exports.value }",
            "module.exports = function() { exports.value = 1 }",
            "module.exports = function() { const escaped = module; return escaped }",
            "module.exports = function() { function read() { return exports }; return read() }",
            "module.exports = function() {}; module.exports.value = 1",
            "module.exports = {}; module.exports = function() {}",
            "const module = {}; module.exports = function() {}",
            "const escaped = exports; module.exports = function() {}",
        ] {
            check(source, CommonJsResetExportShape::Unsupported);
        }
    }

    fn check_publication(source: &str, expected: CommonJsResetExportShape) {
        GLOBALS.set(&Default::default(), || {
            let map = Lrc::new(SourceMap::default());
            let file = map.new_source_file(Lrc::new(FileName::Anon), source.to_owned());
            let mut errors = Vec::new();
            let mut program = parse_file_as_program(
                &file,
                Syntax::Es(EsSyntax::default()),
                EsVersion::latest(),
                None,
                &mut errors,
            )
            .expect("valid literal publication control");
            assert!(errors.is_empty(), "{source}: {errors:?}");
            let unresolved = Mark::new();
            program.visit_mut_with(&mut resolver(unresolved, Mark::new(), false));
            assert_eq!(
                certify(&program, unresolved),
                CommonJsResetExportShape::Unsupported,
                "strict reset certificate changed: {source}"
            );
            assert_eq!(
                certify_for_callable_publication(&program, unresolved, true),
                expected,
                "{source}"
            );
        });
    }

    #[test]
    fn publication_accepts_one_exact_self_default_and_true_flag_without_reset_admission() {
        for kind in ["function", "async function", "function*", "async function*"] {
            for members in [
                "exported.__esModule=true; exported.default=exported; exported.label='root'",
                "exported.label='root'; exported.default=exported; exported.__esModule=true",
            ] {
                check_publication(
                    &format!(
                        "{kind} exported(value) {{ return this.label }}; {members}; \
                         module.exports=exported"
                    ),
                    CommonJsResetExportShape::FunctionBinding,
                );
            }
        }
    }

    #[test]
    fn publication_rejects_other_self_escapes_flag_forms_and_default_reassignments() {
        for source in [
            "function exported() {}; exported.default=exported; module.exports=exported",
            "function exported() {}; exported.__esModule=false; exported.default=exported; \
             module.exports=exported",
            "function exported() {}; exported.__esModule=1; exported.default=exported; \
             module.exports=exported",
            "function exported() {}; exported.__esModule=globalThis.flag; \
             exported.default=exported; module.exports=exported",
            "function exported() {}; exported.__esModule=true; exported.__esModule=false; \
             exported.default=exported; module.exports=exported",
            "function exported() {}; exported.__esModule=true; exported.default=exported; \
             exported.default=7; module.exports=exported",
            "function exported() {}; exported.__esModule=true; exported.default=7; \
             exported.default=exported; module.exports=exported",
            "function exported() {}; exported.__esModule=true; exported.default=exported; \
             exported.default=exported; module.exports=exported",
            "function exported() {}; exported.__esModule=true; exported['default']=exported; \
             module.exports=exported",
            "function exported() {}; exported.__esModule=true; exported.default=exported; \
             consume(exported); module.exports=exported",
            "function exported() {}; exported.__esModule=true; exported.default=exported; const \
             alias=exported; module.exports=exported",
            "function exported() { return exported }; exported.__esModule=true; \
             exported.default=exported; module.exports=exported",
            "function exported() {}; exported.__esModule=true; if(globalThis.flag) \
             exported.default=exported; module.exports=exported",
            "function exported() {}; exported.__esModule=true; \
             Object.defineProperty(exported,'default',{value:exported}); module.exports=exported",
            "function exported() {}; Object.defineProperty(exported,'__esModule',{value:true}); \
             exported.default=exported; module.exports=exported",
            "function exported() {}; Object.defineProperty(exported,'__esModule',{get(){return \
             true}}); exported.default=exported; module.exports=exported",
            "function exported() {}; exported.__esModule=true; exported.default=exported.other; \
             module.exports=exported",
            "function exported() {}; exported.__esModule=true; exported.default=exported; \
             exported.then=()=>1; module.exports=exported",
            "const module={}; function exported() {}; exported.__esModule=true; \
             exported.default=exported; module.exports=exported",
            "function exported() {}; exported.__esModule=true; { let exported={}; \
             exported.default=exported }; module.exports=exported.default",
        ] {
            check_publication(source, CommonJsResetExportShape::Unsupported);
        }
    }

    #[test]
    fn publication_accepts_exact_own_hidden_data_flags_without_reset_admission() {
        for kind in ["function", "async function", "function*", "async function*"] {
            for descriptor in [
                "{value:true,writable:true,configurable:true}",
                "{'configurable':true,'value':true,'writable':true}",
            ] {
                for flag_first in [true, false] {
                    let flag = format!("Object.defineProperty(exported,'__esModule',{descriptor})");
                    let members = if flag_first {
                        format!("{flag}; exported.default=exported")
                    } else {
                        format!("exported.default=exported; {flag}")
                    };
                    check_publication(
                        &format!(
                            "{kind} exported(value) {{ return this.label }}; {members}; \
                             module.exports=exported"
                        ),
                        CommonJsResetExportShape::FunctionBinding,
                    );
                }
            }
        }
    }

    #[test]
    fn publication_rejects_unproven_hidden_flag_descriptors_and_bindings() {
        for descriptor in [
            "{value:true}",
            "{value:false,writable:true,configurable:true}",
            "{value:1,writable:true,configurable:true}",
            "{value:true,writable:false,configurable:true}",
            "{value:true,writable:true,configurable:false}",
            "{value:true,writable:true,enumerable:false}",
            "{value:true,writable:true,configurable:true,enumerable:false}",
            "{value:true,writable:true,configurable:true,value:true}",
            "{value:true,writable:true,configurable:true,...extra}",
            "{['value']:true,writable:true,configurable:true}",
            "{get value(){return true},writable:true,configurable:true}",
            "{value,writable:true,configurable:true}",
            "{value:true,writable:true,configurable:enabled}",
        ] {
            check_publication(
                &format!(
                    "function exported() {{}}; \
                     Object.defineProperty(exported,'__esModule',{descriptor}); \
                     exported.default=exported; module.exports=exported"
                ),
                CommonJsResetExportShape::Unsupported,
            );
        }
        for source in [
            "const Object=globalThis.Object; function exported() {}; \
             Object.defineProperty(exported,'__esModule',{value:true,writable:true,configurable:\
             true}); exported.default=exported; module.exports=exported",
            "function exported() {}; \
             Object['defineProperty'](exported,'__esModule',{value:true,writable:true,\
             configurable:true}); exported.default=exported; module.exports=exported",
            "function exported() {}; Object.defineProperty(exported,'__esModule',...descriptors); \
             exported.default=exported; module.exports=exported",
            "function exported() {}; \
             Object.defineProperty(exported,'__esModule',{value:true,writable:true,configurable:\
             true},extra); exported.default=exported; module.exports=exported",
            "function exported() {}; \
             Object.defineProperty(exported,'__esModule',{value:true,writable:true,configurable:\
             true}); module.exports=exported",
            "function exported() {}; \
             Object.defineProperty(exported,'__esModule',{value:true,writable:true,configurable:\
             true}); exported.__esModule=true; exported.default=exported; module.exports=exported",
            "function exported() {}; \
             Object.defineProperty(exported,'__esModule',{value:true,writable:true,configurable:\
             true}); Object.defineProperty(exported,'__esModule',{value:true,writable:true,\
             configurable:true}); exported.default=exported; module.exports=exported",
            "function exported() {}; \
             Object.defineProperty(exported,'__esModule',{value:true,writable:true,configurable:\
             true}); exported.default=exported; exported.default=7; module.exports=exported",
            "function exported() { return exported }; \
             Object.defineProperty(exported,'__esModule',{value:true,writable:true,configurable:\
             true}); exported.default=exported; module.exports=exported",
            "function exported() {}; \
             Object.defineProperty(exported,'__esModule',{value:true,writable:true,configurable:\
             true}); exported.default=exported; const escaped=exported; module.exports=exported",
        ] {
            check_publication(source, CommonJsResetExportShape::Unsupported);
        }
    }

    #[test]
    fn publication_accepts_owned_getter_flags_and_hidden_nested_defaults_only() {
        for kind in ["function", "async function", "function*", "async function*"] {
            for getter in [
                "{enumerable:true,configurable:true,get(){return true}}",
                "{'configurable':true,get(){globalThis.trace.push(this);return \
                 true},'enumerable':true}",
                "{get(){if(globalThis.fail)throw globalThis.failure;return \
                 true},enumerable:true,configurable:true}",
            ] {
                check_publication(
                    &format!(
                        "{kind} exported(value) {{return this.label}}; \
                         Object.defineProperty(exported,'__esModule',{getter}); \
                         exported.default=exported; module.exports=exported"
                    ),
                    CommonJsResetExportShape::FunctionBinding,
                );
            }
            for nested in [
                "function nested(value){return value+1}",
                "function(value){return this.label}",
                "async function* nested(){yield 1}",
            ] {
                check_publication(
                    &format!(
                        "{kind} exported(value) {{return this.label}}; exported.__esModule=true; \
                         Object.defineProperty(exported,'default',{{value:{nested},writable:true,\
                         configurable:true}}); module.exports=exported"
                    ),
                    CommonJsResetExportShape::FunctionBinding,
                );
            }
        }
    }

    #[test]
    fn publication_rejects_unproven_getter_truth_and_hidden_default_ownership() {
        for descriptor in [
            "{enumerable:true,configurable:true,get(){return false}}",
            "{enumerable:true,configurable:true,get(){return globalThis.flag}}",
            "{enumerable:true,configurable:true,get(){if(globalThis.flag)return false;return \
             true}}",
            "{enumerable:true,configurable:true,get(){if(globalThis.flag)return true;return true}}",
            "{enumerable:true,configurable:true,get(){return true;globalThis.after()}}",
            "{enumerable:true,configurable:true,get(){globalThis.take(exported);return true}}",
            "{enumerable:true,configurable:true,get(){globalThis.take(module);return true}}",
            "{enumerable:true,configurable:true,get(){globalThis.take(exports);return true}}",
            "{enumerable:true,configurable:true,get(value){return true}}",
            "{enumerable:true,configurable:true,async get(){return true}}",
            "{enumerable:true,configurable:true,*get(){return true}}",
            "{enumerable:true,configurable:true,get get(){return ()=>true}}",
            "{enumerable:false,configurable:true,get(){return true}}",
            "{enumerable:true,configurable:false,get(){return true}}",
            "{enumerable:true,configurable:true,get(){return true},set(value){}}",
            "{enumerable:true,configurable:true,get(){return true},get(){return true}}",
            "{enumerable:true,configurable:true,['get'](){return true}}",
            "{enumerable:true,configurable:true,...extra,get(){return true}}",
        ] {
            check_publication(
                &format!(
                    "function exported(){{}};Object.defineProperty(exported,'__esModule',\
                     {descriptor}); exported.default=exported;module.exports=exported"
                ),
                CommonJsResetExportShape::Unsupported,
            );
        }
        for descriptor in [
            "{value:function(){return exported},writable:true,configurable:true}",
            "{value:function(){return module.exports},writable:true,configurable:true}",
            "{value:function(){return exports},writable:true,configurable:true}",
            "{value:()=>1,writable:true,configurable:true}",
            "{value:1,writable:true,configurable:true}",
            "{value:function(){},writable:false,configurable:true}",
            "{value:function(){},writable:true,configurable:false}",
            "{value:function(){},writable:true,configurable:true,enumerable:false}",
            "{value:function(){},writable:true,configurable:true,value:function(){}}",
            "{value:function(){},writable:true,configurable:true,...extra}",
            "{['value']:function(){},writable:true,configurable:true}",
            "{get value(){return function(){}},writable:true,configurable:true}",
        ] {
            check_publication(
                &format!(
                    "function exported(){{}};exported.__esModule=true; \
                     Object.defineProperty(exported,'default',{descriptor});module.\
                     exports=exported"
                ),
                CommonJsResetExportShape::Unsupported,
            );
        }
        for extra in [
            "exported.default=7",
            "exported.default=exported",
            "exported.__esModule=true",
            "globalThis.take(exported)",
        ] {
            check_publication(
                &format!(
                    "function exported(){{}};exported.__esModule=true; \
                     Object.defineProperty(exported,'default',{{value:function(){{}},writable:\
                     true,configurable:true}}); {extra};module.exports=exported"
                ),
                CommonJsResetExportShape::Unsupported,
            );
        }
        for extra in [
            "exported.default=7",
            "exported.default=exported",
            "exported.__esModule=true",
            "globalThis.take(exported)",
        ] {
            check_publication(
                &format!(
                    "function exported(){{}};Object.defineProperty(exported,'__esModule', \
                     {{enumerable:true,configurable:true,get(){{return true}}}}); \
                     exported.default=exported;{extra};module.exports=exported"
                ),
                CommonJsResetExportShape::Unsupported,
            );
        }
    }
}
