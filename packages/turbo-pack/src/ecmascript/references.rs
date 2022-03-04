use std::collections::HashMap;

use crate::{
    asset::AssetRef,
    module,
    reference::{AssetReference, AssetReferenceRef, AssetReferencesSet, AssetReferencesSetRef},
    resolve::{parse::RequestRef, resolve, resolve_options, ResolveResult, ResolveResultRef},
};
use swc_ecmascript::{
    ast::{
        CallExpr, Callee, ComputedPropName, Expr, ExprOrSpread, ImportDecl, ImportSpecifier, Lit,
        MemberProp, ModuleExportName,
    },
    visit::{self, Visit, VisitWith},
};
use turbo_tasks_fs::FileSystemPathRef;

use super::parse::{parse, ParseResult};

#[turbo_tasks::function]
pub async fn module_references(source: AssetRef) -> AssetReferencesSetRef {
    let parsed = parse(source).await;
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
        self.references
            .push(EsmAssetReferenceRef::new(src.clone()).into());
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
                            self.references.push(EsmAssetReferenceRef::new(str).into());
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
                                    self.references.push(EsmAssetReferenceRef::new(str).into());
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
                                        self.references.push(EsmAssetReferenceRef::new(str).into());
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

#[turbo_tasks::value(shared, AssetReference)]
#[derive(Hash, Clone, Debug, PartialEq, Eq)]
pub struct EsmAssetReference {
    pub request: String,
}

#[turbo_tasks::value_impl]
impl EsmAssetReference {
    #[turbo_tasks::constructor(intern)]
    pub fn new(request: String) -> Self {
        Self { request }
    }
}

#[turbo_tasks::function(request: resolved, context: resolved, return: resolved)]
async fn esm_resolve(request: RequestRef, context: FileSystemPathRef) -> ResolveResultRef {
    let options = resolve_options(context.clone());

    let result = resolve(context, request, options);

    match &*result.await {
        ResolveResult::Module(m) => {
            ResolveResult::Module(module(m.clone()).resolve_to_value().await).into()
        }
        ResolveResult::Unresolveable => ResolveResult::Unresolveable.into(),
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for EsmAssetReference {
    fn resolve(&self, from: AssetRef) -> ResolveResultRef {
        let input_request = self.request.clone();

        let request = RequestRef::parse(input_request);

        let context = from.path().parent();

        esm_resolve(request, context)
    }
}
