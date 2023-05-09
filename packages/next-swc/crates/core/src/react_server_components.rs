use std::{collections::HashMap, path::PathBuf};

use regex::Regex;
use serde::Deserialize;
use turbo_binding::swc::core::{
    common::{
        comments::{Comment, CommentKind, Comments},
        errors::HANDLER,
        FileName, Span, Spanned, DUMMY_SP,
    },
    ecma::{
        ast::*,
        atoms::{js_word, JsWord},
        utils::{prepend_stmts, quote_ident, quote_str, ExprFactory},
        visit::{as_folder, noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
    },
};

use crate::auto_cjs::contains_cjs;

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub enum Config {
    All(bool),
    WithOptions(Options),
}

impl Config {
    pub fn truthy(&self) -> bool {
        match self {
            Config::All(b) => *b,
            Config::WithOptions(_) => true,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    pub is_server: bool,
}

struct ReactServerComponents<C: Comments> {
    is_server: bool,
    filepath: String,
    app_dir: Option<PathBuf>,
    comments: C,
    export_names: Vec<String>,
    invalid_server_imports: Vec<JsWord>,
    invalid_client_imports: Vec<JsWord>,
    invalid_server_react_apis: Vec<JsWord>,
    invalid_server_react_dom_apis: Vec<JsWord>,
}

struct ModuleImports {
    source: (JsWord, Span),
    specifiers: Vec<(JsWord, Span)>,
}

impl<C: Comments> VisitMut for ReactServerComponents<C> {
    noop_visit_mut_type!();

    fn visit_mut_module(&mut self, module: &mut Module) {
        let (is_client_entry, is_action_file, imports) =
            self.collect_top_level_directives_and_imports(module);
        let is_cjs = contains_cjs(module);

        if self.is_server {
            if !is_client_entry {
                self.assert_server_graph(&imports, module);
            } else {
                self.to_module_ref(module, is_cjs);
                return;
            }
        } else {
            if !is_action_file {
                self.assert_client_graph(&imports, module);
            }
            if is_client_entry {
                self.prepend_comment_node(module, is_cjs);
            }
        }
        module.visit_mut_children_with(self)
    }
}

impl<C: Comments> ReactServerComponents<C> {
    // Collects top level directives and imports, then removes specific ones
    // from the AST.
    fn collect_top_level_directives_and_imports(
        &mut self,
        module: &mut Module,
    ) -> (bool, bool, Vec<ModuleImports>) {
        let mut imports: Vec<ModuleImports> = vec![];
        let mut finished_directives = false;
        let mut is_client_entry = false;
        let mut is_action_file = false;

        fn panic_both_directives(span: Span) {
            // It's not possible to have both directives in the same file.
            HANDLER.with(|handler| {
                handler
                    .struct_span_err(
                        span,
                        "It's not possible to have both `use client` and `use server` directives \
                         in the same file.",
                    )
                    .emit()
            })
        }

        let _ = &module.body.retain(|item| {
            match item {
                ModuleItem::Stmt(stmt) => {
                    if !stmt.is_expr() {
                        // Not an expression.
                        finished_directives = true;
                    }

                    match stmt.as_expr() {
                        Some(expr_stmt) => {
                            match &*expr_stmt.expr {
                                Expr::Lit(Lit::Str(Str { value, .. })) => {
                                    if &**value == "use client" {
                                        if !finished_directives {
                                            is_client_entry = true;

                                            if is_action_file {
                                                panic_both_directives(expr_stmt.span)
                                            }
                                        } else {
                                            HANDLER.with(|handler| {
                                                handler
                                                    .struct_span_err(
                                                        expr_stmt.span,
                                                        "NEXT_RSC_ERR_CLIENT_DIRECTIVE",
                                                    )
                                                    .emit()
                                            })
                                        }

                                        // Remove the directive.
                                        return false;
                                    } else if &**value == "use server" && !finished_directives {
                                        is_action_file = true;

                                        if is_client_entry {
                                            panic_both_directives(expr_stmt.span)
                                        }
                                    }
                                }
                                // Match `ParenthesisExpression` which is some formatting tools
                                // usually do: ('use client'). In these case we need to throw
                                // an exception because they are not valid directives.
                                Expr::Paren(ParenExpr { expr, .. }) => {
                                    finished_directives = true;
                                    if let Expr::Lit(Lit::Str(Str { value, .. })) = &**expr {
                                        if &**value == "use client" {
                                            HANDLER.with(|handler| {
                                                handler
                                                    .struct_span_err(
                                                        expr_stmt.span,
                                                        "NEXT_RSC_ERR_CLIENT_DIRECTIVE_PAREN",
                                                    )
                                                    .emit()
                                            })
                                        }
                                    }
                                }
                                _ => {
                                    // Other expression types.
                                    finished_directives = true;
                                }
                            }
                        }
                        None => {
                            // Not an expression.
                            finished_directives = true;
                        }
                    }
                }
                ModuleItem::ModuleDecl(ModuleDecl::Import(import)) => {
                    let source = import.src.value.clone();
                    let specifiers = import
                        .specifiers
                        .iter()
                        .map(|specifier| match specifier {
                            ImportSpecifier::Named(named) => match &named.imported {
                                Some(imported) => match &imported {
                                    ModuleExportName::Ident(i) => (i.to_id().0, i.span),
                                    ModuleExportName::Str(s) => (s.value.clone(), s.span),
                                },
                                None => (named.local.to_id().0, named.local.span),
                            },
                            ImportSpecifier::Default(d) => (js_word!(""), d.span),
                            ImportSpecifier::Namespace(n) => ("*".into(), n.span),
                        })
                        .collect();

                    imports.push(ModuleImports {
                        source: (source, import.span),
                        specifiers,
                    });

                    finished_directives = true;
                }
                // Collect all export names.
                ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(e)) => {
                    for specifier in &e.specifiers {
                        self.export_names.push(match specifier {
                            ExportSpecifier::Default(_) => "default".to_string(),
                            ExportSpecifier::Namespace(_) => "*".to_string(),
                            ExportSpecifier::Named(named) => match &named.exported {
                                Some(exported) => match &exported {
                                    ModuleExportName::Ident(i) => i.sym.to_string(),
                                    ModuleExportName::Str(s) => s.value.to_string(),
                                },
                                _ => match &named.orig {
                                    ModuleExportName::Ident(i) => i.sym.to_string(),
                                    ModuleExportName::Str(s) => s.value.to_string(),
                                },
                            },
                        })
                    }
                }
                ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl { decl, .. })) => {
                    match decl {
                        Decl::Class(ClassDecl { ident, .. }) => {
                            self.export_names.push(ident.sym.to_string());
                        }
                        Decl::Fn(FnDecl { ident, .. }) => {
                            self.export_names.push(ident.sym.to_string());
                        }
                        Decl::Var(var) => {
                            for decl in &var.decls {
                                if let Pat::Ident(ident) = &decl.name {
                                    self.export_names.push(ident.id.sym.to_string());
                                }
                            }
                        }
                        _ => {}
                    }
                }
                ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultDecl(ExportDefaultDecl {
                    decl: _,
                    ..
                })) => {
                    self.export_names.push("default".to_string());
                }
                ModuleItem::ModuleDecl(ModuleDecl::ExportAll(_)) => {
                    self.export_names.push("*".to_string());
                }
                _ => {
                    finished_directives = true;
                }
            }
            true
        });

        (is_client_entry, is_action_file, imports)
    }

    // Convert the client module to the module reference code and add a special
    // comment to the top of the file.
    fn to_module_ref(&self, module: &mut Module, is_cjs: bool) {
        // Clear all the statements and module declarations.
        module.body.clear();

        let proxy_ident = quote_ident!("createProxy");
        let filepath = quote_str!(&*self.filepath);

        prepend_stmts(
            &mut module.body,
            vec![
                ModuleItem::Stmt(Stmt::Decl(Decl::Var(Box::new(VarDecl {
                    span: DUMMY_SP,
                    kind: VarDeclKind::Const,
                    decls: vec![VarDeclarator {
                        span: DUMMY_SP,
                        name: Pat::Object(ObjectPat {
                            span: DUMMY_SP,
                            props: vec![ObjectPatProp::Assign(AssignPatProp {
                                span: DUMMY_SP,
                                key: proxy_ident,
                                value: None,
                            })],
                            optional: false,
                            type_ann: None,
                        }),
                        init: Some(Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: quote_ident!("require").as_callee(),
                            args: vec![quote_str!("private-next-rsc-mod-ref-proxy").as_arg()],
                            type_args: Default::default(),
                        }))),
                        definite: false,
                    }],
                    declare: false,
                })))),
                ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                    span: DUMMY_SP,
                    expr: Box::new(Expr::Assign(AssignExpr {
                        span: DUMMY_SP,
                        left: PatOrExpr::Expr(Box::new(Expr::Member(MemberExpr {
                            span: DUMMY_SP,
                            obj: Box::new(Expr::Ident(quote_ident!("module"))),
                            prop: MemberProp::Ident(quote_ident!("exports")),
                        }))),
                        op: op!("="),
                        right: Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: quote_ident!("createProxy").as_callee(),
                            args: vec![filepath.as_arg()],
                            type_args: Default::default(),
                        })),
                    })),
                })),
            ]
            .into_iter(),
        );

        self.prepend_comment_node(module, is_cjs);
    }

    fn assert_server_graph(&self, imports: &[ModuleImports], module: &Module) {
        for import in imports {
            let source = import.source.0.clone();
            if self.invalid_server_imports.contains(&source) {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(
                            import.source.1,
                            format!("NEXT_RSC_ERR_SERVER_IMPORT: {}", source).as_str(),
                        )
                        .emit()
                })
            }
            if source == *"react" {
                for specifier in &import.specifiers {
                    if self.invalid_server_react_apis.contains(&specifier.0) {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    specifier.1,
                                    format!("NEXT_RSC_ERR_REACT_API: {}", &specifier.0).as_str(),
                                )
                                .emit()
                        })
                    }
                }
            }
            if source == *"react-dom" {
                for specifier in &import.specifiers {
                    if self.invalid_server_react_dom_apis.contains(&specifier.0) {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    specifier.1,
                                    format!("NEXT_RSC_ERR_REACT_API: {}", &specifier.0).as_str(),
                                )
                                .emit()
                        })
                    }
                }
            }
        }

        self.assert_invalid_api(module, false);
        self.assert_server_filename(module);
    }

    fn assert_server_filename(&self, module: &Module) {
        let is_error_file = Regex::new(r"/error\.(ts|js)x?$")
            .unwrap()
            .is_match(&self.filepath);
        if is_error_file {
            if let Some(app_dir) = &self.app_dir {
                if let Some(app_dir) = app_dir.to_str() {
                    if self.filepath.starts_with(app_dir) {
                        HANDLER.with(|handler| {
                            let span = if let Some(first_item) = module.body.first() {
                                first_item.span()
                            } else {
                                module.span
                            };

                            handler
                                .struct_span_err(span, "NEXT_RSC_ERR_ERROR_FILE_SERVER_COMPONENT")
                                .emit()
                        })
                    }
                }
            }
        }
    }

    fn assert_client_graph(&self, imports: &[ModuleImports], module: &Module) {
        for import in imports {
            let source = import.source.0.clone();
            if self.invalid_client_imports.contains(&source) {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(
                            import.source.1,
                            format!("NEXT_RSC_ERR_CLIENT_IMPORT: {}", source).as_str(),
                        )
                        .emit()
                })
            }
        }

        self.assert_invalid_api(module, true);
    }

    fn assert_invalid_api(&self, module: &Module, is_client_entry: bool) {
        let is_layout_or_page = Regex::new(r"/(page|layout)\.(ts|js)x?$")
            .unwrap()
            .is_match(&self.filepath);

        if is_layout_or_page {
            let mut span = DUMMY_SP;
            let mut invalid_export_name = String::new();
            let mut invalid_exports: HashMap<String, bool> = HashMap::new();

            fn invalid_exports_matcher(
                export_name: &str,
                invalid_exports: &mut HashMap<String, bool>,
            ) -> bool {
                match export_name {
                    "getServerSideProps" | "getStaticProps" | "generateMetadata" | "metadata" => {
                        invalid_exports.insert(export_name.to_string(), true);
                        true
                    }
                    _ => false,
                }
            }

            for export in &module.body {
                match export {
                    ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(export)) => {
                        for specifier in &export.specifiers {
                            if let ExportSpecifier::Named(named) = specifier {
                                match &named.orig {
                                    ModuleExportName::Ident(i) => {
                                        if invalid_exports_matcher(&i.sym, &mut invalid_exports) {
                                            span = named.span;
                                            invalid_export_name = i.sym.to_string();
                                        }
                                    }
                                    ModuleExportName::Str(s) => {
                                        if invalid_exports_matcher(&s.value, &mut invalid_exports) {
                                            span = named.span;
                                            invalid_export_name = s.value.to_string();
                                        }
                                    }
                                }
                            }
                        }
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export)) => match &export.decl {
                        Decl::Fn(f) => {
                            if invalid_exports_matcher(&f.ident.sym, &mut invalid_exports) {
                                span = f.ident.span;
                                invalid_export_name = f.ident.sym.to_string();
                            }
                        }
                        Decl::Var(v) => {
                            for decl in &v.decls {
                                if let Pat::Ident(i) = &decl.name {
                                    if invalid_exports_matcher(&i.sym, &mut invalid_exports) {
                                        span = i.span;
                                        invalid_export_name = i.sym.to_string();
                                    }
                                }
                            }
                        }
                        _ => {}
                    },
                    _ => {}
                }
            }

            // Assert invalid metadata and generateMetadata exports.
            let has_gm_export = invalid_exports.contains_key("generateMetadata");
            let has_metadata_export = invalid_exports.contains_key("metadata");

            // Client entry can't export `generateMetadata` or `metadata`.
            if is_client_entry {
                if has_gm_export || has_metadata_export {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                span,
                                format!(
                                    "NEXT_RSC_ERR_CLIENT_METADATA_EXPORT: {}",
                                    invalid_export_name
                                )
                                .as_str(),
                            )
                            .emit()
                    })
                }
            } else {
                // Server entry can't export `generateMetadata` and `metadata` together.
                if has_gm_export && has_metadata_export {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(span, "NEXT_RSC_ERR_CONFLICT_METADATA_EXPORT")
                            .emit()
                    })
                }
            }
            // Assert `getServerSideProps` and `getStaticProps` exports.
            if invalid_export_name == "getServerSideProps"
                || invalid_export_name == "getStaticProps"
            {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(
                            span,
                            format!("NEXT_RSC_ERR_INVALID_API: {}", invalid_export_name).as_str(),
                        )
                        .emit()
                })
            }
        }
    }

    fn prepend_comment_node(&self, module: &Module, is_cjs: bool) {
        // Prepend a special comment to the top of the file that contains
        // module export names and the detected module type.
        self.comments.add_leading(
            module.span.lo,
            Comment {
                span: DUMMY_SP,
                kind: CommentKind::Block,
                text: format!(
                    " __next_internal_client_entry_do_not_use__ {} {} ",
                    self.export_names.join(","),
                    if is_cjs { "cjs" } else { "auto" }
                )
                .into(),
            },
        );
    }
}

