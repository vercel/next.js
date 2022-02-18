use std::collections::HashMap;

use crate::{
    module::ModuleRef,
    reference::{AssetReferenceRef, AssetReferencesSet, AssetReferencesSetRef},
};
use swc_ecmascript::{
    ast::{
        CallExpr, Callee, ComputedPropName, Expr, ExprOrSpread, ImportDecl, ImportSpecifier, Lit,
        MemberProp, ModuleExportName,
    },
    visit::{self, Visit, VisitWith},
};

use super::parse::{parse, ParseResult};

#[turbo_tasks::function]
pub async fn module_references(module: ModuleRef) -> AssetReferencesSetRef {
    let parsed = parse(module).await;
    match &*parsed {
        ParseResult::Ok(module) => {
            let mut visitor = AssetReferencesVisitor::default();
            module.visit_with(&mut visitor);
            AssetReferencesSet {
                references: visitor.references,
            }
            .into()
        }
        ParseResult::Unparseable | ParseResult::NotFound => AssetReferencesSetRef::empty(),
    }
}

enum StaticExpr {
    String(String),
    FreeVar(Vec<String>),
    ImportedVar(String, Vec<String>),
    Unknown,
}

#[derive(Default)]
struct StaticAnalyser {
    imports: HashMap<String, (String, Vec<String>)>,
}

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
            Expr::Ident(ident) => {
                let str = ident.sym.to_string();
                match self.imports.get(&str) {
                    Some((module, import)) => {
                        StaticExpr::ImportedVar(module.clone(), import.clone())
                    }
                    None => StaticExpr::FreeVar(vec![str]),
                }
            }
            Expr::Member(member) => match self.evaluate_expr(&member.obj) {
                StaticExpr::FreeVar(mut vec) => match self.prop_to_name(&member.prop) {
                    Some(name) => {
                        vec.push(name);
                        StaticExpr::FreeVar(vec)
                    }
                    None => StaticExpr::Unknown,
                },
                StaticExpr::ImportedVar(module, mut vec) => match self.prop_to_name(&member.prop) {
                    Some(name) => {
                        vec.push(name);
                        StaticExpr::ImportedVar(module, vec)
                    }
                    None => StaticExpr::Unknown,
                },
                _ => StaticExpr::Unknown,
            },
            _ => StaticExpr::Unknown,
        }
    }
}

#[derive(Default)]
struct AssetReferencesVisitor {
    analyser: StaticAnalyser,
    references: Vec<AssetReferenceRef>,
}

impl Visit for AssetReferencesVisitor {
    fn visit_import_decl(&mut self, import: &ImportDecl) {
        let src = import.src.value.to_string();
        self.references.push(AssetReferenceRef::new(src.clone()));
        visit::visit_import_decl(self, import);
        if import.type_only {
            return;
        }
        for specifier in &import.specifiers {
            match specifier {
                ImportSpecifier::Named(named) => {
                    if !named.is_type_only {
                        self.analyser.imports.insert(
                            named.local.sym.to_string(),
                            (
                                src.clone(),
                                vec![match &named.imported {
                                    Some(ModuleExportName::Ident(ident)) => ident.sym.to_string(),
                                    Some(ModuleExportName::Str(str)) => str.value.to_string(),
                                    None => named.local.sym.to_string(),
                                }],
                            ),
                        );
                    }
                }
                ImportSpecifier::Default(default_import) => {
                    self.analyser.imports.insert(
                        default_import.local.sym.to_string(),
                        (src.clone(), vec!["default".to_string()]),
                    );
                }
                ImportSpecifier::Namespace(namespace) => {
                    self.analyser
                        .imports
                        .insert(namespace.local.sym.to_string(), (src.clone(), Vec::new()));
                }
            }
        }
    }

    fn visit_call_expr(&mut self, call: &CallExpr) {
        match &call.callee {
            Callee::Super(_) => {}
            Callee::Import(_) => match &call.args[..] {
                [ExprOrSpread { expr, spread: None }] => {
                    let evaled_expr = self.analyser.evaluate_expr(&*expr);
                    match evaled_expr {
                        StaticExpr::String(str) => {
                            self.references.push(AssetReferenceRef::new(str));
                            return;
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
                                    self.references.push(AssetReferenceRef::new(str));
                                    return;
                                }
                                _ => todo!(),
                            }
                        }
                        _ => todo!(),
                    },
                    [module, fn_name] if module == "fs" && fn_name == "readFileSync" => {
                        match &call.args[..] {
                            [ExprOrSpread { expr, spread: None }, ..] => {
                                let evaled_expr = self.analyser.evaluate_expr(&*expr);
                                match evaled_expr {
                                    StaticExpr::String(str) => {
                                        self.references.push(AssetReferenceRef::new(str));
                                        return;
                                    }
                                    _ => todo!(),
                                }
                            }
                            _ => todo!(),
                        }
                    }
                    _ => {}
                },
                _ => {}
            },
        }
        visit::visit_call_expr(self, call);
    }
}
