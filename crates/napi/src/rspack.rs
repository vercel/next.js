use std::{cell::RefCell, fs, path::PathBuf, sync::Arc};

use napi::bindgen_prelude::*;
use swc_core::{
    base::{
        config::{IsModule, ParseOptions},
        try_with_handler,
    },
    common::{
        FileName, FilePathMapping, GLOBALS, Mark, SourceMap, SyntaxContext, errors::ColorConfig,
    },
    ecma::{
        ast::{Decl, EsVersion, Id},
        atoms::Atom,
        parser::{EsSyntax, Syntax, TsSyntax},
        utils::{ExprCtx, find_pat_ids},
        visit::{Visit, VisitMutWith, VisitWith},
    },
};

use crate::{
    next_api::utils::{NapiIssueSourceRange, NapiSourcePos},
    util::MapErr,
};

struct Finder {
    pub named_exports: Vec<Atom>,
}

impl Visit for Finder {
    fn visit_export_decl(&mut self, node: &swc_core::ecma::ast::ExportDecl) {
        match &node.decl {
            Decl::Class(class_decl) => {
                self.named_exports.push(class_decl.ident.sym.clone());
            }
            Decl::Fn(fn_decl) => {
                self.named_exports.push(fn_decl.ident.sym.clone());
            }
            Decl::Var(var_decl) => {
                let ids: Vec<Id> = find_pat_ids(&var_decl.decls);
                for id in ids {
                    self.named_exports.push(id.0);
                }
            }
            _ => {}
        }
    }

    fn visit_export_named_specifier(&mut self, node: &swc_core::ecma::ast::ExportNamedSpecifier) {
        let named_export = if let Some(exported) = &node.exported {
            exported.atom().clone()
        } else {
            node.orig.atom().clone()
        };
        self.named_exports.push(named_export);
    }

    fn visit_export_namespace_specifier(
        &mut self,
        node: &swc_core::ecma::ast::ExportNamespaceSpecifier,
    ) {
        self.named_exports.push(node.name.atom().clone());
    }
}

pub struct FinderTask {
    pub resource_path: Option<String>,
}

impl Task for FinderTask {
    type Output = Vec<Atom>;
    type JsValue = Array;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let resource_path = PathBuf::from(self.resource_path.take().unwrap());
        let src = fs::read_to_string(&resource_path)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        let syntax = match resource_path
            .extension()
            .map(|os_str| os_str.to_string_lossy())
        {
            Some(ext) if matches!(ext.as_ref(), "ts" | "mts" | "cts") => {
                Syntax::Typescript(TsSyntax {
                    tsx: false,
                    decorators: true,
                    dts: false,
                    no_early_errors: true,
                    disallow_ambiguous_jsx_like: false,
                })
            }
            Some(ext) if matches!(ext.as_ref(), "tsx" | "mtsx" | "ctsx") => {
                Syntax::Typescript(TsSyntax {
                    tsx: true,
                    decorators: true,
                    dts: false,
                    no_early_errors: true,
                    disallow_ambiguous_jsx_like: false,
                })
            }
            _ => Syntax::Es(EsSyntax {
                jsx: true,
                fn_bind: true,
                decorators: true,
                decorators_before_export: true,
                export_default_from: true,
                import_attributes: true,
                allow_super_outside_method: true,
                allow_return_outside_function: true,
                auto_accessors: true,
                explicit_resource_management: true,
            }),
        };

        GLOBALS.set(&Default::default(), || {
            let c =
                swc_core::base::Compiler::new(Arc::new(SourceMap::new(FilePathMapping::empty())));

            let options = ParseOptions {
                comments: false,
                syntax,
                is_module: IsModule::Unknown,
                target: EsVersion::default(),
            };
            let fm =
                c.cm.new_source_file(Arc::new(FileName::Real(resource_path)), src);
            let program = try_with_handler(
                c.cm.clone(),
                swc_core::base::HandlerOpts {
                    color: ColorConfig::Never,
                    skip_filename: false,
                },
                |handler| {
                    c.parse_js(
                        fm,
                        handler,
                        options.target,
                        options.syntax,
                        options.is_module,
                        None,
                    )
                },
            )
            .map_err(|e| e.to_pretty_error())
            .convert_err()?;

            let mut visitor = Finder {
                named_exports: Vec::new(),
            };
            // Visit the AST to find named exports
            program.visit_with(&mut visitor);

            Ok(visitor.named_exports)
        })
    }

    fn resolve(&mut self, env: Env, result: Self::Output) -> napi::Result<Self::JsValue> {
        let mut array = env.create_array(result.len() as u32)?;
        for (i, name) in result.iter().enumerate() {
            let js_val = env.create_string(name.as_str())?;
            array.set(i as u32, js_val)?;
        }
        Ok(array)
    }
}

