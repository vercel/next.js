use std::{cell::RefCell, collections::HashMap, lazy::Lazy};

use crate::{
    analyzer::{
        graph::{create_graph, Effect},
        linker::{link, LinkCache},
        FreeVarKind, JsValue,
    },
    asset::AssetRef,
    ecmascript::pattern::Pattern,
    errors,
    reference::{AssetReference, AssetReferenceRef, AssetReferencesSet, AssetReferencesSetRef},
    resolve::{
        find_package_json, parse::RequestRef, resolve, resolve_options, FindPackageJsonResult,
        ResolveResult, ResolveResultRef,
    },
    source_asset::SourceAssetRef,
};
use anyhow::Result;
use swc_common::{
    errors::{DiagnosticId, Handler, HANDLER},
    Span, Spanned, GLOBALS,
};
use swc_ecmascript::{
    ast::{
        CallExpr, Callee, ComputedPropName, ExportAll, Expr, ExprOrSpread, ImportDecl,
        ImportSpecifier, Lit, MemberProp, ModuleExportName, NamedExport, VarDeclarator,
    },
    visit::{self, Visit, VisitWith},
};
use turbo_tasks_fs::FileSystemPathRef;

use super::{
    parse::{parse, Buffer, ParseResult},
    resolve::{apply_cjs_specific_options, esm_resolve},
    webpack::{
        parse::{is_webpack_runtime, WebpackRuntime, WebpackRuntimeRef},
        PotentialWebpackRuntimeAssetReference, WebpackChunkAssetReference,
        WebpackEntryAssetReference,
    },
};

