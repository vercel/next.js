use chrono::Utc;
use swc_core::{
    common::{DUMMY_SP, Span, errors::HANDLER},
    ecma::{
        ast::*,
        visit::{Fold, FoldWith, fold_pass},
    },
};

pub fn page_config(is_development: bool, is_page_file: bool) -> impl Pass {
    fold_pass(PageConfig {
        is_development,
        is_page_file,
        ..Default::default()
    })
}

#[derive(Debug, Default)]
struct PageConfig {
    drop_bundle: bool,
    in_test: bool,
    is_development: bool,
    is_page_file: bool,
}

const STRING_LITERAL_DROP_BUNDLE: &str = "__NEXT_DROP_CLIENT_FILE__";
const CONFIG_KEY: &str = "config";

/// TODO: Implement this as a [Pass] instead of a full visitor ([Fold])
impl Fold for PageConfig {
    fn fold_module_items(&mut self, items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        let mut new_items = vec![];
        for item in items {
            new_items.push(item.fold_with(self));
            if !self.is_development && self.drop_bundle {
                let timestamp = match self.in_test {
                    true => String::from("mock_timestamp"),
                    false => Utc::now().timestamp().to_string(),
                };
                return vec![ModuleItem::Stmt(Stmt::Decl(Decl::Var(Box::new(VarDecl {
                    decls: vec![VarDeclarator {
                        name: Pat::Ident(BindingIdent {
                            id: Ident {
                                sym: STRING_LITERAL_DROP_BUNDLE.into(),
                                ..Default::default()
                            },
                            type_ann: None,
                        }),
                        init: Some(Box::new(Expr::Lit(Lit::Str(Str {
                            value: format!("{STRING_LITERAL_DROP_BUNDLE} {timestamp}").into(),
                            span: DUMMY_SP,
                            raw: None,
                        })))),
                        span: DUMMY_SP,
                        definite: false,
                    }],
                    span: DUMMY_SP,
                    kind: VarDeclKind::Const,
                    ..Default::default()
                }))))];
            }
        }

        new_items
    }

    fn fold_export_decl(&mut self, export: ExportDecl) -> ExportDecl {
        if let Decl::Var(var_decl) = &export.decl {
            for decl in &var_decl.decls {
                let mut is_config = false;
                if let Pat::Ident(ident) = &decl.name
                    && ident.id.sym == CONFIG_KEY
                {
                    is_config = true;
                }

                if is_config {
                    if let Some(expr) = &decl.init {
                        if let Expr::Object(obj) = &**expr {
                            for prop in &obj.props {
                                if let PropOrSpread::Prop(prop) = prop {
                                    if let Prop::KeyValue(kv) = &**prop {
                                        match &kv.key {
                                            PropName::Ident(_) => {}
                                            _ => {
                                                self.handle_error(
                                                    "Invalid property found.",
                                                    export.span,
                                                );
                                            }
                                        }
                                    } else {
                                        self.handle_error(
                                            "Invalid property or value.",
                                            export.span,
                                        );
                                    }
                                } else {
                                    self.handle_error(
                                        "Property spread is not allowed.",
                                        export.span,
                                    );
                                }
                            }
                        } else {
                            self.handle_error("Expected config to be an object.", export.span);
                        }
                    } else {
                        self.handle_error("Expected config to be an object.", export.span);
                    }
                }
            }
        }
        export
    }

    fn fold_export_named_specifier(
        &mut self,
        specifier: ExportNamedSpecifier,
    ) -> ExportNamedSpecifier {
        match &specifier.exported {
            Some(ident) => {
                if let ModuleExportName::Ident(ident) = ident
                    && ident.sym == CONFIG_KEY
                {
                    self.handle_error("Config cannot be re-exported.", specifier.span)
                }
            }
            None => {
                if let ModuleExportName::Ident(ident) = &specifier.orig
                    && ident.sym == CONFIG_KEY
                {
                    self.handle_error("Config cannot be re-exported.", specifier.span)
                }
            }
        }
        specifier
    }
}

impl PageConfig {
    fn handle_error(&mut self, details: &str, span: Span) {
        if self.is_page_file {
            let message = format!("Invalid page config export found. {details} \
      See: https://nextjs.org/docs/messages/invalid-page-config");
            HANDLER.with(|handler| handler.struct_span_err(span, &message).emit());
        }
    }
}
