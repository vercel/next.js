use crate::{
    module::ModuleRef,
    reference::{ModuleReferenceRef, ModuleReferencesSet, ModuleReferencesSetRef},
};
use swc_ecmascript::{
    ast::{CallExpr, Callee, ComputedPropName, Expr, ExprOrSpread, ImportDecl, Lit, MemberProp},
    visit::{self, Visit, VisitWith},
};

use super::parse::{parse, ParseResult};

#[turbo_tasks::function]
pub async fn module_references(module: ModuleRef) -> ModuleReferencesSetRef {
    let parsed = parse(module).await;
    match &*parsed {
        ParseResult::Ok(module) => {
            let mut visitor = ModuleReferencesVisitor::default();
            module.visit_with(&mut visitor);
            ModuleReferencesSet {
                references: visitor.references,
            }
            .into()
        }
        ParseResult::Unparseable | ParseResult::NotFound => ModuleReferencesSetRef::empty(),
    }
}

enum StaticExpr {
    String(String),
    FreeVar(Vec<String>),
    ImportedVar(String, Vec<String>),
    Unknown,
}

#[derive(Default)]
struct StaticAnalyser {}

impl StaticAnalyser {
    fn prop_to_name(&self, prop: &MemberProp) -> Option<String> {
        match prop {
            MemberProp::Ident(ident) => Some(ident.sym.to_string()),
            MemberProp::PrivateName(_) => None,
            MemberProp::Computed(ComputedPropName { expr, .. }) => {
                match self.evaluate_expr(&**expr) {
                    StaticExpr::String(str) => Some(str),
                    _ => None,
                }
            }
        }
    }

    fn evaluate_expr(&self, expr: &Expr) -> StaticExpr {
        match expr {
            Expr::Lit(Lit::Str(str)) => StaticExpr::String(str.value.to_string()),
            Expr::Ident(ident) => StaticExpr::FreeVar(vec![ident.sym.to_string()]),
            Expr::Member(member) => match self.evaluate_expr(&member.obj) {
                StaticExpr::FreeVar(mut vec) => match self.prop_to_name(&member.prop) {
                    Some(name) => {
                        vec.push(name);
                        StaticExpr::FreeVar(vec)
                    }
                    None => StaticExpr::Unknown,
                },
                StaticExpr::ImportedVar(_, _) => todo!(),
                _ => StaticExpr::Unknown,
            },
            _ => StaticExpr::Unknown,
        }
    }
}

#[derive(Default)]
struct ModuleReferencesVisitor {
    analyser: StaticAnalyser,
    references: Vec<ModuleReferenceRef>,
}

impl Visit for ModuleReferencesVisitor {
    fn visit_import_decl(&mut self, import: &ImportDecl) {
        self.references
            .push(ModuleReferenceRef::new(import.src.value.to_string()));
        visit::visit_import_decl(self, import);
    }

    fn visit_call_expr(&mut self, call: &CallExpr) {
        match &call.callee {
            Callee::Super(_) => {}
            Callee::Import(_) => match &call.args[..] {
                [ExprOrSpread { expr, spread: None }] => {
                    let evaled_expr = self.analyser.evaluate_expr(&*expr);
                    match evaled_expr {
                        StaticExpr::String(str) => {
                            self.references.push(ModuleReferenceRef::new(str));
                        }
                        _ => todo!(),
                    }
                }
                _ => {}
            },
            Callee::Expr(expr) => match self.analyser.evaluate_expr(&expr) {
                StaticExpr::FreeVar(var) => match &var[..] {
                    [fn_name] if fn_name == "require" => match &call.args[..] {
                        [ExprOrSpread { expr, spread: None }] => {
                            let evaled_expr = self.analyser.evaluate_expr(&*expr);
                            match evaled_expr {
                                StaticExpr::String(str) => {
                                    self.references.push(ModuleReferenceRef::new(str));
                                }
                                _ => todo!(),
                            }
                        }
                        _ => todo!(),
                    },
                    _ => {}
                },
                _ => {}
            },
        }
        visit::visit_call_expr(self, call);
    }
}
