use std::{
    fmt::{self, Display},
    iter::FromIterator,
    path::PathBuf,
    rc::Rc,
    sync::Arc,
};

use once_cell::sync::Lazy;
use regex::Regex;
use rustc_hash::FxHashMap;
use serde::Deserialize;
use swc_core::{
    atoms::{atom, Atom},
    common::{
        comments::{Comment, CommentKind, Comments},
        errors::HANDLER,
        util::take::Take,
        FileName, Span, Spanned, DUMMY_SP,
    },
    ecma::{
        ast::*,
        utils::{prepend_stmts, quote_ident, quote_str, ExprFactory},
        visit::{
            noop_visit_mut_type, noop_visit_type, visit_mut_pass, Visit, VisitMut, VisitMutWith,
            VisitWith,
        },
    },
};

use super::{cjs_finder::contains_cjs, import_analyzer::ImportMap};
use crate::FxIndexMap;

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
    pub cache_components_enabled: bool,
    pub use_cache_enabled: bool,
}

/// A visitor that transforms given module to use module proxy if it's a React
/// server component.
/// **NOTE** Turbopack uses ClientDirectiveTransformer for the
/// same purpose, so does not run this transform.
struct ReactServerComponents<C: Comments> {
    is_react_server_layer: bool,
    cache_components_enabled: bool,
    use_cache_enabled: bool,
    filepath: String,
    app_dir: Option<PathBuf>,
    comments: C,
    directive_import_collection: Option<(bool, bool, RcVec<ModuleImports>, RcVec<Atom>)>,
}

#[derive(Clone, Debug)]
struct ModuleImports {
    source: (Atom, Span),
    specifiers: Vec<(Atom, Span)>,
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
    NextRscErrConflictMetadataExport((Span, Span)),
    NextRscErrInvalidApi((String, Span)),
    NextRscErrDeprecatedApi((String, String, Span)),
    NextSsrDynamicFalseNotAllowed(Span),
    NextRscErrIncompatibleRouteSegmentConfig(Span, String, NextConfigProperty),
}

#[derive(Clone, Debug, Copy)]
enum NextConfigProperty {
    CacheComponents,
    UseCache,
}

impl Display for NextConfigProperty {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NextConfigProperty::CacheComponents => write!(f, "cacheComponents"),
            NextConfigProperty::UseCache => write!(f, "experimental.useCache"),
        }
    }
}

enum InvalidExportKind {
    General,
    Metadata,
    RouteSegmentConfig(NextConfigProperty),
}

impl<C: Comments> VisitMut for ReactServerComponents<C> {
    noop_visit_mut_type!();

    fn visit_mut_module(&mut self, module: &mut Module) {
        // Run the validator first to assert, collect directives and imports.
        let mut validator = ReactServerComponentValidator::new(
            self.is_react_server_layer,
            self.cache_components_enabled,
            self.use_cache_enabled,
            self.filepath.clone(),
            self.app_dir.clone(),
        );

        module.visit_with(&mut validator);
        self.directive_import_collection = validator.directive_import_collection;

        let is_client_entry = self
            .directive_import_collection
            .as_ref()
            .expect("directive_import_collection must be set")
            .0;

        self.remove_top_level_directive(module);

        let is_cjs = contains_cjs(module);

        if self.is_react_server_layer {
            if is_client_entry {
                self.to_module_ref(module, is_cjs);
                return;
            }
        } else if is_client_entry {
            self.prepend_comment_node(module, is_cjs);
        }
        module.visit_mut_children_with(self)
    }
}

