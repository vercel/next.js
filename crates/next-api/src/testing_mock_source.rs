//! Spec-only static factory extraction. Resolution and graph substitution belong
//! to the caller; this module never resolves a JavaScript request itself.

use std::collections::HashSet;

use anyhow::{Result, bail};
use swc_core::{
    common::{FileName, GLOBALS, Mark, SourceMap, Span, Spanned, SyntaxContext},
    ecma::{
        ast::*,
        parser::{Syntax, TsSyntax, parse_file_as_program},
        transforms::base::resolver,
        visit::{Visit, VisitWith},
    },
};

pub(crate) struct StaticMockPlan {
    pub source: String,
    pub declarations: Vec<StaticMockDeclaration>,
}

pub(crate) struct StaticMockDeclaration {
    pub request: String,
    pub factory_source: String,
    pub factory_start: usize,
    pub call_start: usize,
    pub export_names: Vec<String>,
    pub has_spread: bool,
    pub has_object_return: bool,
}

pub(crate) fn extract_static_mocks(source: &str, filename: &str) -> Result<StaticMockPlan> {
    GLOBALS.set(&Default::default(), || extract(source, filename))
}

fn parse_source(source: &str, filename: &str) -> Result<(Program, u32)> {
    let cm = SourceMap::default();
    let file = cm.new_source_file(FileName::Custom(filename.into()).into(), source.to_owned());
    let mut errors = Vec::new();
    let program = parse_file_as_program(
        &file,
        Syntax::Typescript(TsSyntax {
            tsx: ![".ts", ".mts", ".cts"]
                .iter()
                .any(|extension| filename.ends_with(extension)),
            decorators: true,
            ..Default::default()
        }),
        EsVersion::EsNext,
        None,
        &mut errors,
    )
    .map_err(|error| {
        anyhow::anyhow!("Cannot analyze static module mocks in {filename}: {error:?}")
    })?;
    if !errors.is_empty() {
        bail!(
            "Cannot analyze static module mocks in {filename}: {:?}",
            errors[0]
        );
    }
    Ok((program, file.start_pos.0))
}

/// Validate directive prologues with the parser, including leading comments.
/// Node factory replacements must never erase a Client/Server reference boundary.
pub(crate) fn validate_mock_target_source(source: &str, filename: &str) -> Result<()> {
    GLOBALS.set(&Default::default(), || {
        let (program, _) = parse_source(source, filename)?;
        let statements: Vec<&Stmt> = match &program {
            Program::Module(module) => module
                .body
                .iter()
                .take_while(|item| matches!(item, ModuleItem::Stmt(_)))
                .filter_map(|item| match item {
                    ModuleItem::Stmt(stmt) => Some(stmt),
                    _ => None,
                })
                .collect(),
            Program::Script(script) => script.body.iter().collect(),
        };
        for statement in statements {
            let Stmt::Expr(statement) = statement else {
                break;
            };
            let Expr::Lit(Lit::Str(directive)) = &*statement.expr else {
                break;
            };
            if matches!(directive.value.as_str(), Some("use client" | "use server")) {
                bail!(
                    "Node module mocks cannot replace use client/use server targets ({filename})."
                );
            }
        }
        Ok(())
    })
}