#[turbo_tasks::function]
pub async fn module_references(source: AssetRef) -> Result<AssetReferencesSetRef> {
    let mut references = Vec::new();

    match &*find_package_json(source.path().parent()).await? {
        FindPackageJsonResult::Found(package_json) => {
            references.push(PackageJsonReferenceRef::new(package_json.clone()).into());
        }
        FindPackageJsonResult::NotFound => {}
    };

    let parsed = parse(source.clone()).await?;
    match &*parsed {
        ParseResult::Ok {
            module,
            globals,
            eval_context,
            source_map,
        } => {
            let buf = Buffer::new();
            let handler =
                Handler::with_emitter_writer(Box::new(buf.clone()), Some(source_map.clone()));
            HANDLER.set(&handler, || {
                GLOBALS.set(globals, || {
                    let var_graph = create_graph(&module, eval_context);

                    // TODO migrate to effects
                    let mut visitor = AssetReferencesVisitor::new(&source, &mut references);
                    module.visit_with(&mut visitor);

                    fn handle_call<T: Fn() -> JsValue, F: Fn() -> Vec<JsValue>>(
                        handler: &Handler,
                        source: &AssetRef,
                        span: &Span,
                        func: JsValue,
                        this: &Lazy<JsValue, T>,
                        args: &Lazy<Vec<JsValue>, F>,
                        references: &mut Vec<AssetReferenceRef>,
                    ) {
                        match func {
                            JsValue::Alternatives(alts) => {
                                for alt in alts {
                                    handle_call(handler, source, span, alt, this, args, references);
                                }
                            }
                            JsValue::FreeVar(FreeVarKind::Import) => {
                                if args.len() == 1 {
                                    let pat = Pattern::from(&args[0]);
                                    if let Some(str) = pat.into_string() {
                                        references.push(
                                            EsmAssetReferenceRef::new(source.clone(), str).into(),
                                        );
                                        return;
                                    }
                                }
                                handler.span_warn_with_code(
                                    *span,
                                    &format!("import({:?}) is not statically analyse-able", **args),
                                    DiagnosticId::Error(
                                        errors::failed_to_analyse::ecmascript::DYNAMIC_IMPORT
                                            .to_string(),
                                    ),
                                )
                            }
                            JsValue::FreeVar(FreeVarKind::Require) => {
                                if args.len() == 1 {
                                    let pat = Pattern::from(&args[0]);
                                    if let Some(str) = pat.into_string() {
                                        references.push(
                                            EsmAssetReferenceRef::new(source.clone(), str).into(),
                                        );
                                        return;
                                    }
                                }
                                handler.span_warn_with_code(
                                    *span,
                                    &format!(
                                        "require({:?}) is not statically analyse-able",
                                        **args
                                    ),
                                    DiagnosticId::Error(
                                        errors::failed_to_analyse::ecmascript::REQUIRE.to_string(),
                                    ),
                                )
                            }
                            JsValue::Member(box JsValue::FreeVar(FreeVarKind::Require), prop) => {
                                match &*prop {
                                    "resolve" => handler.span_warn_with_code(
                                        *span,
                                        &format!(
                                            "require.resolve({:?}) is not statically analyse-able",
                                            **args
                                        ),
                                        DiagnosticId::Error(
                                            errors::failed_to_analyse::ecmascript::REQUIRE
                                                .to_string(),
                                        ),
                                    ),
                                    _ => handler.span_warn_with_code(
                                        *span,
                                        &format!(
                                            "require.{prop}({:?}) is not statically analyse-able",
                                            **args
                                        ),
                                        DiagnosticId::Error(
                                            errors::failed_to_analyse::ecmascript::REQUIRE
                                                .to_string(),
                                        ),
                                    ),
                                }
                            }
                            _ => {}
                        }
                    }

                    let cache = RefCell::new(LinkCache::new());
                    for effect in var_graph.effects.iter() {
                        match effect {
                            Effect::Call {
                                func,
                                this,
                                args,
                                span,
                            } => {
                                let func = link(&var_graph, func, &mut cache.borrow_mut());
                                let this =
                                    Lazy::new(|| link(&var_graph, this, &mut cache.borrow_mut()));
                                let args = Lazy::new(|| {
                                    args.iter()
                                        .map(|arg| link(&var_graph, arg, &mut cache.borrow_mut()))
                                        .collect()
                                });

                                handle_call(
                                    &handler,
                                    &source,
                                    &span,
                                    func,
                                    &this,
                                    &args,
                                    &mut references,
                                );
                            }
                        }
                    }
                })
            });
            if !buf.is_empty() {
                // TODO report them in a stream
                println!("{}", buf);
            }
        }
        ParseResult::Unparseable | ParseResult::NotFound => {}
    };
    Ok(AssetReferencesSet { references }.into())
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

struct AssetReferencesVisitor<'a> {
    source: &'a AssetRef,
    old_analyser: StaticAnalyser,
    references: &'a mut Vec<AssetReferenceRef>,
    webpack_runtime: Option<WebpackRuntimeRef>,
}
impl<'a> AssetReferencesVisitor<'a> {
    fn new(source: &'a AssetRef, references: &'a mut Vec<AssetReferenceRef>) -> Self {
        Self {
            source,
            old_analyser: StaticAnalyser::default(),
            references,
            webpack_runtime: None,
        }
    }
}