impl<C: Comments> ReactServerComponents<C> {
    /// removes specific directive from the AST.
    fn remove_top_level_directive(&mut self, module: &mut Module) {
        module.body.retain(|item| {
            if let ModuleItem::Stmt(stmt) = item {
                if let Some(expr_stmt) = stmt.as_expr() {
                    if let Expr::Lit(Lit::Str(Str { value, .. })) = &*expr_stmt.expr {
                        if &**value == "use client" {
                            // Remove the directive.
                            return false;
                        }
                    }
                }
            }
            true
        });
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
                                key: proxy_ident.into(),
                                value: None,
                            })],
                            optional: false,
                            type_ann: None,
                        }),
                        init: Some(Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: quote_ident!("require").as_callee(),
                            args: vec![quote_str!("private-next-rsc-mod-ref-proxy").as_arg()],
                            ..Default::default()
                        }))),
                        definite: false,
                    }],
                    ..Default::default()
                })))),
                ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                    span: DUMMY_SP,
                    expr: Box::new(Expr::Assign(AssignExpr {
                        span: DUMMY_SP,
                        left: MemberExpr {
                            span: DUMMY_SP,
                            obj: Box::new(Expr::Ident(quote_ident!("module").into())),
                            prop: MemberProp::Ident(quote_ident!("exports")),
                        }
                        .into(),
                        op: op!("="),
                        right: Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: quote_ident!("createProxy").as_callee(),
                            args: vec![filepath.as_arg()],
                            ..Default::default()
                        })),
                    })),
                })),
            ]
            .into_iter(),
        );

        self.prepend_comment_node(module, is_cjs);
    }

    fn prepend_comment_node(&self, module: &Module, is_cjs: bool) {
        let export_names = &self
            .directive_import_collection
            .as_ref()
            .expect("directive_import_collection must be set")
            .3;

        // Prepend a special comment to the top of the file that contains
        // module export names and the detected module type.
        self.comments.add_leading(
            module.span.lo,
            Comment {
                span: DUMMY_SP,
                kind: CommentKind::Block,
                text: format!(
                    " __next_internal_client_entry_do_not_use__ {} {} ",
                    join_atoms(export_names),
                    if is_cjs { "cjs" } else { "auto" }
                )
                .into(),
            },
        );
    }
}

fn join_atoms(atoms: &[Atom]) -> String {
    atoms
        .iter()
        .map(|atom| atom.as_ref())
        .collect::<Vec<_>>()
        .join(",")
}