fn extract(source: &str, filename: &str) -> Result<StaticMockPlan> {
    let (mut program, start_pos) = parse_source(source, filename)?;
    let unresolved = Mark::new();
    program.mutate(resolver(unresolved, Mark::new(), true));
    let unresolved = SyntaxContext::empty().apply_mark(unresolved);
    let Program::Module(module) = &program else {
        return Ok(StaticMockPlan {
            source: source.into(),
            declarations: Vec::new(),
        });
    };
    let mut bindings = HashSet::new();
    for item in &module.body {
        if let ModuleItem::ModuleDecl(ModuleDecl::Import(import)) = item {
            if !matches!(
                import.src.value.as_str(),
                Some("vitest" | "next/experimental/testing/vitest")
            ) {
                continue;
            }
            for specifier in &import.specifiers {
                if let ImportSpecifier::Named(named) = specifier {
                    let imported = named
                        .imported
                        .as_ref()
                        .map(|name| name.atom().to_string())
                        .unwrap_or_else(|| named.local.sym.to_string());
                    if matches!(imported.as_str(), "vi" | "vitest")
                        && !import.type_only
                        && !named.is_type_only
                    {
                        bindings.insert(named.local.to_id());
                    }
                }
            }
        }
    }
    let mut calls = MockCalls {
        bindings: &bindings,
        calls: Vec::new(),
        invalid: false,
        value_alias: false,
    };
    module.visit_with(&mut calls);
    if calls.invalid || (calls.value_alias && !calls.calls.is_empty()) {
        bail!(
            "Static module mocks require direct vi.mock calls; aliases, computed access and \
             dynamic mock APIs are unsupported ({filename})."
        );
    }
    // SWC removes the leading UTF-8 BOM before assigning byte spans. Until
    // extraction and both composed maps account for that normalization, fail
    // explicitly rather than slicing a factory at the wrong source offset.
    if !calls.calls.is_empty() && source.starts_with('\u{feff}') {
        bail!("Static module mocks in BOM-prefixed specs are unsupported ({filename}).");
    }
    let mut declarations = Vec::new();
    let mut stripped = String::new();
    let mut previous_end = 0;
    for call in calls.calls {
        let top_level = module.body.iter().any(|item| matches!(item,
            ModuleItem::Stmt(Stmt::Expr(stmt)) if matches!(&*stmt.expr, Expr::Call(top) if top.span == call.span)));
        if !top_level {
            bail!("vi.mock must be a top-level expression in the spec ({filename}).");
        }
        if call.args.len() != 2 || call.args.iter().any(|arg| arg.spread.is_some()) {
            bail!(
                "vi.mock requires a literal target and an inline factory; automock and spy \
                 options are unsupported ({filename})."
            );
        }
        let request = match &*call.args[0].expr {
            Expr::Lit(Lit::Str(request)) => request,
            Expr::Call(import)
                if matches!(import.callee, Callee::Import(_))
                    && import.args.len() == 1
                    && import.args[0].spread.is_none() =>
            {
                let Expr::Lit(Lit::Str(request)) = &*import.args[0].expr else {
                    bail!("vi.mock import() target must contain a string literal ({filename}).");
                };
                request
            }
            _ => {
                bail!("vi.mock target must be a string literal or literal import() ({filename}).");
            }
        };
        let Some(request) = request.value.as_str() else {
            bail!("Invalid mock target string ({filename}).")
        };
        if request.is_empty() {
            bail!("Mock target must not be empty ({filename}).")
        }
        if request.contains('?') || request.strip_prefix('#').unwrap_or(request).contains('#') {
            bail!(
                "Module mock targets with query strings or fragments are unsupported ({filename})."
            );
        }
        let factory = &*call.args[1].expr;
        if !matches!(factory, Expr::Arrow(_) | Expr::Fn(_)) {
            bail!("vi.mock requires an inline factory function ({filename}).");
        }
        if matches!(factory, Expr::Fn(function) if function.function.is_generator) {
            bail!("Generator mock factories are unsupported ({filename}).");
        }
        let mut locals = LocalBindings::default();
        factory.visit_with(&mut locals);
        let mut captures = FactoryReferences {
            locals: &locals.0,
            unresolved,
            invalid: None,
        };
        factory.visit_with(&mut captures);
        if let Some(reason) = captures.invalid {
            bail!(
                "Unsupported vi.mock factory in {filename}: {reason}. Factories are hoisted \
                 before spec imports."
            );
        }
        let original = match factory {
            Expr::Arrow(arrow) => arrow.params.first(),
            Expr::Fn(function) => function.function.params.first().map(|param| &param.pat),
            _ => None,
        }
        .and_then(|pattern| match pattern {
            Pat::Ident(ident) => Some(ident.to_id()),
            _ => None,
        });
        let mut original_bindings = OriginalBindings {
            original: original.as_ref(),
            bindings: HashSet::new(),
            mutated: false,
        };
        factory.visit_with(&mut original_bindings);
        if original_bindings.mutated {
            bail!("Reassigning the importOriginal callback is unsupported ({filename}).");
        }
        let original_bindings = original_bindings.bindings;
        let mut exports = FactoryExports {
            original,
            original_bindings,
            ..Default::default()
        };
        match factory {
            Expr::Arrow(arrow) => match &*arrow.body {
                ArrowFunctionBody::Expr(expr) => exports.return_value(expr),
                ArrowFunctionBody::FunctionBody(body) => body.visit_with(&mut exports),
            },
            Expr::Fn(function) => {
                if let Some(body) = &function.function.body {
                    body.visit_with(&mut exports)
                }
            }
            _ => unreachable!(),
        }
        if exports.invalid {
            bail!(
                "Mock factory exports require static object keys and only verified importOriginal \
                 namespace spreads ({filename})."
            )
        }
        let offset = |span: Span| (span.lo.0 - start_pos) as usize;
        let start = offset(call.span);
        let end = (call.span.hi.0 - start_pos) as usize;
        let factory_start = offset(factory.span());
        let factory_end = (factory.span().hi.0 - start_pos) as usize;
        stripped.push_str(&source[previous_end..start]);
        // Source-map columns count UTF-16 units, not UTF-8 bytes.
        for character in source[start..end].chars() {
            if matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}') {
                stripped.push(character);
            } else {
                for _ in 0..character.len_utf16() {
                    stripped.push(' ');
                }
            }
        }
        previous_end = end;
        exports.names.sort();
        exports.names.dedup();
        declarations.push(StaticMockDeclaration {
            request: request.into(),
            factory_source: source[factory_start..factory_end].into(),
            factory_start,
            call_start: start,
            export_names: exports.names,
            has_spread: exports.has_spread,
            has_object_return: exports.has_object_return,
        });
    }
    stripped.push_str(&source[previous_end..]);
    Ok(StaticMockPlan {
        source: stripped,
        declarations,
    })
}

