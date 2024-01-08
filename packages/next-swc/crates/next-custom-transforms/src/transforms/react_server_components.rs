use std::{collections::HashMap, path::PathBuf};

use regex::Regex;
use serde::Deserialize;
use turbopack_binding::swc::core::{
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

use super::cjs_finder::contains_cjs;

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
    pub is_react_server_layer: bool,
}

struct ReactServerComponents<C: Comments> {
    is_react_server_layer: bool,
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

enum RSCErrorKind {
    /// When `use client` and `use server` are in the same file.
    /// It's not possible to have both directives in the same file.
    RedundantDirectives(Span),
    NextRscErrServerImport((String, Span)),
    NextRscErrClientImport((String, Span)),
    NextRscErrClientDirective(Span),
    NextRscErrReactApi((String, Span)),
    NextRscErrErrorFileServerComponent(Span),
    NextRscErrClientMetadataExport((String, Span)),
    NextRscErrConflictMetadataExport(Span),
    NextRscErrInvalidApi((String, Span)),
}

impl<C: Comments> ReactServerComponents<C> {
    /// Consolidated place to parse, generate error messages for the RSC parsing
    /// errors.
    fn report_error(&self, error_kind: RSCErrorKind) {
        let (msg, span) = match error_kind {
            RSCErrorKind::RedundantDirectives(span) => (
                "It's not possible to have both `use client` and `use server` directives in the \
                 same file."
                    .to_string(),
                span,
            ),
            RSCErrorKind::NextRscErrClientDirective(span) => (
                "The \"use client\" directive must be placed before other expressions. Move it to \
                 the top of the file to resolve this issue."
                    .to_string(),
                span,
            ),
            RSCErrorKind::NextRscErrServerImport((source, span)) => {
                let msg = match source.as_str() {
                    // If importing "react-dom/server", we should show a different error.
                    "react-dom/server" => "You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.\nLearn more: https://nextjs.org/docs/getting-started/react-essentials".to_string(),
                    // If importing "next/router", we should tell them to use "next/navigation".
                    "next/router" => r#"You have a Server Component that imports next/router. Use next/navigation instead.\nLearn more: https://nextjs.org/docs/app/api-reference/functions/use-router"#.to_string(),
                    _ => format!(r#"You're importing a component that imports {}. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.\nLearn more: https://nextjs.org/docs/getting-started/react-essentials\n\n"#, source)
                };

                (msg, span)
            }
            RSCErrorKind::NextRscErrClientImport((source, span)) => {
                // [NOTE]: in turbopack currently only type of AppRsc runs this transform,
                // so it won't hit pages_dir case
                let is_app_dir = self
                    .app_dir
                    .as_ref()
                    .map(|app_dir| {
                        if let Some(app_dir) = app_dir.as_os_str().to_str() {
                            self.filepath.starts_with(app_dir)
                        } else {
                            false
                        }
                    })
                    .unwrap_or_default();

                let msg = if !is_app_dir {
                    format!("You're importing a component that needs {}. That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/getting-started/react-essentials#server-components\n\n", source)
                } else {
                    format!("You're importing a component that needs {}. That only works in a Server Component but one of its parents is marked with \"use client\", so it's a Client Component.\nLearn more: https://nextjs.org/docs/getting-started/react-essentials\n\n", source)
                };
                (msg, span)
            }
            RSCErrorKind::NextRscErrReactApi((source, span)) => {
                let msg = if source == "Component" {
                    "You’re importing a class component. It only works in a Client Component but none of its parents are marked with \"use client\", so they're Server Components by default.\nLearn more: https://nextjs.org/docs/getting-started/react-essentials#client-components\n\n".to_string()
                } else {
                    format!("You're importing a component that needs {}. It only works in a Client Component but none of its parents are marked with \"use client\", so they're Server Components by default.\nLearn more: https://nextjs.org/docs/getting-started/react-essentials\n\n", source)
                };

                (msg,span)
            },
            RSCErrorKind::NextRscErrErrorFileServerComponent(span) => {
                (
                    format!("{} must be a Client Component. Add the \"use client\" directive the top of the file to resolve this issue.\nLearn more: https://nextjs.org/docs/getting-started/react-essentials#client-components\n\n", self.filepath),
                    span
                )
            },
            RSCErrorKind::NextRscErrClientMetadataExport((source, span)) => {
                (format!("You are attempting to export \"{}\" from a component marked with \"use client\", which is disallowed. Either remove the export, or the \"use client\" directive. Read more: https://nextjs.org/docs/getting-started/react-essentials#the-use-client-directive\n\n", source), span)
            },
            RSCErrorKind::NextRscErrConflictMetadataExport(span) => (
                "\"metadata\" and \"generateMetadata\" cannot be exported at the same time, please keep one of them. Read more: https://nextjs.org/docs/app/api-reference/file-conventions/metadata\n\n".to_string(),
                span
            ),
            //NEXT_RSC_ERR_INVALID_API
            RSCErrorKind::NextRscErrInvalidApi((source, span)) => (
                format!("\"{}\" is not supported in app/. Read more: https://nextjs.org/docs/app/building-your-application/data-fetching\n\n", source), span
            ),
        };

        HANDLER.with(|handler| handler.struct_span_err(span, msg.as_str()).emit())
    }
}

impl<C: Comments> VisitMut for ReactServerComponents<C> {
    noop_visit_mut_type!();

