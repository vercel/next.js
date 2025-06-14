use std::{fs, path::PathBuf, sync::Arc};

use napi::bindgen_prelude::*;
use swc_core::{
    base::{
        config::{IsModule, ParseOptions},
        try_with_handler,
    },
    common::{
        FileName, FilePathMapping, GLOBALS, SourceMap, comments::Comments, errors::ColorConfig,
    },
    ecma::{
        ast::{Decl, EsVersion, Id},
        atoms::Atom,
        parser::{EsSyntax, Syntax, TsSyntax},
        utils::find_pat_ids,
        visit::{Visit, VisitWith},
    },
    node::MapErr,
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
            let comments = c.comments().clone();
            let comments: Option<&dyn Comments> = if options.comments {
                Some(&comments)
            } else {
                None
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
                        comments,
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