struct MockCalls<'a> {
    bindings: &'a HashSet<Id>,
    calls: Vec<CallExpr>,
    invalid: bool,
    value_alias: bool,
}

impl Visit for MockCalls<'_> {
    fn visit_var_declarator(&mut self, declaration: &VarDeclarator) {
        if matches!(declaration.init.as_deref(), Some(Expr::Ident(ident)) if self.bindings.contains(&ident.to_id()))
        {
            if let Pat::Object(pattern) = &declaration.name {
                for property in &pattern.props {
                    let name = match property {
                        ObjectPatProp::Assign(property) => Some(property.key.id.sym.as_ref()),
                        ObjectPatProp::KeyValue(property) => match &property.key {
                            PropName::Ident(name) => Some(name.sym.as_ref()),
                            PropName::Str(name) => name.value.as_str(),
                            PropName::Computed(name) => match &*name.expr {
                                Expr::Lit(Lit::Str(name)) => name.value.as_str(),
                                _ => None,
                            },
                            _ => None,
                        },
                        ObjectPatProp::Rest(_) => None,
                    };
                    if matches!(
                        name,
                        Some(
                            "mock"
                                | "doMock"
                                | "unmock"
                                | "doUnmock"
                                | "hoisted"
                                | "importActual"
                                | "importMock"
                                | "resetModules"
                        )
                    ) {
                        self.invalid = true;
                    }
                }
            }
        }
        declaration.visit_children_with(self);
    }

    fn visit_call_expr(&mut self, call: &CallExpr) {
        if let Callee::Expr(expr) = &call.callee {
            if let Expr::Member(member) = &**expr {
                if let Expr::Ident(object) = &*member.obj {
                    if self.bindings.contains(&object.to_id()) {
                        match &member.prop {
                            MemberProp::Ident(name) if name.sym == "mock" => {
                                self.calls.push(call.clone());
                                // Validate nested factory references separately.
                                return;
                            }
                            MemberProp::Ident(name)
                                if !matches!(
                                    name.sym.as_ref(),
                                    "doMock"
                                        | "unmock"
                                        | "doUnmock"
                                        | "hoisted"
                                        | "importActual"
                                        | "importMock"
                                        | "resetModules"
                                ) => {}
                            _ => self.invalid = true,
                        }
                    }
                }
            }
        }
        call.visit_children_with(self);
    }
    fn visit_import_decl(&mut self, _: &ImportDecl) {}
    fn visit_ts_type(&mut self, _: &TsType) {}
    fn visit_ident(&mut self, ident: &Ident) {
        if self.bindings.contains(&ident.to_id()) {
            self.value_alias = true;
        }
    }
    fn visit_member_expr(&mut self, member: &MemberExpr) {
        if let Expr::Ident(object) = &*member.obj {
            if self.bindings.contains(&object.to_id()) {
                if !matches!(&member.prop, MemberProp::Ident(name) if !matches!(name.sym.as_ref(), "mock" | "doMock" | "unmock" | "doUnmock" | "hoisted" | "importActual" | "importMock" | "resetModules"))
                {
                    self.invalid = true;
                }
                return;
            }
        }
        member.visit_children_with(self);
    }
}

