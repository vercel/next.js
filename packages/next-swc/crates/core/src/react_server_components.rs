use serde::Deserialize;

use swc_core::{
    common::{errors::HANDLER, FileName, Span, DUMMY_SP},
    ecma::ast::*,
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
pub struct Options {
    #[serde(default)]
    pub is_server: bool,
}

struct ReactServerComponents<'a> {
    is_server: bool,
    filepath: String,
    invalid_server_imports: Vec<&'a str>,
    invalid_client_imports: Vec<&'a str>,
    invalid_server_react_apis: Vec<&'a str>,
    invalid_server_react_dom_apis: Vec<&'a str>,
}

struct ModuleImports {
    source: (String, Span),
    specifiers: Vec<(String, Span)>,
}

impl VisitMut for ReactServerComponents<'_> {
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
            self.assert_client_graph(&imports);
        }
        module.visit_mut_children_with(self)
    }
}

pub struct DropSpan {}
impl VisitMut for DropSpan {
    fn visit_mut_span(&mut self, span: &mut Span) {
        *span = DUMMY_SP
    }
}

impl ReactServerComponents<'_> {
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

                        match &*stmt.as_expr().unwrap().expr {
                            Expr::Lit(Lit::Str(Str { value, .. })) => {
                                if value.to_string() == "client" {
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
                }
                ModuleItem::ModuleDecl(ModuleDecl::Import(import)) => {
                    let source = import.src.value.to_string();
                    let specifiers = import
                        .specifiers
                        .iter()
                        .map(|specifier| match specifier {
                            ImportSpecifier::Named(named) => match &named.imported {
                                Some(imported) => match &imported {
                                    ModuleExportName::Ident(i) => (i.sym.to_string(), i.span),
                                    ModuleExportName::Str(s) => (s.value.to_string(), s.span),
                                },
                                None => (named.local.sym.to_string(), named.local.span),
                            },
                            ImportSpecifier::Default(d) => ("".to_string(), d.span),
                            ImportSpecifier::Namespace(n) => ("*".to_string(), n.span),
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
            return true;
        });

        (is_client_entry, imports)
    }

    // Convert the client module to the module reference code and add a special
    // comment to the top of the file.
    fn to_module_ref(&self, module: &mut Module) {
        // Clear all the statements and module declarations.
        module.body.clear();

        let proxy_ident = quote_ident!("createProxy");
        let filepath = quote_str!(self.filepath.clone());

        prepend_stmts(
            &mut module.body,
            vec![
                ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                    span: DUMMY_SP,
                    specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                        span: DUMMY_SP,
                        local: proxy_ident.clone(),
                        imported: None,
                        is_type_only: false,
                    })],
                    src: Str {
                        span: DUMMY_SP,
                        raw: None,
                        value: "private-next-rsc-mod-ref-proxy".into(),
                    },
                    type_only: Default::default(),
                    asserts: Default::default(),
                })),
                ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultExpr(ExportDefaultExpr {
                    span: DUMMY_SP,
                    expr: Box::new(Expr::Call(CallExpr {
                        span: DUMMY_SP,
                        callee: proxy_ident.clone().as_callee(),
                        args: vec![filepath.as_arg()],
                        type_args: None,
                    })),
                })),
            ]
            .into_iter(),
        );
    }

    fn assert_server_graph(&self, imports: &Vec<ModuleImports>) {
        for import in imports {
            let source = import.source.0.as_str();
            if self.invalid_server_imports.contains(&source) {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(
                            import.source.1,
                            format!(
                                "Disallowed import of `{}` in the Server Components compilation.",
                                source
                            )
                            .as_str(),
                        )
                        .emit()
                })
            }
            if source == "react" {
                for specifier in &import.specifiers {
                    if self
                        .invalid_server_react_apis
                        .contains(&specifier.0.as_str())
                    {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    specifier.1,
                                    format!(
                                        "Disallowed React API `{}` in the Server Components \
                                         compilation.",
                                        &specifier.0
                                    )
                                    .as_str(),
                                )
                                .emit()
                        })
                    }
                }
            }
            if source == "react-dom" {
                for specifier in &import.specifiers {
                    if self
                        .invalid_server_react_dom_apis
                        .contains(&specifier.0.as_str())
                    {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    specifier.1,
                                    format!(
                                        "Disallowed ReactDOM API `{}` in the Server Components \
                                         compilation.",
                                        &specifier.0
                                    )
                                    .as_str(),
                                )
                                .emit()
                        })
                    }
                }
            }
        }
    }

    fn assert_client_graph(&self, imports: &Vec<ModuleImports>) {
        for import in imports {
            let source = import.source.0.as_str();
            if self.invalid_client_imports.contains(&source) {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(
                            import.source.1,
                            format!(
                                "Disallowed import of `{}` in the Client Components compilation.",
                                source
                            )
                            .as_str(),
                        )
                        .emit()
                })
            }
        }
    }
}

pub fn server_components(filename: FileName, config: Config) -> impl Fold + VisitMut {
    let is_server: bool = match config {
        Config::WithOptions(x) => x.is_server,
        _ => true,
    };
    as_folder(ReactServerComponents {
        is_server,
        filepath: filename.to_string(),
        invalid_server_imports: vec!["client-only", "react-dom/client", "react-dom/server"],
        invalid_client_imports: vec!["server-only"],
        invalid_server_react_dom_apis: vec!["findDOMNode", "flushSync", "unstable_batchedUpdates"],
        invalid_server_react_apis: vec![
            "Component",
            "createContext",
            "createFactory",
            "PureComponent",
            "useDeferredValue",
            "useEffect",
            "useImperativeHandle",
            "useInsertionEffect",
            "useLayoutEffect",
            "useReducer",
            "useRef",
            "useState",
            "useSyncExternalStore",
            "useTransition",
        ],
    })
}