impl<'a> Visit for AssetReferencesVisitor<'a> {
    fn visit_export_all(&mut self, export: &ExportAll) {
        let src = export.src.value.to_string();
        self.references
            .push(EsmAssetReferenceRef::new(self.source.clone(), src.clone()).into());
        visit::visit_export_all(self, export);
    }
    fn visit_named_export(&mut self, export: &NamedExport) {
        if let Some(src) = &export.src {
            let src = src.value.to_string();
            self.references
                .push(EsmAssetReferenceRef::new(self.source.clone(), src.clone()).into());
        }
        visit::visit_named_export(self, export);
    }
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
                        self.old_analyser.imports.insert(
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
                    self.old_analyser.imports.insert(
                        default_import.local.sym.to_string(),
                        (src.clone(), vec!["default".to_string()]),
                    );
                }
                ImportSpecifier::Namespace(namespace) => {
                    self.old_analyser
                        .imports
                        .insert(namespace.local.sym.to_string(), (src.clone(), Vec::new()));
                }
            }
        }
    }

    fn visit_var_declarator(&mut self, decl: &VarDeclarator) {
        if let Some(ident) = decl.name.as_ident() {
            if &*ident.id.sym == "__webpack_require__" {
                if let Some(init) = &decl.init {
                    if let Some(call) = init.as_call() {
                        if let Some(expr) = call.callee.as_expr() {
                            if let Some(ident) = expr.as_ident() {
                                if &*ident.sym == "require" {
                                    if let [ExprOrSpread { spread: None, expr }] = &call.args[..] {
                                        if let Some(lit) = expr.as_lit() {
                                            if let Lit::Str(str) = lit {
                                                self.webpack_runtime =
                                                    Some(resolve_as_webpack_runtime(
                                                        self.source.path().parent(),
                                                        &*str.value,
                                                    ));
                                                self.references.push(
                                                    PotentialWebpackRuntimeAssetReference {
                                                        source: self.source.clone(),
                                                        request: str.value.to_string(),
                                                    }
                                                    .into(),
                                                );
                                                return;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        visit::visit_var_declarator(self, decl);
    }

    fn visit_call_expr(&mut self, call: &CallExpr) {
        match &call.callee {
            Callee::Expr(expr) => match self.old_analyser.evaluate_expr(&expr) {
                StaticExpr::FreeVar(var) => match &var[..] {
                    [webpack_require, property]
                        if webpack_require == "__webpack_require__" && property == "C" =>
                    {
                        if let Some(runtime) = self.webpack_runtime.as_ref() {
                            self.references.push(
                                WebpackEntryAssetReference {
                                    source: self.source.clone(),
                                    runtime: runtime.clone(),
                                }
                                .into(),
                            );
                        }
                    }
                    [webpack_require, property]
                        if webpack_require == "__webpack_require__" && property == "X" =>
                    {
                        if let Some(runtime) = self.webpack_runtime.as_ref() {
                            if let [_, ExprOrSpread {
                                spread: None,
                                expr: chunk_ids,
                            }, _] = &call.args[..]
                            {
                                if let Some(array) = chunk_ids.as_array() {
                                    for elem in array.elems.iter() {
                                        if let Some(ExprOrSpread { spread: None, expr }) = elem {
                                            if let Some(lit) = expr.as_lit() {
                                                self.references.push(
                                                    WebpackChunkAssetReference {
                                                        chunk_id: lit.clone(),
                                                        runtime: runtime.clone(),
                                                    }
                                                    .into(),
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    [module, fn_name] if module == "fs" && fn_name == "readFileSync" => {
                        match &call.args[..] {
                            [ExprOrSpread { expr, spread: None }, ..] => {
                                let evaled_expr = self.old_analyser.evaluate_expr(&*expr);
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
                                            "fs.{}() has unexpected arguments and is not \
                                             statically analyse-able",
                                            fn_name
                                        ),
                                        DiagnosticId::Error(
                                            errors::failed_to_analyse::ecmascript::FS_METHOD
                                                .to_string(),
                                        ),
                                    )
                                });
                            }
                        }
                    }
                    _ => {}
                },
                _ => {}
            },
            _ => {}
        }
        visit::visit_call_expr(self, call);
    }
}

#[turbo_tasks::function]
async fn resolve_as_webpack_runtime(
    context: FileSystemPathRef,
    request: &str,
) -> Result<WebpackRuntimeRef> {
    let input_request = request.to_string();

    let request = RequestRef::parse(input_request);

    let options = resolve_options(context.clone());

    let options = apply_cjs_specific_options(options);

    let resolved = resolve(context.clone(), request.clone(), options);

    if let ResolveResult::Single(source, _) = &*resolved.await? {
        Ok(is_webpack_runtime(source.clone()))
    } else {
        Ok(WebpackRuntime::None.into())
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Clone, Debug, PartialEq, Eq)]
pub struct PackageJsonReference {
    pub package_json: FileSystemPathRef,
}

#[turbo_tasks::value_impl]
impl PackageJsonReferenceRef {
    pub fn new(package_json: FileSystemPathRef) -> Self {
        Self::slot(PackageJsonReference { package_json })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for PackageJsonReference {
    fn resolve_reference(&self) -> ResolveResultRef {
        ResolveResult::Single(SourceAssetRef::new(self.package_json.clone()).into(), None).into()
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug, PartialEq, Eq)]
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