#[derive(Default)]
struct LocalBindings(HashSet<Id>);
impl Visit for LocalBindings {
    fn visit_binding_ident(&mut self, binding: &BindingIdent) {
        self.0.insert(binding.id.to_id());
    }
    fn visit_fn_expr(&mut self, function: &FnExpr) {
        if let Some(name) = &function.ident {
            self.0.insert(name.to_id());
        }
        function.visit_children_with(self);
    }
    fn visit_fn_decl(&mut self, function: &FnDecl) {
        self.0.insert(function.ident.to_id());
        function.visit_children_with(self);
    }
}

struct FactoryReferences<'a> {
    locals: &'a HashSet<Id>,
    unresolved: SyntaxContext,
    invalid: Option<String>,
}
impl Visit for FactoryReferences<'_> {
    fn visit_jsx_element_name(&mut self, name: &JSXElementName) {
        if matches!(name, JSXElementName::Ident(ident) if ident.sym.starts_with(|character: char| character.is_ascii_lowercase()) || ident.sym.contains('-'))
        {
            return;
        }
        name.visit_children_with(self);
    }

    fn visit_ident(&mut self, ident: &Ident) {
        if self.locals.contains(&ident.to_id()) {
            return;
        }
        if ident.ctxt == self.unresolved
            && matches!(
                ident.sym.as_ref(),
                "undefined"
                    | "NaN"
                    | "Infinity"
                    | "globalThis"
                    | "Promise"
                    | "Object"
                    | "Array"
                    | "String"
                    | "Number"
                    | "Boolean"
                    | "BigInt"
                    | "Symbol"
                    | "Math"
                    | "JSON"
                    | "Error"
                    | "TypeError"
                    | "RangeError"
                    | "Map"
                    | "Set"
                    | "RegExp"
                    | "Date"
            )
        {
            return;
        }
        self.invalid
            .get_or_insert_with(|| format!("capture of {}", ident.sym));
    }
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if matches!(call.callee, Callee::Import(_)) {
            self.invalid =
                Some("dynamic imports in factories are unsupported; use importOriginal".into());
        }
        call.visit_children_with(self);
    }
    fn visit_ts_type(&mut self, _: &TsType) {}
    fn visit_meta_prop_expr(&mut self, _: &MetaPropExpr) {
        self.invalid =
            Some("import.meta/new.target context cannot be preserved in a hoisted factory".into());
    }
    fn visit_this_expr(&mut self, _: &ThisExpr) {
        self.invalid = Some("this capture is unsupported".into());
    }
}

fn is_original_namespace(expr: &Expr, original: Option<&Id>) -> bool {
    let expr = match expr {
        Expr::Paren(expr) => return is_original_namespace(&expr.expr, original),
        _ => expr,
    };
    let Expr::Await(await_expr) = expr else {
        return false;
    };
    let Expr::Call(call) = &*await_expr.arg else {
        return false;
    };
    matches!(&call.callee, Callee::Expr(callee) if matches!(&**callee, Expr::Ident(ident) if Some(&ident.to_id()) == original))
        && call.args.is_empty()
}

