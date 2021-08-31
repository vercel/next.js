// use swc_common::DUMMY_SP;
// use swc_ecmascript::ast::*;
// use swc_ecmascript::utils::{
//   ident::{Id, IdentLike},
//   prepend,
// };
// use swc_ecmascript::visit::{Fold, FoldWith};

// use super::transform_css::transform_css;
// use super::utils::*;

// pub fn external_styles(
//   style_import_name: &String,
//   file_has_styled_jsx: bool,
// ) -> impl 'static + Fold {
//   ExternalStyles {
//     style_import_name: style_import_name.to_string(),
//     external_bindings: vec![],
//     file_has_styled_jsx,
//     file_has_css_resolve: false,
//     external_hash: None,
//     add_hash: None,
//   }
// }

// #[derive(Default)]
// struct ExternalStyles {
//   external_bindings: Vec<Id>,
//   style_import_name: String,
//   file_has_styled_jsx: bool,
//   file_has_css_resolve: bool,
//   external_hash: Option<String>,
//   add_hash: Option<(String, String)>,
// }

// impl Fold for ExternalStyles {
//   fn fold_import_decl(&mut self, decl: ImportDecl) -> ImportDecl {
//     let ImportDecl {
//       ref src,
//       ref specifiers,
//       ..
//     } = decl;
//     if &src.value == "styled-jsx/css" {
//       for specifier in specifiers {
//         match specifier {
//           ImportSpecifier::Default(default_specifier) => {
//             self.external_bindings.push(default_specifier.local.to_id())
//           }
//           ImportSpecifier::Named(named_specifier) => {
//             self.external_bindings.push(named_specifier.local.to_id())
//           }
//           _ => {}
//         }
//       }
//     }

//     decl
//   }

//   fn fold_expr(&mut self, expr: Expr) -> Expr {
//     let expr = expr.fold_children_with(self);
//     match expr {
//       Expr::TaggedTpl(tagged_tpl) => match &*tagged_tpl.tag {
//         Expr::Ident(identifier) => {
//           if self.external_bindings.contains(&identifier.to_id()) {
//             self.process_tagged_template_expr(tagged_tpl)
//           } else {
//             Expr::TaggedTpl(tagged_tpl)
//           }
//         }
//         _ => Expr::TaggedTpl(tagged_tpl),
//       },
//       expr => expr,
//     }
//   }

//   fn fold_var_declarator(&mut self, declarator: VarDeclarator) ->
// VarDeclarator {     let declarator = declarator.fold_children_with(self);
//     if let Some(external_hash) = &self.external_hash {
//       match &declarator.name {
//         Pat::Ident(BindingIdent {
//           id: Ident { sym, .. },
//           ..
//         }) => {
//           self.add_hash = Some((sym.to_string(), external_hash.clone()));
//           self.external_hash = None;
//         }
//         _ => panic!("Not supported"),
//       }
//     }
//     declarator
//   }

//   fn fold_module_items(&mut self, items: Vec<ModuleItem>) -> Vec<ModuleItem>
// {     let mut add_hashes = vec![];
//     let mut new_items = vec![];
//     let mut i = 0;
//     for item in items {
//       new_items.push(item.fold_children_with(self));
//       if let Some(add_hash) = self.get_add_hash() {
//         add_hashes.push((i, add_hash));
//       }
//       i = i + 1;
//     }

//     let mut num_inserted = 0;
//     for (i, add_hash) in add_hashes {
//       let item = ModuleItem::Stmt(add_hash_statment(add_hash));
//       new_items.insert(i + 1 + num_inserted, item);
//       num_inserted = num_inserted + 1;
//     }

//     if !self.file_has_styled_jsx && self.file_has_css_resolve {
//       prepend(
//         &mut new_items,
//         styled_jsx_import_decl(&self.style_import_name),
//       );
//     }

//     new_items
//   }

//   fn fold_block_stmt(&mut self, mut block: BlockStmt) -> BlockStmt {
//     let mut add_hashes = vec![];
//     let mut new_stmts = vec![];
//     let mut i = 0;
//     for stmt in block.stmts {
//       new_stmts.push(stmt.fold_children_with(self));
//       if let Some(add_hash) = self.get_add_hash() {
//         add_hashes.push((i, add_hash));
//       }
//       i = i + 1;
//     }

//     let mut num_inserted = 0;
//     for (i, add_hash) in add_hashes {
//       let item = add_hash_statment(add_hash);
//       new_stmts.insert(i + 1 + num_inserted, item);
//       num_inserted = num_inserted + 1;
//     }

//     block.stmts = new_stmts;
//     block
//   }
// }

// impl ExternalStyles {
//   fn get_add_hash(&mut self) -> Option<(String, String)> {
//     let add_hash = self.add_hash.clone();
//     self.add_hash = None;
//     add_hash
//   }
//   fn process_tagged_template_expr(&mut self, tagged_tpl: TaggedTpl) -> Expr {
//     let style_info = get_jsx_style_info(&Expr::Tpl(tagged_tpl.tpl.clone()));
//     self.external_hash = Some(style_info.hash.clone());
//     let styles = vec![style_info];
//     let (static_class_name, class_name) = compute_class_names(&styles,
// &self.style_import_name);     let mut tag_opt = None;
//     if let Expr::Ident(Ident { sym, .. }) = &*tagged_tpl.tag {
//       tag_opt = Some(sym.to_string());
//     }
//     let tag = tag_opt.unwrap();
//     if tag == "resolve" {
//       self.file_has_css_resolve = true;
//     }
//     let css = transform_css(&styles[0], tag == "global", &static_class_name);
//     if tag == "resolve" {
//       return Expr::Object(ObjectLit {
//         props: vec![
//           PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
//             key: PropName::Ident(Ident {
//               sym: "styles".into(),
//               span: DUMMY_SP,
//               optional: false,
//             }),
//             value: Box::new(Expr::JSXElement(Box::new(make_styled_jsx_el(
//               &styles[0],
//               css,
//               &self.style_import_name,
//             )))),
//           }))),
//           PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
//             key: PropName::Ident(Ident {
//               sym: "className".into(),
//               span: DUMMY_SP,
//               optional: false,
//             }),
//             value: Box::new(class_name.unwrap()),
//           }))),
//         ],
//         span: DUMMY_SP,
//       });
//     }
//     Expr::New(NewExpr {
//       callee: Box::new(Expr::Ident(Ident {
//         sym: "String".into(),
//         span: DUMMY_SP,
//         optional: false,
//       })),
//       args: Some(vec![ExprOrSpread {
//         expr: Box::new(css),
//         spread: None,
//       }]),
//       span: DUMMY_SP,
//       type_args: None,
//     })
//   }
// }

// fn add_hash_statment((ident, hash): (String, String)) -> Stmt {
//   Stmt::Expr(ExprStmt {
//     expr: Box::new(Expr::Assign(AssignExpr {
//       left: PatOrExpr::Expr(Box::new(Expr::Member(MemberExpr {
//         obj: ExprOrSuper::Expr(Box::new(Expr::Ident(Ident {
//           sym: ident.into(),
//           span: DUMMY_SP,
//           optional: false,
//         }))),
//         prop: Box::new(Expr::Ident(Ident {
//           sym: "__hash".into(),
//           span: DUMMY_SP,
//           optional: false,
//         })),
//         span: DUMMY_SP,
//         computed: false,
//       }))),
//       right: Box::new(string_literal_expr(&hash)),
//       op: AssignOp::Assign,
//       span: DUMMY_SP,
//     })),
//     span: DUMMY_SP,
//   })
// }