    fn visit_mut_module(&mut self, module: &mut Module) {
        let (is_client_entry, is_action_file, imports) =
            self.collect_top_level_directives_and_imports(module);
        let is_cjs = contains_cjs(module);

        if self.is_react_server_layer {
            if is_client_entry {
                self.to_module_ref(module, is_cjs);
                return;
            } else {
                // Only assert server graph if file's bundle target is "server", e.g.
                // * server components pages
                // * pages bundles on SSR layer
                // * middleware
                // * app/pages api routes
                self.assert_server_graph(&imports, module);
            }
        } else {
            // Only assert client graph if the file is not an action file,
            // and bundle target is "client" e.g.
            // * client components pages
            // * pages bundles on browser layer
            if !is_action_file {
                self.assert_client_graph(&imports);
                self.assert_invalid_api(module, true);
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
                                                self.report_error(
                                                    RSCErrorKind::RedundantDirectives(
                                                        expr_stmt.span,
                                                    ),
                                                );
                                            }
                                        } else {
                                            self.report_error(
                                                RSCErrorKind::NextRscErrClientDirective(
                                                    expr_stmt.span,
                                                ),
                                            );
                                        }

                                        // Remove the directive.
                                        return false;
                                    } else if &**value == "use server" && !finished_directives {
                                        is_action_file = true;

                                        if is_client_entry {
                                            self.report_error(RSCErrorKind::RedundantDirectives(
                                                expr_stmt.span,
                                            ));
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
                                            self.report_error(
                                                RSCErrorKind::NextRscErrClientDirective(
                                                    expr_stmt.span,
                                                ),
                                            );
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
                    finished_directives = true;
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
                    finished_directives = true;
                }
                ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultDecl(ExportDefaultDecl {
                    decl: _,
                    ..
                })) => {
                    self.export_names.push("default".to_string());
                    finished_directives = true;
                }
                ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultExpr(ExportDefaultExpr {
                    expr: _,
                    ..
                })) => {
                    self.export_names.push("default".to_string());
                    finished_directives = true;
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
        // If the
        if self.is_from_node_modules(&self.filepath) {
            return;
        }
        for import in imports {
            let source = import.source.0.clone();
            if self.invalid_server_imports.contains(&source) {
                self.report_error(RSCErrorKind::NextRscErrServerImport((
                    source.to_string(),
                    import.source.1,
                )));
            }
            if source == *"react" {
                for specifier in &import.specifiers {
                    if self.invalid_server_react_apis.contains(&specifier.0) {
                        self.report_error(RSCErrorKind::NextRscErrReactApi((
                            specifier.0.to_string(),
                            specifier.1,
                        )));
                    }
                }
            }
            if source == *"react-dom" {
                for specifier in &import.specifiers {
                    if self.invalid_server_react_dom_apis.contains(&specifier.0) {
                        self.report_error(RSCErrorKind::NextRscErrReactApi((
                            specifier.0.to_string(),
                            specifier.1,
                        )));
                    }
                }
            }
        }

        self.assert_invalid_api(module, false);
        self.assert_server_filename(module);
    }

    fn assert_server_filename(&self, module: &Module) {
        if self.is_from_node_modules(&self.filepath) {
            return;
        }
        let is_error_file = Regex::new(r"[\\/]error\.(ts|js)x?$")
            .unwrap()
            .is_match(&self.filepath);
        if is_error_file {
            if let Some(app_dir) = &self.app_dir {
                if let Some(app_dir) = app_dir.to_str() {
                    if self.filepath.starts_with(app_dir) {
                        let span = if let Some(first_item) = module.body.first() {
                            first_item.span()
                        } else {
                            module.span
                        };

                        self.report_error(RSCErrorKind::NextRscErrErrorFileServerComponent(span));
                    }
                }
            }
        }
    }

    fn assert_client_graph(&self, imports: &[ModuleImports]) {
        if self.is_from_node_modules(&self.filepath) {
            return;
        }
        for import in imports {
            let source = import.source.0.clone();
            if self.invalid_client_imports.contains(&source) {
                self.report_error(RSCErrorKind::NextRscErrClientImport((
                    source.to_string(),
                    import.source.1,
                )));
            }
        }
    }

    fn assert_invalid_api(&self, module: &Module, is_client_entry: bool) {
        if self.is_from_node_modules(&self.filepath) {
            return;
        }
        let is_layout_or_page = Regex::new(r"[\\/](page|layout)\.(ts|js)x?$")
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
                    self.report_error(RSCErrorKind::NextRscErrClientMetadataExport((
                        invalid_export_name.clone(),
                        span,
                    )));
                }
            } else {
                // Server entry can't export `generateMetadata` and `metadata` together.
                if has_gm_export && has_metadata_export {
                    self.report_error(RSCErrorKind::NextRscErrConflictMetadataExport(span));
                }
            }
            // Assert `getServerSideProps` and `getStaticProps` exports.
            if invalid_export_name == "getServerSideProps"
                || invalid_export_name == "getStaticProps"
            {
                self.report_error(RSCErrorKind::NextRscErrInvalidApi((
                    invalid_export_name.clone(),
                    span,
                )));
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

    fn is_from_node_modules(&self, filepath: &str) -> bool {
        Regex::new(r"[\\/]node_modules[\\/]")
            .unwrap()
            .is_match(filepath)
    }
}

pub fn server_components<C: Comments>(
    filename: FileName,
    config: Config,
    comments: C,
    app_dir: Option<PathBuf>,
) -> impl Fold + VisitMut {
    let is_react_server_layer: bool = match &config {
        Config::WithOptions(x) => x.is_react_server_layer,
        _ => false,
    };
    as_folder(ReactServerComponents {
        is_react_server_layer,
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
            JsWord::from("useFormStatus"),
            JsWord::from("useFormState"),
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
            JsWord::from("useOptimistic"),
        ],
    })
}
