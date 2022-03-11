use std::collections::HashMap;

use crate::{
    asset::AssetRef,
    errors, module,
    reference::{AssetReference, AssetReferenceRef, AssetReferencesSet, AssetReferencesSetRef},
    resolve::{
        options::ResolveOptionsRef, parse::RequestRef, resolve, resolve_options, ResolveResult,
        ResolveResultRef,
    },
};
use anyhow::Result;
use swc_common::{
    errors::{DiagnosticId, Handler, HANDLER},
    Spanned,
};
use swc_ecmascript::{
    ast::{
        CallExpr, Callee, ComputedPropName, Expr, ExprOrSpread, ImportDecl, ImportSpecifier, Lit,
        MemberProp, ModuleExportName,
    },
    visit::{self, Visit, VisitWith},
};
use turbo_tasks_fs::FileSystemPathRef;

use super::parse::{parse, Buffer, ParseResult};

#[turbo_tasks::function]
pub async fn module_references(source: AssetRef) -> Result<AssetReferencesSetRef> {
    let parsed = parse(source.clone()).await?;
    Ok(match &*parsed {
        ParseResult::Ok { module, source_map } => {
            let mut visitor = AssetReferencesVisitor::new(source);
            let buf = Buffer::new();
            let handler =
                Handler::with_emitter_writer(Box::new(buf.clone()), Some(source_map.clone()));
            HANDLER.set(&handler, || {
                module.visit_with(&mut visitor);
            });
            if !buf.is_empty() {
                // TODO report them in a stream
                println!("{}", buf);
            }
            AssetReferencesSet {
                references: visitor.references,
            }
            .into()
        }
        ParseResult::Unparseable | ParseResult::NotFound => AssetReferencesSetRef::empty(),
    })
}

#[derive(Debug)]
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

struct AssetReferencesVisitor {
    source: AssetRef,
    analyser: StaticAnalyser,
    references: Vec<AssetReferenceRef>,
}
impl AssetReferencesVisitor {
    fn new(source: AssetRef) -> Self {
        Self {
            source,
            analyser: StaticAnalyser::default(),
            references: Vec::new(),
        }
    }
}

impl Visit for AssetReferencesVisitor {
    fn visit_import_decl(&mut self, import: &ImportDecl) {
        let src = import.src.value.to_string();
        self.references
            .push(EsmAssetReferenceRef::new(self.source.clone(), src.clone()).into());
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
                            self.references
                                .push(EsmAssetReferenceRef::new(self.source.clone(), str).into());
                            return;
                        }
                        _ => {
                            HANDLER.with(|handler| {
                                handler.span_warn_with_code(
                                    expr.span(),
                                    &format!(
                                        "import({:?}) is not statically analyse-able",
                                        evaled_expr
                                    ),
                                    DiagnosticId::Error(
                                        errors::failed_to_analyse::ecmascript::DYNAMIC_IMPORT
                                            .to_string(),
                                    ),
                                )
                            });
                        }
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
                                    self.references.push(
                                        EsmAssetReferenceRef::new(self.source.clone(), str).into(),
                                    );
                                    return;
                                }
                                _ => {
                                    HANDLER.with(|handler| {
                                        handler.span_warn_with_code(
                                            expr.span(),
                                            &format!(
                                                "require({:?}) is not statically analyse-able",
                                                evaled_expr
                                            ),
                                            DiagnosticId::Error(
                                                errors::failed_to_analyse::ecmascript::REQUIRE
                                                    .to_string(),
                                            ),
                                        )
                                    });
                                }
                            }
                        }
                        _ => {
                            HANDLER.with(|handler| {
                                handler.span_warn_with_code(
                                    expr.span(),
                                    &format!(
                                        "require() has unexpected arguments and is not statically analyse-able"
                                    ),
                                    DiagnosticId::Error(errors::failed_to_analyse::ecmascript::REQUIRE
                                        .to_string()),
                                )
                            });
                        }
                    },
                    [module, fn_name] if module == "fs" && fn_name == "readFileSync" => {
                        match &call.args[..] {
                            [ExprOrSpread { expr, spread: None }, ..] => {
                                let evaled_expr = self.analyser.evaluate_expr(&*expr);
                                match evaled_expr {
                                    StaticExpr::String(str) => {
                                        self.references.push(
                                            EsmAssetReferenceRef::new(self.source.clone(), str)
                                                .into(),
                                        );
                                        return;
                                    }
                                    _ => {
                                        HANDLER.with(|handler| {
                                        handler.span_warn_with_code(
                                            expr.span(),
                                            &format!(
                                                "fs.{}({:?}) is not statically analyse-able",
                                                fn_name, evaled_expr
                                            ),
                                            DiagnosticId::Error(errors::failed_to_analyse::ecmascript::FS_METHOD
                                                .to_string()),
                                        )
                                    });
                                    }
                                }
                            }
                            _ => {
                                HANDLER.with(|handler| {
                                    handler.span_warn_with_code(
                                        expr.span(),
                                        &format!(
                                            "fs.{}() has unexpected arguments and is not statically analyse-able",
                                            fn_name
                                        ),
                                        DiagnosticId::Error(errors::failed_to_analyse::ecmascript::FS_METHOD
                                            .to_string()),
                                    )
                                });
                            }
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

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Clone, Debug, PartialEq, Eq)]
pub struct EsmAssetReference {
    pub source: AssetRef,
    pub request: String,
}

#[turbo_tasks::value_impl]
impl EsmAssetReferenceRef {
    pub fn new(source: AssetRef, request: String) -> Self {
        Self::slot(EsmAssetReference { source, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for EsmAssetReference {
    fn resolve_reference(&self) -> ResolveResultRef {
        let input_request = self.request.clone();

        let request = RequestRef::parse(input_request);

        let context = self.source.path().parent();

        esm_resolve(request, context)
    }
}

#[turbo_tasks::function]
async fn apply_esm_specific_options(options: ResolveOptionsRef) -> ResolveOptionsRef {
    // TODO magic
    options
}

#[turbo_tasks::function]
async fn esm_resolve(request: RequestRef, context: FileSystemPathRef) -> Result<ResolveResultRef> {
    let options = resolve_options(context.clone());

    let options = apply_esm_specific_options(options);

    let result = resolve(context.clone(), request.clone(), options);

    Ok(match &*result.await? {
        ResolveResult::Single(m, None) => {
            ResolveResult::Single(module(m.clone()).resolve().await?, None).into()
        }
        ResolveResult::Unresolveable => {
            // TODO report this to stream
            println!(
                "unable to resolve esm request {} in {}",
                request.get().await?,
                context.get().await?
            );
            ResolveResult::Unresolveable.into()
        }
        _ => todo!(),
    })
}
