use std::iter::FromIterator;

use lazy_static::lazy_static;
use rustc_hash::FxHashSet;
use swc_core::{
    atoms::atom,
    ecma::{
        ast::{
            Decl, ExportDecl, ExportNamedSpecifier, ExportSpecifier, Expr, ExprOrSpread, ExprStmt,
            Lit, ModuleExportName, ModuleItem, NamedExport, Pat, Stmt, Str, VarDeclarator,
        },
        visit::{Visit, VisitWith},
    },
};

use super::{ExportInfo, ExportInfoWarning};

lazy_static! {
    static ref EXPORTS_SET: FxHashSet<&'static str> = FxHashSet::from_iter([
        "getStaticProps",
        "getServerSideProps",
        "generateImageMetadata",
        "generateSitemaps",
        "generateStaticParams",
    ]);
}

pub(crate) struct CollectExportsVisitor {
    pub export_info: Option<ExportInfo>,
}

impl CollectExportsVisitor {
    pub fn new() -> Self {
        Self {
            export_info: Default::default(),
        }
    }
}

impl Visit for CollectExportsVisitor {
    fn visit_module_items(&mut self, stmts: &[swc_core::ecma::ast::ModuleItem]) {
        let mut is_directive = true;

        for stmt in stmts {
            if let ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                expr: box Expr::Lit(Lit::Str(Str { value, .. })),
                ..
            })) = stmt
            {
                if is_directive {
                    if value == "use server" {
                        let export_info = self.export_info.get_or_insert(Default::default());
                        export_info.directives.insert(atom!("server"));
                    }
                    if value == "use client" {
                        let export_info = self.export_info.get_or_insert(Default::default());
                        export_info.directives.insert(atom!("client"));
                    }
                }
            } else {
                is_directive = false;
            }

            stmt.visit_children_with(self);
        }
    }

    fn visit_export_decl(&mut self, export_decl: &ExportDecl) {
        match &export_decl.decl {
            Decl::Var(box var_decl) => {
                if let Some(VarDeclarator {
                    name: Pat::Ident(name),
                    ..
                }) = var_decl.decls.first()
                {
                    if EXPORTS_SET.contains(&name.sym.as_str()) {
                        let export_info = self.export_info.get_or_insert(Default::default());
                        export_info.ssg = name.sym == "getStaticProps";
                        export_info.ssr = name.sym == "getServerSideProps";
                        export_info.generate_image_metadata =
                            Some(name.sym == "generateImageMetadata");
                        export_info.generate_sitemaps = Some(name.sym == "generateSitemaps");
                        export_info.generate_static_params = name.sym == "generateStaticParams";
                    }
                }

                for decl in &var_decl.decls {
                    if let Pat::Ident(id) = &decl.name {
                        if id.sym == "runtime" {
                            let export_info = self.export_info.get_or_insert(Default::default());
                            export_info.runtime = decl.init.as_ref().and_then(|init| {
                                if let Expr::Lit(Lit::Str(Str { value, .. })) = &**init {
                                    Some(value.clone())
                                } else {
                                    None
                                }
                            })
                        } else if id.sym == "preferredRegion" {
                            if let Some(init) = &decl.init {
                                if let Expr::Array(arr) = &**init {
                                    for expr in arr.elems.iter().flatten() {
                                        if let ExprOrSpread {
                                            expr: box Expr::Lit(Lit::Str(Str { value, .. })),
                                            ..
                                        } = expr
                                        {
                                            let export_info =
                                                self.export_info.get_or_insert(Default::default());
                                            export_info.preferred_region.push(value.clone());
                                        }
                                    }
                                } else if let Expr::Lit(Lit::Str(Str { value, .. })) = &**init {
                                    let export_info =
                                        self.export_info.get_or_insert(Default::default());
                                    export_info.preferred_region.push(value.clone());
                                }
                            }
                        } else {
                            let export_info = self.export_info.get_or_insert(Default::default());
                            export_info.extra_properties.insert(id.sym.clone());
                        }
                    }
                }
            }
            Decl::Fn(fn_decl) => {
                let id = &fn_decl.ident;

                let export_info = self.export_info.get_or_insert(Default::default());
                export_info.ssg = id.sym == "getStaticProps";
                export_info.ssr = id.sym == "getServerSideProps";
                export_info.generate_image_metadata = Some(id.sym == "generateImageMetadata");
                export_info.generate_sitemaps = Some(id.sym == "generateSitemaps");
                export_info.generate_static_params = id.sym == "generateStaticParams";
            }
            _ => {}
        }

        export_decl.visit_children_with(self);
    }

    fn visit_named_export(&mut self, named_export: &NamedExport) {
        for specifier in &named_export.specifiers {
            if let ExportSpecifier::Named(ExportNamedSpecifier {
                orig: ModuleExportName::Ident(value),
                ..
            }) = specifier
            {
                let export_info = self.export_info.get_or_insert(Default::default());

                if !export_info.ssg && value.sym == "getStaticProps" {
                    export_info.ssg = true;
                }

                if !export_info.ssr && value.sym == "getServerSideProps" {
                    export_info.ssr = true;
                }

                if !export_info.generate_image_metadata.unwrap_or_default()
                    && value.sym == "generateImageMetadata"
                {
                    export_info.generate_image_metadata = Some(true);
                }

                if !export_info.generate_sitemaps.unwrap_or_default()
                    && value.sym == "generateSitemaps"
                {
                    export_info.generate_sitemaps = Some(true);
                }

                if !export_info.generate_static_params && value.sym == "generateStaticParams" {
                    export_info.generate_static_params = true;
                }

                if export_info.runtime.is_none() && value.sym == "runtime" {
                    export_info.warnings.push(ExportInfoWarning::new(
                        value.sym.clone(),
                        "it was not assigned to a string literal",
                    ));
                }

                if export_info.preferred_region.is_empty() && value.sym == "preferredRegion" {
                    export_info.warnings.push(ExportInfoWarning::new(
                        value.sym.clone(),
                        "it was not assigned to a string literal or an array of string literals",
                    ));
                }
            }
        }

        named_export.visit_children_with(self);
    }
}