#[napi(ts_return_type = "Promise<string[]>")]
pub fn get_module_named_exports(resource_path: String) -> AsyncTask<FinderTask> {
    AsyncTask::new(FinderTask {
        resource_path: Some(resource_path),
    })
}

#[napi(object)]
pub struct NapiSourceDiagnostic {
    pub severity: &'static str,
    pub message: String,
    pub loc: NapiIssueSourceRange,
}

pub struct AnalyzeTask {
    pub source: Option<String>,
    pub is_production: bool,
}

impl Task for AnalyzeTask {
    type Output = Vec<NapiSourceDiagnostic>;
    type JsValue = Vec<NapiSourceDiagnostic>;

    fn compute(&mut self) -> Result<Self::Output> {
        GLOBALS.set(&Default::default(), || {
            let c =
                swc_core::base::Compiler::new(Arc::new(SourceMap::new(FilePathMapping::empty())));

            let options = ParseOptions {
                comments: false,
                syntax: Syntax::Es(EsSyntax {
                    jsx: true,
                    fn_bind: true,
                    decorators: true,
                    decorators_before_export: true,
                    export_default_from: true,
                    import_attributes: true,
                    allow_super_outside_method: true,
                    allow_return_outside_function: true,
                    auto_accessors: true,
                    explicit_resource_management: true,
                }),
                is_module: IsModule::Unknown,
                target: EsVersion::default(),
            };
            let source = self.source.take().unwrap();
            let fm =
                c.cm.new_source_file(Arc::new(FileName::Anon), source);
            let mut program = try_with_handler(
                c.cm.clone(),
                swc_core::base::HandlerOpts {
                    color: ColorConfig::Never,
                    skip_filename: false,
                },
                |handler| {
                    c.parse_js(
                        fm,
                        handler,
                        options.target,
                        options.syntax,
                        options.is_module,
                        None,
                    )
                },
            )
            .map_err(|e| e.to_pretty_error())
            .convert_err()?;

            let diagnostics = RefCell::new(Vec::new());
            let top_level_mark = Mark::fresh(Mark::root());
            let unresolved_mark = Mark::fresh(Mark::root());
            let mut resolver_visitor = swc_core::ecma::transforms::base::resolver(unresolved_mark, top_level_mark, true);
            let mut analyze_visitor = next_custom_transforms::transforms::warn_for_edge_runtime::warn_for_edge_runtime_with_handlers(
                c.cm.clone(),
                ExprCtx {
                    is_unresolved_ref_safe: true,
                    unresolved_ctxt: SyntaxContext::empty().apply_mark(unresolved_mark),
                    in_strict: false,
                    remaining_depth: 4,
                },
                false,
                self.is_production,
                |span, msg| {
                    let start = c.cm.lookup_char_pos(span.lo);
                    let end = c.cm.lookup_char_pos(span.hi);
                    diagnostics.borrow_mut().push(NapiSourceDiagnostic {
                        severity: "Warning",
                        message: msg,
                        loc: NapiIssueSourceRange {
                            start: NapiSourcePos {
                                line: start.line as u32,
                                column: start.col_display as u32,
                            },
                            end: NapiSourcePos {
                                line: end.line as u32,
                                column: end.col_display as u32,
                            }
                        }
                    });
                },
                |span, msg| {
                    let start = c.cm.lookup_char_pos(span.lo);
                    let end = c.cm.lookup_char_pos(span.hi);
                    diagnostics.borrow_mut().push(NapiSourceDiagnostic {
                        severity: "Error",
                        message: msg,
                        loc: NapiIssueSourceRange {
                            start: NapiSourcePos {
                                line: start.line as u32,
                                column: start.col_display as u32,
                            },
                            end: NapiSourcePos {
                                line: end.line as u32,
                                column: end.col_display as u32,
                            }
                        }
                    });
                });

                program.visit_mut_with(&mut resolver_visitor);
                program.visit_with(&mut analyze_visitor);

            Ok(diagnostics.take())
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi(ts_return_type = "Promise<NapiSourceDiagnostic[]>")]
pub fn warn_for_edge_runtime(source: String, is_production: bool) -> AsyncTask<AnalyzeTask> {
    AsyncTask::new(AnalyzeTask {
        source: Some(source),
        is_production,
    })
}