struct OriginalBindings<'a> {
    original: Option<&'a Id>,
    bindings: HashSet<Id>,
    mutated: bool,
}
struct OriginalUse<'a> {
    original: Option<&'a Id>,
    found: bool,
}
impl Visit for OriginalUse<'_> {
    fn visit_ident(&mut self, ident: &Ident) {
        self.found |= Some(&ident.to_id()) == self.original;
    }
}
impl Visit for OriginalBindings<'_> {
    fn visit_for_head(&mut self, head: &ForHead) {
        let mut usage = OriginalUse {
            original: self.original,
            found: false,
        };
        head.visit_with(&mut usage);
        self.mutated |= usage.found;
        head.visit_children_with(self);
    }
    fn visit_fn_decl(&mut self, declaration: &FnDecl) {
        self.mutated |= Some(&declaration.ident.to_id()) == self.original;
        declaration.visit_children_with(self);
    }

    fn visit_assign_expr(&mut self, assignment: &AssignExpr) {
        let mut usage = OriginalUse {
            original: self.original,
            found: false,
        };
        assignment.left.visit_with(&mut usage);
        self.mutated |= usage.found;
        assignment.visit_children_with(self);
    }
    fn visit_update_expr(&mut self, update: &UpdateExpr) {
        let mut usage = OriginalUse {
            original: self.original,
            found: false,
        };
        update.arg.visit_with(&mut usage);
        self.mutated |= usage.found;
        update.visit_children_with(self);
    }
    fn visit_var_decl(&mut self, declaration: &VarDecl) {
        for binding in &declaration.decls {
            if binding.init.is_some() {
                let mut usage = OriginalUse {
                    original: self.original,
                    found: false,
                };
                binding.name.visit_with(&mut usage);
                self.mutated |= usage.found;
            }
        }

        if declaration.kind == VarDeclKind::Const {
            for binding in &declaration.decls {
                if let (Pat::Ident(ident), Some(init)) = (&binding.name, &binding.init) {
                    if is_original_namespace(init, self.original) {
                        self.bindings.insert(ident.to_id());
                    }
                }
            }
        }
        declaration.visit_children_with(self);
    }
}

#[derive(Default)]
struct FactoryExports {
    original: Option<Id>,
    original_bindings: HashSet<Id>,
    names: Vec<String>,
    has_spread: bool,
    has_object_return: bool,
    invalid: bool,
}
impl FactoryExports {
    fn return_value(&mut self, expr: &Expr) {
        let object = match expr {
            Expr::Object(object) => object,
            Expr::Paren(expr) => return self.return_value(&expr.expr),
            Expr::TsAs(expr) => return self.return_value(&expr.expr),
            Expr::TsSatisfies(expr) => return self.return_value(&expr.expr),
            _ => {
                self.invalid = true;
                return;
            }
        };
        self.has_object_return = true;
        for prop in &object.props {
            match prop {
                PropOrSpread::Spread(spread) => {
                    if is_original_namespace(&spread.expr, self.original.as_ref())
                        || matches!(&*spread.expr, Expr::Ident(ident) if self.original_bindings.contains(&ident.to_id()))
                    {
                        self.has_spread = true;
                    } else {
                        self.invalid = true;
                    }
                }
                PropOrSpread::Prop(prop) => {
                    let key = match &**prop {
                        Prop::Shorthand(ident) => {
                            self.names.push(ident.sym.to_string());
                            continue;
                        }
                        Prop::KeyValue(prop) => &prop.key,
                        Prop::Method(prop) => &prop.key,
                        Prop::Getter(_) | Prop::Setter(_) | Prop::Assign(_) => {
                            self.invalid = true;
                            continue;
                        }
                    };
                    match key {
                        PropName::Ident(ident) => self.names.push(ident.sym.to_string()),
                        PropName::Str(value) => match value.value.as_str() {
                            Some(name) => self.names.push(name.into()),
                            None => self.invalid = true,
                        },
                        _ => self.invalid = true,
                    }
                }
            }
        }
    }
}
impl Visit for FactoryExports {
    fn visit_return_stmt(&mut self, stmt: &ReturnStmt) {
        if let Some(value) = &stmt.arg {
            self.return_value(value);
        }
    }
    fn visit_function(&mut self, _: &Function) {}
    fn visit_arrow_expr(&mut self, _: &ArrowExpr) {}
}

#[cfg(test)]
mod tests {
    use crate::testing_mock_source::{extract_static_mocks, validate_mock_target_source};

    #[test]
    fn distinguishes_empty_replacement_from_throw_only_factory() {
        let source = "import {vi} from \
                      'vitest';vi.mock('./empty',()=>({}));vi.mock('./throws',()=>{throw new \
                      Error('factory')});";
        let plan = extract_static_mocks(source, "spec.ts").unwrap();
        assert!(plan.declarations[0].has_object_return);
        assert!(plan.declarations[0].export_names.is_empty());
        assert!(!plan.declarations[1].has_object_return);
        assert!(plan.declarations[1].export_names.is_empty());
    }