/// Consolidated place to parse, generate error messages for the RSC parsing
/// errors.
fn report_error(app_dir: &Option<PathBuf>, filepath: &str, error_kind: RSCErrorKind) {
    let (msg, spans) = match error_kind {
        RSCErrorKind::RedundantDirectives(span) => (
            "It's not possible to have both `use client` and `use server` directives in the \
             same file."
                .to_string(),
            vec![span],
        ),
        RSCErrorKind::NextRscErrClientDirective(span) => (
            "The \"use client\" directive must be placed before other expressions. Move it to \
             the top of the file to resolve this issue."
                .to_string(),
            vec![span],
        ),
        RSCErrorKind::NextRscErrServerImport((source, span)) => {
            let msg = match source.as_str() {
                // If importing "react-dom/server", we should show a different error.
                "react-dom/server" => "You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.\nLearn more: https://nextjs.org/docs/app/building-your-application/rendering".to_string(),
                // If importing "next/router", we should tell them to use "next/navigation".
                "next/router" => "You have a Server Component that imports next/router. Use next/navigation instead.\nLearn more: https://nextjs.org/docs/app/api-reference/functions/use-router".to_string(),
                _ => format!("You're importing a component that imports {source}. It only works in a Client Component but none of its parents are marked with \"use client\", so they're Server Components by default.\nLearn more: https://nextjs.org/docs/app/building-your-application/rendering")
            };

            (msg, vec![span])
        }
        RSCErrorKind::NextRscErrClientImport((source, span)) => {
            let is_app_dir = app_dir
                .as_ref()
                .map(|app_dir| {
                    if let Some(app_dir) = app_dir.as_os_str().to_str() {
                        filepath.starts_with(app_dir)
                    } else {
                        false
                    }
                })
                .unwrap_or_default();

            let msg = if !is_app_dir {
                format!("You're importing a component that needs \"{source}\". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components\n\n")
            } else {
                format!("You're importing a component that needs \"{source}\". That only works in a Server Component but one of its parents is marked with \"use client\", so it's a Client Component.\nLearn more: https://nextjs.org/docs/app/building-your-application/rendering\n\n")
            };
            (msg, vec![span])
        }
        RSCErrorKind::NextRscErrReactApi((source, span)) => {
            let msg = if source == "Component" {
                "You’re importing a class component. It only works in a Client Component but none of its parents are marked with \"use client\", so they're Server Components by default.\nLearn more: https://nextjs.org/docs/app/building-your-application/rendering/client-components\n\n".to_string()
            } else {
                format!("You're importing a component that needs `{source}`. This React Hook only works in a Client Component. To fix, mark the file (or its parent) with the `\"use client\"` directive.\n\n Learn more: https://nextjs.org/docs/app/api-reference/directives/use-client\n\n")
            };

            (msg, vec![span])
        },
        RSCErrorKind::NextRscErrErrorFileServerComponent(span) => {
            (
                format!("{filepath} must be a Client Component. Add the \"use client\" directive the top of the file to resolve this issue.\nLearn more: https://nextjs.org/docs/app/api-reference/directives/use-client\n\n"),
                vec![span]
            )
        },
        RSCErrorKind::NextRscErrClientMetadataExport((source, span)) => {
            (format!("You are attempting to export \"{source}\" from a component marked with \"use client\", which is disallowed. Either remove the export, or the \"use client\" directive. Read more: https://nextjs.org/docs/app/api-reference/directives/use-client\n\n"), vec![span])
        },
        RSCErrorKind::NextRscErrConflictMetadataExport((span1, span2)) => (
            "\"metadata\" and \"generateMetadata\" cannot be exported at the same time, please keep one of them. Read more: https://nextjs.org/docs/app/api-reference/file-conventions/metadata\n\n".to_string(),
            vec![span1, span2]
        ),
        RSCErrorKind::NextRscErrInvalidApi((source, span)) => (
            format!("\"{source}\" is not supported in app/. Read more: https://nextjs.org/docs/app/building-your-application/data-fetching\n\n"), vec![span]
        ),
        RSCErrorKind::NextRscErrDeprecatedApi((source, item, span)) => match (&*source, &*item) {
            ("next/server", "ImageResponse") => (
                "ImageResponse moved from \"next/server\" to \"next/og\" since Next.js 14, please \
                 import from \"next/og\" instead"
                    .to_string(),
                vec![span],
            ),
            _ => (format!("\"{source}\" is deprecated."), vec![span]),
        },
        RSCErrorKind::NextSsrDynamicFalseNotAllowed(span) => (
            "`ssr: false` is not allowed with `next/dynamic` in Server Components. Please move it into a Client Component."
                .to_string(),
            vec![span],
        ),
        RSCErrorKind::NextRscErrIncompatibleRouteSegmentConfig(span, segment, property) => (
            format!("Route segment config \"{segment}\" is not compatible with `nextConfig.{property}`. Please remove it."),
            vec![span],
        ),
    };

    HANDLER.with(|handler| handler.struct_span_err(spans, msg.as_str()).emit())
}