pub fn server_components<C: Comments>(
    filename: FileName,
    config: Config,
    comments: C,
    app_dir: Option<PathBuf>,
) -> impl Fold + VisitMut {
    let is_server: bool = match config {
        Config::WithOptions(x) => x.is_server,
        _ => true,
    };
    as_folder(ReactServerComponents {
        is_server,
        comments,
        filepath: filename.to_string(),
        app_dir,
        export_names: vec![],
        invalid_server_imports: vec![
            JsWord::from("client-only"),
            JsWord::from("react-dom/client"),
            JsWord::from("react-dom/server"),
            JsWord::from("next/router"),
        ],
        invalid_client_imports: vec![JsWord::from("server-only"), JsWord::from("next/headers")],
        invalid_server_react_dom_apis: vec![
            JsWord::from("findDOMNode"),
            JsWord::from("flushSync"),
            JsWord::from("unstable_batchedUpdates"),
            JsWord::from("experimental_useFormStatus"),
            JsWord::from("experimental_useOptimistic"),
        ],
        invalid_server_react_apis: vec![
            JsWord::from("Component"),
            JsWord::from("createContext"),
            JsWord::from("createFactory"),
            JsWord::from("PureComponent"),
            JsWord::from("useDeferredValue"),
            JsWord::from("useEffect"),
            JsWord::from("useImperativeHandle"),
            JsWord::from("useInsertionEffect"),
            JsWord::from("useLayoutEffect"),
            JsWord::from("useReducer"),
            JsWord::from("useRef"),
            JsWord::from("useState"),
            JsWord::from("useSyncExternalStore"),
            JsWord::from("useTransition"),
        ],
    })
}