    #[test]
    fn preserves_generic_api_values_in_unmocked_specs() {
        let source = "import {vi,vitest} from 'vitest';const \
                      tools=vi;tools.fn();if(vi!==vitest)throw new Error('identity');";
        let plan = extract_static_mocks(source, "spec.js").unwrap();
        assert!(plan.declarations.is_empty());
        assert_eq!(plan.source, source);
        assert!(
            extract_static_mocks(
                "import{vi}from'vitest';const tools=vi;vi.mock('./dep',()=>({value:1}));",
                "spec.js"
            )
            .is_err()
        );
    }

    #[test]
    fn rejects_bom_mock_specs_without_changing_unmocked_sources() {
        let source = "\u{feff}import {vi} from 'vitest';vi.mock('./dep',()=>({value:1}))";
        assert!(
            extract_static_mocks(source, "spec.ts")
                .err()
                .unwrap()
                .to_string()
                .contains("BOM-prefixed")
        );
        let plain = "\u{feff}export const value = 1";
        assert_eq!(
            extract_static_mocks(plain, "plain.ts").unwrap().source,
            plain
        );
    }

    #[test]
    fn accepts_typed_and_intrinsic_jsx_factories() {
        let typed = "import {vi} from 'vitest';vi.mock('./dep',()=>{const \
                     value:string='typed';return {value}})";
        assert_eq!(
            extract_static_mocks(typed, "spec.ts")
                .unwrap()
                .declarations
                .len(),
            1
        );
        let jsx = "import {vi} from 'vitest';vi.mock('./dep',()=>({value:<span>child</span>}))";
        assert_eq!(
            extract_static_mocks(jsx, "spec.jsx")
                .unwrap()
                .declarations
                .len(),
            1
        );
    }

    #[test]
    fn rejects_callback_rebinding_through_loops_and_declarations() {
        for body in [
            "for(original of [()=>({value:42,mockOnly:1})]){}",
            "for(original in {value:42,mockOnly:1}){}",
            "var original=()=>({value:42,mockOnly:1});",
            "var {x: original}={x:()=>({value:42,mockOnly:1})};",
            "function original(){return {value:42,mockOnly:1}}",
        ] {
            let source = format!(
                "import {{vi}} from 'vitest';vi.mock('./dep',async \
                 original=>{{{body}return{{...await original()}}}})"
            );
            let error = extract_static_mocks(&source, "spec.ts")
                .err()
                .expect("callback rebind must reject");
            assert!(
                error.to_string().contains("Reassigning the importOriginal"),
                "{body}: {error}"
            );
        }
    }

    #[test]
    fn ignores_type_only_api_references() {
        let plan = extract_static_mocks(
            "import{vi}from'vitest';type Tools=typeof vi;vi.mock('./dep',()=>({value:1}))",
            "spec.ts",
        )
        .unwrap();
        assert_eq!(plan.declarations.len(), 1);
    }

    #[test]
    fn rejects_unknown_spreads_and_extracted_module_context() {
        for body in [
            "vi.mock('./dep',()=>({...{value:42,mockOnly:1}}))",
            "vi.mock('./dep',async original=>{original=async()=>({mockOnly:1});return {...await \
             original()}})",
            "vi.mock('./dep',()=>({value:import.meta.url}))",
            "vi.mock('./dep',async original=>{let actual=await original();actual={extra:1};return \
             {...actual}})",
        ] {
            assert!(
                extract_static_mocks(&format!("import {{vi}} from 'vitest';{body}"), "spec.ts")
                    .is_err(),
                "accepted {body}"
            );
        }
    }

    #[test]
    fn rejects_client_and_server_directives_after_comments() {
        for source in [
            "/* comment */ 'use client'; export const value=1",
            "// comment\n'use strict'; 'use server'; export async function action() {}",
        ] {
            assert!(validate_mock_target_source(source, "target.ts").is_err());
        }
        assert!(
            validate_mock_target_source("export const value = 'use client'", "target.ts").is_ok()
        );
    }