/// Collects top level directives and imports
fn collect_top_level_directives_and_imports(
    app_dir: &Option<PathBuf>,
    filepath: &str,
    module: &Module,
) -> (bool, bool, Vec<ModuleImports>, Vec<Atom>) {
    let mut imports: Vec<ModuleImports> = vec![];
    let mut finished_directives = false;
    let mut is_client_entry = false;
    let mut is_action_file = false;

    let mut export_names = vec![];

    let _ = &module.body.iter().for_each(|item| {
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
                                            report_error(
                                                app_dir,
                                                filepath,
                                                RSCErrorKind::RedundantDirectives(expr_stmt.span),
                                            );
                                        }
                                    } else {
                                        report_error(
                                            app_dir,
                                            filepath,
                                            RSCErrorKind::NextRscErrClientDirective(expr_stmt.span),
                                        );
                                    }
                                } else if &**value == "use server" && !finished_directives {
                                    is_action_file = true;

                                    if is_client_entry {
                                        report_error(
                                            app_dir,
                                            filepath,
                                            RSCErrorKind::RedundantDirectives(expr_stmt.span),
                                        );
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
                                        report_error(
                                            app_dir,
                                            filepath,
                                            RSCErrorKind::NextRscErrClientDirective(expr_stmt.span),
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
            ModuleItem::ModuleDecl(ModuleDecl::Import(
                import @ ImportDecl {
                    type_only: false, ..
                },
            )) => {
                let source = import.src.value.clone();
                let specifiers = import
                    .specifiers
                    .iter()
                    .filter(|specifier| {
                        !matches!(
                            specifier,
                            ImportSpecifier::Named(ImportNamedSpecifier {
                                is_type_only: true,
                                ..
                            })
                        )
                    })
                    .map(|specifier| match specifier {
                        ImportSpecifier::Named(named) => match &named.imported {
                            Some(imported) => match &imported {
                                ModuleExportName::Ident(i) => (i.to_id().0, i.span),
                                ModuleExportName::Str(s) => (s.value.clone(), s.span),
                            },
                            None => (named.local.to_id().0, named.local.span),
                        },
                        ImportSpecifier::Default(d) => (atom!(""), d.span),
                        ImportSpecifier::Namespace(n) => (atom!("*"), n.span),
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
                    export_names.push(match specifier {
                        ExportSpecifier::Default(_) => atom!("default"),
                        ExportSpecifier::Namespace(_) => atom!("*"),
                        ExportSpecifier::Named(named) => match &named.exported {
                            Some(exported) => match &exported {
                                ModuleExportName::Ident(i) => i.sym.clone(),
                                ModuleExportName::Str(s) => s.value.clone(),
                            },
                            _ => match &named.orig {
                                ModuleExportName::Ident(i) => i.sym.clone(),
                                ModuleExportName::Str(s) => s.value.clone(),
                            },
                        },
                    })
                }
                finished_directives = true;
            }
            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl { decl, .. })) => {
                match decl {
                    Decl::Class(ClassDecl { ident, .. }) => {
                        export_names.push(ident.sym.clone());
                    }
                    Decl::Fn(FnDecl { ident, .. }) => {
                        export_names.push(ident.sym.clone());
                    }
                    Decl::Var(var) => {
                        for decl in &var.decls {
                            if let Pat::Ident(ident) = &decl.name {
                                export_names.push(ident.id.sym.clone());
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
                export_names.push(atom!("default"));
                finished_directives = true;
            }
            ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultExpr(ExportDefaultExpr {
                expr: _,
                ..
            })) => {
                export_names.push(atom!("default"));
                finished_directives = true;
            }
            ModuleItem::ModuleDecl(ModuleDecl::ExportAll(_)) => {
                export_names.push(atom!("*"));
            }
            _ => {
                finished_directives = true;
            }
        }
    });

    (is_client_entry, is_action_file, imports, export_names)
}

/// A visitor to assert given module file is a valid React server component.
struct ReactServerComponentValidator {
    is_react_server_layer: bool,
    cache_components_enabled: bool,
    use_cache_enabled: bool,
    filepath: String,
    app_dir: Option<PathBuf>,
    invalid_server_imports: Vec<Atom>,
    invalid_server_lib_apis_mapping: FxHashMap<&'static str, Vec<&'static str>>,
    deprecated_apis_mapping: FxHashMap<&'static str, Vec<&'static str>>,
    invalid_client_imports: Vec<Atom>,
    invalid_client_lib_apis_mapping: FxHashMap<&'static str, Vec<&'static str>>,
    pub directive_import_collection: Option<(bool, bool, RcVec<ModuleImports>, RcVec<Atom>)>,
    imports: ImportMap,
}

// A type to workaround a clippy warning.
type RcVec<T> = Rc<Vec<T>>;

impl ReactServerComponentValidator {
    pub fn new(
        is_react_server_layer: bool,
        cache_components_enabled: bool,
        use_cache_enabled: bool,
        filename: String,
        app_dir: Option<PathBuf>,
    ) -> Self {
        Self {
            is_react_server_layer,
            cache_components_enabled,
            use_cache_enabled,
            filepath: filename,
            app_dir,
            directive_import_collection: None,
            // react -> [apis]
            // react-dom -> [apis]
            // next/navigation -> [apis]
            invalid_server_lib_apis_mapping: FxHashMap::from_iter([
                (
                    "react",
                    vec![
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
                        "useOptimistic",
                        "useActionState",
                        "experimental_useOptimistic",
                    ],
                ),
                (
                    "react-dom",
                    vec![
                        "flushSync",
                        "unstable_batchedUpdates",
                        "useFormStatus",
                        "useFormState",
                    ],
                ),
                (
                    "next/navigation",
                    vec![
                        "useSearchParams",
                        "usePathname",
                        "useSelectedLayoutSegment",
                        "useSelectedLayoutSegments",
                        "useParams",
                        "useRouter",
                        "useServerInsertedHTML",
                        "ServerInsertedHTMLContext",
                        "unstable_isUnrecognizedActionError",
                    ],
                ),
                ("next/link", vec!["useLinkStatus"]),
            ]),
            deprecated_apis_mapping: FxHashMap::from_iter([("next/server", vec!["ImageResponse"])]),

            invalid_server_imports: vec![
                Atom::from("client-only"),
                Atom::from("react-dom/client"),
                Atom::from("react-dom/server"),
                Atom::from("next/router"),
            ],

            invalid_client_imports: vec![
                Atom::from("server-only"),
                Atom::from("next/headers"),
                Atom::from("next/root-params"),
            ],

            invalid_client_lib_apis_mapping: FxHashMap::from_iter([
                ("next/server", vec!["after"]),
                (
                    "next/cache",
                    vec![
                        "revalidatePath",
                        "revalidateTag",
                        // "unstable_cache", // useless in client, but doesn't technically error
                        "cacheLife",
                        "unstable_cacheLife",
                        "cacheTag",
                        "unstable_cacheTag",
                        // "unstable_noStore" // no-op in client, but allowed for legacy reasons
                    ],
                ),
            ]),
            imports: ImportMap::default(),
        }
    }

    fn is_from_node_modules(&self, filepath: &str) -> bool {
        static RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"node_modules[\\/]").unwrap());
        RE.is_match(filepath)
    }

    fn is_callee_next_dynamic(&self, callee: &Callee) -> bool {
        match callee {
            Callee::Expr(expr) => self.imports.is_import(expr, "next/dynamic", "default"),
            _ => false,
        }
    }

    // Asserts the server lib apis
    // e.g.
    // assert_invalid_server_lib_apis("react", import)
    // assert_invalid_server_lib_apis("react-dom", import)
    fn assert_invalid_server_lib_apis(&self, import_source: String, import: &ModuleImports) {
        let deprecated_apis = self.deprecated_apis_mapping.get(import_source.as_str());
        if let Some(deprecated_apis) = deprecated_apis {
            for specifier in &import.specifiers {
                if deprecated_apis.contains(&specifier.0.as_str()) {
                    report_error(
                        &self.app_dir,
                        &self.filepath,
                        RSCErrorKind::NextRscErrDeprecatedApi((
                            import_source.clone(),
                            specifier.0.to_string(),
                            specifier.1,
                        )),
                    );
                }
            }
        }

        let invalid_apis = self
            .invalid_server_lib_apis_mapping
            .get(import_source.as_str());
        if let Some(invalid_apis) = invalid_apis {
            for specifier in &import.specifiers {
                if invalid_apis.contains(&specifier.0.as_str()) {
                    report_error(
                        &self.app_dir,
                        &self.filepath,
                        RSCErrorKind::NextRscErrReactApi((specifier.0.to_string(), specifier.1)),
                    );
                }
            }
        }
    }

    fn assert_server_graph(&self, imports: &[ModuleImports], module: &Module) {
        // If the
        if self.is_from_node_modules(&self.filepath) {
            return;
        }
        for import in imports {
            let source = import.source.0.clone();
            let source_str = source.to_string();
            if self.invalid_server_imports.contains(&source) {
                report_error(
                    &self.app_dir,
                    &self.filepath,
                    RSCErrorKind::NextRscErrServerImport((source_str.clone(), import.source.1)),
                );
            }

            self.assert_invalid_server_lib_apis(source_str, import);
        }

        self.assert_invalid_api(module, false);
        self.assert_server_filename(module);
    }

    fn assert_server_filename(&self, module: &Module) {
        if self.is_from_node_modules(&self.filepath) {
            return;
        }
        static RE: Lazy<Regex> =
            Lazy::new(|| Regex::new(r"[\\/]((global-)?error)\.(ts|js)x?$").unwrap());

        let is_error_file = RE.is_match(&self.filepath);

        if is_error_file {
            if let Some(app_dir) = &self.app_dir {
                if let Some(app_dir) = app_dir.to_str() {
                    if self.filepath.starts_with(app_dir) {
                        let span = if let Some(first_item) = module.body.first() {
                            first_item.span()
                        } else {
                            module.span
                        };

                        report_error(
                            &self.app_dir,
                            &self.filepath,
                            RSCErrorKind::NextRscErrErrorFileServerComponent(span),
                        );
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
            let source = &import.source.0;

            if self.invalid_client_imports.contains(source) {
                report_error(
                    &self.app_dir,
                    &self.filepath,
                    RSCErrorKind::NextRscErrClientImport((source.to_string(), import.source.1)),
                );
            }

            let invalid_apis = self.invalid_client_lib_apis_mapping.get(source.as_str());
            if let Some(invalid_apis) = invalid_apis {
                for specifier in &import.specifiers {
                    if invalid_apis.contains(&specifier.0.as_str()) {
                        report_error(
                            &self.app_dir,
                            &self.filepath,
                            RSCErrorKind::NextRscErrClientImport((
                                specifier.0.to_string(),
                                specifier.1,
                            )),
                        );
                    }
                }
            }
        }
    }

    fn assert_invalid_api(&self, module: &Module, is_client_entry: bool) {
        if self.is_from_node_modules(&self.filepath) {
            return;
        }
        static RE: Lazy<Regex> =
            Lazy::new(|| Regex::new(r"[\\/](page|layout|route)\.(ts|js)x?$").unwrap());
        let is_app_entry = RE.is_match(&self.filepath);

        if is_app_entry {
            let mut possibly_invalid_exports: FxIndexMap<Atom, (InvalidExportKind, Span)> =
                FxIndexMap::default();

            let mut collect_possibly_invalid_exports =
                |export_name: &Atom, span: &Span| match &**export_name {
                    "getServerSideProps" | "getStaticProps" => {
                        possibly_invalid_exports
                            .insert(export_name.clone(), (InvalidExportKind::General, *span));
                    }
                    "generateMetadata" | "metadata" => {
                        possibly_invalid_exports
                            .insert(export_name.clone(), (InvalidExportKind::Metadata, *span));
                    }
                    "runtime" => {
                        if self.cache_components_enabled {
                            possibly_invalid_exports.insert(
                                export_name.clone(),
                                (
                                    InvalidExportKind::RouteSegmentConfig(
                                        NextConfigProperty::CacheComponents,
                                    ),
                                    *span,
                                ),
                            );
                        } else if self.use_cache_enabled {
                            possibly_invalid_exports.insert(
                                export_name.clone(),
                                (
                                    InvalidExportKind::RouteSegmentConfig(
                                        NextConfigProperty::UseCache,
                                    ),
                                    *span,
                                ),
                            );
                        }
                    }
                    "dynamicParams" | "dynamic" | "fetchCache" | "revalidate"
                    | "experimental_ppr" => {
                        if self.cache_components_enabled {
                            possibly_invalid_exports.insert(
                                export_name.clone(),
                                (
                                    InvalidExportKind::RouteSegmentConfig(
                                        NextConfigProperty::CacheComponents,
                                    ),
                                    *span,
                                ),
                            );
                        }
                    }
                    _ => (),
                };

            for export in &module.body {
                match export {
                    ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(export)) => {
                        for specifier in &export.specifiers {
                            if let ExportSpecifier::Named(named) = specifier {
                                match &named.orig {
                                    ModuleExportName::Ident(i) => {
                                        collect_possibly_invalid_exports(&i.sym, &named.span);
                                    }
                                    ModuleExportName::Str(s) => {
                                        collect_possibly_invalid_exports(&s.value, &named.span);
                                    }
                                }
                            }
                        }
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export)) => match &export.decl {
                        Decl::Fn(f) => {
                            collect_possibly_invalid_exports(&f.ident.sym, &f.ident.span);
                        }
                        Decl::Var(v) => {
                            for decl in &v.decls {
                                if let Pat::Ident(i) = &decl.name {
                                    collect_possibly_invalid_exports(&i.sym, &i.span);
                                }
                            }
                        }
                        _ => {}
                    },
                    _ => {}
                }
            }

            for (export_name, (kind, span)) in &possibly_invalid_exports {
                match kind {
                    InvalidExportKind::RouteSegmentConfig(property) => {
                        report_error(
                            &self.app_dir,
                            &self.filepath,
                            RSCErrorKind::NextRscErrIncompatibleRouteSegmentConfig(
                                *span,
                                export_name.to_string(),
                                *property,
                            ),
                        );
                    }
                    InvalidExportKind::Metadata => {
                        // Client entry can't export `generateMetadata` or `metadata`.
                        if is_client_entry
                            && (export_name == "generateMetadata" || export_name == "metadata")
                        {
                            report_error(
                                &self.app_dir,
                                &self.filepath,
                                RSCErrorKind::NextRscErrClientMetadataExport((
                                    export_name.to_string(),
                                    *span,
                                )),
                            );
                        }
                        // Server entry can't export `generateMetadata` and `metadata` together,
                        // which is handled separately below.
                    }
                    InvalidExportKind::General => {
                        report_error(
                            &self.app_dir,
                            &self.filepath,
                            RSCErrorKind::NextRscErrInvalidApi((export_name.to_string(), *span)),
                        );
                    }
                }
            }

            // Server entry can't export `generateMetadata` and `metadata` together.
            if !is_client_entry {
                let export1 = possibly_invalid_exports.get(&atom!("generateMetadata"));
                let export2 = possibly_invalid_exports.get(&atom!("metadata"));

                if let (Some((_, span1)), Some((_, span2))) = (export1, export2) {
                    report_error(
                        &self.app_dir,
                        &self.filepath,
                        RSCErrorKind::NextRscErrConflictMetadataExport((*span1, *span2)),
                    );
                }
            }
        }
    }

    /// ```js
    /// import dynamic from 'next/dynamic'
    ///
    /// dynamic(() => import(...)) // ✅
    /// dynamic(() => import(...), { ssr: true }) // ✅
    /// dynamic(() => import(...), { ssr: false }) // ❌
    /// ```
    fn check_for_next_ssr_false(&self, node: &CallExpr) -> Option<()> {
        if !self.is_callee_next_dynamic(&node.callee) {
            return None;
        }

        let ssr_arg = node.args.get(1)?;
        let obj = ssr_arg.expr.as_object()?;

        for prop in obj.props.iter().filter_map(|v| v.as_prop()?.as_key_value()) {
            let is_ssr = match &prop.key {
                PropName::Ident(IdentName { sym, .. }) => sym == "ssr",
                PropName::Str(s) => s.value == "ssr",
                _ => false,
            };

            if is_ssr {
                let value = prop.value.as_lit()?;
                if let Lit::Bool(Bool { value: false, .. }) = value {
                    report_error(
                        &self.app_dir,
                        &self.filepath,
                        RSCErrorKind::NextSsrDynamicFalseNotAllowed(node.span),
                    );
                }
            }
        }

        None
    }
}

