use std::path::PathBuf;

use next_binding::swc::core::{
    common::{errors::HANDLER, FileName},
    ecma::ast::*,
    ecma::visit::{as_folder, noop_visit_mut_type, Fold, VisitMut},
};
pub fn disallow_amp_config_in_app_dir(
    filepath: FileName,
    app_dir: PathBuf,
) -> impl Fold + VisitMut {
    as_folder(DisallowAmpConfigInAppDir {
        filepath: filepath.to_string(),
        app_dir,
    })
}

#[derive(Debug, Default)]
struct DisallowAmpConfigInAppDir {
    filepath: String,
    app_dir: PathBuf,
}

const CONFIG_KEY: &str = "config";

impl VisitMut for DisallowAmpConfigInAppDir {
    noop_visit_mut_type!();

    fn visit_mut_export_decl(&mut self, export: &mut ExportDecl) {
        if let Decl::Var(var_decl) = &export.decl {
            for decl in &var_decl.decls {
                let is_config =
                    matches!(&decl.name, Pat::Ident(ident) if &ident.id.sym == CONFIG_KEY);

                if is_config {
                    if let Some(expr) = &decl.init {
                        if let Expr::Object(obj) = &**expr {
                            for prop in &obj.props {
                                if let PropOrSpread::Prop(prop) = prop {
                                    if let Prop::KeyValue(kv) = &**prop {
                                        if let PropName::Ident(ident) = &kv.key {
                                            if &ident.sym == "amp" {
                                                if let Some(app_dir) = self.app_dir.to_str() {
                                                    if self.filepath.starts_with(app_dir) {
                                                        HANDLER.with(|handler| {
                                                            handler
                                                                .struct_span_err(
                                                                    export.span,
                                                                    "AMP is not supported in the \
                                                                     app directory. If you need \
                                                                     to use AMP it will continue \
                                                                     to be supported in the pages \
                                                                     directory.",
                                                                )
                                                                .emit()
                                                        })
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
            }
        }
    }
}