    #[test]
    fn leaves_unmocked_javascript_jsx_unchanged() {
        let source =
            "import {test} from 'vitest'; const element = <div />; test('jsx', () => element);";
        let plan = extract_static_mocks(source, "spec.js").unwrap();
        assert_eq!(plan.source, source);
        assert!(plan.declarations.is_empty());
    }

    #[test]
    fn preserves_utf16_columns_after_unicode_call() {
        let source =
            "import {vi} from 'vitest'; vi.mock('./é😀', () => ({value: 1})); const after = 1;";
        let plan = extract_static_mocks(source, "spec.ts").unwrap();
        let original_column = source[..source.find("const after").unwrap()]
            .encode_utf16()
            .count();
        let stripped_column = plan.source[..plan.source.find("const after").unwrap()]
            .encode_utf16()
            .count();
        assert_eq!(original_column, stripped_column);
    }

    #[test]
    fn extracts_ordered_alias_factories_and_preserves_lines() {
        let source = "import { vi as v } from 'vitest';\nimport { value } from \
                      './subject';\nv.mock('./dep', async (original) => ({ ...(await original()), \
                      value: 'mock' }));\nv.mock('./other', () => ({ default: 42 }));\n";
        let plan = extract_static_mocks(source, "spec.ts").unwrap();
        assert_eq!(plan.declarations.len(), 2);
        assert_eq!(plan.declarations[0].request, "./dep");
        assert_eq!(plan.declarations[0].export_names, ["value"]);
        assert!(plan.declarations[0].has_spread);
        assert_eq!(plan.declarations[1].export_names, ["default"]);
        assert_eq!(plan.source.lines().count(), source.lines().count());
        assert!(plan.source.contains("import { value }"));
        assert!(!plan.source.contains("v.mock"));
        assert_eq!(&source[plan.declarations[0].factory_start..][..6], "async ");
    }

    #[test]
    fn accepts_type_safe_literal_import_targets() {
        let source = "import {vi} from 'vitest';vi.mock(import('./dep'), async (original) => ({ \
                      ...(await original()), value: 'mock' }));";
        let plan = extract_static_mocks(source, "spec.ts").unwrap();
        assert_eq!(plan.declarations.len(), 1);
        assert_eq!(plan.declarations[0].request, "./dep");
        assert_eq!(plan.declarations[0].export_names, ["value"]);
        assert!(plan.declarations[0].has_spread);
        assert!(!plan.source.contains("vi.mock"));
    }

    #[test]
    fn rejects_unsupported_forms_and_outer_captures() {
        for body in [
            "vi.mock(name, () => ({ value: 1 }));",
            "vi.mock(import(name), () => ({ value: 1 }));",
            "vi.mock(import('./dep', { with: { type: 'json' } }), () => ({ value: 1 }));",
            "vi.mock('./dep?raw', () => ({ value: 1 }));",
            "vi.mock('./é#fragment', () => ({ value: 1 }));",
            "vi.mock('./dep');",
            "vi.mock('./dep', { spy: true });",
            "function later() { vi.mock('./dep', () => ({ value: 1 })); }",
            "const value = 1; vi.mock('./dep', () => ({ value }));",
            "vi.mock('./dep', async () => ({ value: await import('./other') }));",
            "vi.mock('./dep', () => ({ [globalThis.key]: 1 }));",
            "vi.doMock('./dep', () => ({ value: 1 }));",
            "const mock = vi.mock; mock('./dep', () => ({ value: 1 }));",
            "const {mock} = vi; mock('./dep', () => ({value: 1}));",
            "const {mock: alias} = vi; alias('./dep', () => ({value: 1}));",
            "vi.mock('./dep', () => ({ value: vi.fn() }));",
        ] {
            assert!(
                extract_static_mocks(&format!("import {{vi}} from 'vitest';{body}"), "spec.ts")
                    .is_err(),
                "accepted {body}"
            );
        }
    }

    #[test]
    fn allows_factory_locals_and_respects_shadowing() {
        let plan = extract_static_mocks(
            "import { vi } from 'vitest'; vi.mock('./dep', async (original) => { const actual = \
             await original(); const value: number = 2; return { ...actual, value }; }); function \
             other(vi) { vi.mock('unrelated'); }",
            "spec.ts",
        )
        .unwrap();
        assert_eq!(plan.declarations.len(), 1);
        assert!(plan.source.contains("vi.mock('unrelated')"));
    }
}