impl Visit for ReactServerComponentValidator {
    noop_visit_type!();

    // coerce parsed script to run validation for the context, which is still
    // required even if file is empty
    fn visit_script(&mut self, script: &swc_core::ecma::ast::Script) {
        if script.body.is_empty() {
            self.visit_module(&Module::dummy());
        }
    }

    fn visit_call_expr(&mut self, node: &CallExpr) {
        node.visit_children_with(self);

        if self.is_react_server_layer {
            self.check_for_next_ssr_false(node);
        }
    }

    fn visit_module(&mut self, module: &Module) {
        self.imports = ImportMap::analyze(module);

        let (is_client_entry, is_action_file, imports, export_names) =
            collect_top_level_directives_and_imports(&self.app_dir, &self.filepath, module);
        let imports = Rc::new(imports);
        let export_names = Rc::new(export_names);

        self.directive_import_collection = Some((
            is_client_entry,
            is_action_file,
            imports.clone(),
            export_names,
        ));

        if self.is_react_server_layer {
            if is_client_entry {
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
        }

        module.visit_children_with(self);
    }
}

/// Returns a visitor to assert react server components without any transform.
/// This is for the Turbopack which have its own transform phase for the server
/// components proxy.
///
/// This also returns a visitor instead of fold and performs better than running
/// whole transform as a folder.
pub fn server_components_assert(
    filename: FileName,
    config: Config,
    app_dir: Option<PathBuf>,
) -> impl Visit {
    let is_react_server_layer: bool = match &config {
        Config::WithOptions(x) => x.is_react_server_layer,
        _ => false,
    };
    let cache_components_enabled: bool = match &config {
        Config::WithOptions(x) => x.cache_components_enabled,
        _ => false,
    };
    let use_cache_enabled: bool = match &config {
        Config::WithOptions(x) => x.use_cache_enabled,
        _ => false,
    };
    let filename = match filename {
        FileName::Custom(path) => format!("<{path}>"),
        _ => filename.to_string(),
    };
    ReactServerComponentValidator::new(
        is_react_server_layer,
        cache_components_enabled,
        use_cache_enabled,
        filename,
        app_dir,
    )
}

/// Runs react server component transform for the module proxy, as well as
/// running assertion.
pub fn server_components<C: Comments>(
    filename: Arc<FileName>,
    config: Config,
    comments: C,
    app_dir: Option<PathBuf>,
) -> impl Pass + VisitMut {
    let is_react_server_layer: bool = match &config {
        Config::WithOptions(x) => x.is_react_server_layer,
        _ => false,
    };
    let cache_components_enabled: bool = match &config {
        Config::WithOptions(x) => x.cache_components_enabled,
        _ => false,
    };
    let use_cache_enabled: bool = match &config {
        Config::WithOptions(x) => x.use_cache_enabled,
        _ => false,
    };
    visit_mut_pass(ReactServerComponents {
        is_react_server_layer,
        cache_components_enabled,
        use_cache_enabled,
        comments,
        filepath: match &*filename {
            FileName::Custom(path) => format!("<{path}>"),
            _ => filename.to_string(),
        },
        app_dir,
        directive_import_collection: None,
    })
}
