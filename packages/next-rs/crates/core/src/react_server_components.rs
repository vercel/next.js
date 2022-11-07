use regex::Regex;
use serde::Deserialize;

use swc_core::{
    common::{
        comments::{Comment, CommentKind, Comments},
        errors::HANDLER,
        FileName, Span, DUMMY_SP,
    },
    ecma::ast::*,
    ecma::atoms::{js_word, JsWord},
    ecma::utils::{prepend_stmts, quote_ident, quote_str, ExprFactory},
    ecma::visit::{as_folder, noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
};

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
    comments: C,
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
        let (is_client_entry, imports) = self.collect_top_level_directives_and_imports(module);

        if self.is_server {
            if !is_client_entry {
                self.assert_server_graph(&imports);
            } else {
                self.to_module_ref(module);
                return;
            }
        } else {
            self.assert_client_graph(&imports, module);
        }
        module.visit_mut_children_with(self)
    }
}

impl<C: Comments> ReactServerComponents<C> {
    // Collects top level directives and imports, then removes specific ones
    // from the AST.
    fn collect_top_level_directives_and_imports(
        &self,
        module: &mut Module,
    ) -> (bool, Vec<ModuleImports>) {
        let mut imports: Vec<ModuleImports> = vec![];
        let mut finished_directives = false;
        let mut is_client_entry = false;

        let _ = &module.body.retain(|item| {
            match item {
                ModuleItem::Stmt(stmt) => {
                    if !finished_directives {
                        if !stmt.is_expr() {
                            // Not an expression.
                            finished_directives = true;
                        }

                        match stmt.as_expr() {
                            Some(expr_stmt) => {
                                match &*expr_stmt.expr {
                                    Expr::Lit(Lit::Str(Str { value, .. })) => {
                                        if &**value == "use client" {
                                            is_client_entry = true;

                                            // Remove the directive.
                                            return false;
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
                _ => {
                    finished_directives = true;
                }
            }
            true
        });

        (is_client_entry, imports)
    }

    // Convert the client module to the module reference code and add a special
    // comment to the top of the file.
    fn to_module_ref(&self, module: &mut Module) {
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

        // Prepend a special comment to the top of the file.
        self.comments.add_leading(
            module.span.lo,
            Comment {
                span: DUMMY_SP,
                kind: CommentKind::Block,
                text: " __next_internal_client_entry_do_not_use__ ".into(),
            },
        );
    }

    fn assert_server_graph(&self, imports: &Vec<ModuleImports>) {
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
    }

    fn assert_client_graph(&self, imports: &Vec<ModuleImports>, module: &Module) {
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

        // Assert `getServerSideProps` and `getStaticProps` exports.
        let is_layout_or_page = Regex::new(r"/(page|layout)\.(ts|js)x?$")
            .unwrap()
            .is_match(&self.filepath);
        if is_layout_or_page {
            let mut span = DUMMY_SP;
            let mut has_get_server_side_props = false;
            let mut has_get_static_props = false;

            'matcher: for export in &module.body {
                match export {
                    ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(export)) => {
                        for specifier in &export.specifiers {
                            if let ExportSpecifier::Named(named) = specifier {
                                match &named.orig {
                                    ModuleExportName::Ident(i) => {
                                        if i.sym == *"getServerSideProps" {
                                            has_get_server_side_props = true;
                                            span = named.span;
                                            break 'matcher;
                                        }
                                        if i.sym == *"getStaticProps" {
                                            has_get_static_props = true;
                                            span = named.span;
                                            break 'matcher;
                                        }
                                    }
                                    ModuleExportName::Str(s) => {
                                        if s.value == *"getServerSideProps" {
                                            has_get_server_side_props = true;
                                            span = named.span;
                                            break 'matcher;
                                        }
                                        if s.value == *"getStaticProps" {
                                            has_get_static_props = true;
                                            span = named.span;
                                            break 'matcher;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export)) => match &export.decl {
                        Decl::Fn(f) => {
                            if f.ident.sym == *"getServerSideProps" {
                                has_get_server_side_props = true;
                                span = f.ident.span;
                                break 'matcher;
                            }
                            if f.ident.sym == *"getStaticProps" {
                                has_get_static_props = true;
                                span = f.ident.span;
                                break 'matcher;
                            }
                        }
                        Decl::Var(v) => {
                            for decl in &v.decls {
                                if let Pat::Ident(i) = &decl.name {
                                    if i.sym == *"getServerSideProps" {
                                        has_get_server_side_props = true;
                                        span = i.span;
                                        break 'matcher;
                                    }
                                    if i.sym == *"getStaticProps" {
                                        has_get_static_props = true;
                                        span = i.span;
                                        break 'matcher;
                                    }
                                }
                            }
                        }
                        _ => {}
                    },
                    _ => {}
                }
            }

            if has_get_server_side_props || has_get_static_props {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(
                            span,
                            format!(
                                "`{}` is not allowed in Client Components.",
                                if has_get_server_side_props {
                                    "getServerSideProps"
                                } else {
                                    "getStaticProps"
                                }
                            )
                            .as_str(),
                        )
                        .emit()
                })
            }
        }
    }
}

pub fn server_components<C: Comments>(
    filename: FileName,
    config: Config,
    comments: C,
) -> impl Fold + VisitMut {
    let is_server: bool = match config {
        Config::WithOptions(x) => x.is_server,
        _ => true,
    };
    as_folder(ReactServerComponents {
        is_server,
        comments,
        filepath: filename.to_string(),
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
