use easy_error::{bail, Error};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::mem::take;
use std::sync::Arc;
use swc_common::errors::HANDLER;
use swc_common::{collections::AHashSet, FileName, SourceMap, Span, DUMMY_SP};
use swc_ecmascript::ast::*;
use swc_ecmascript::minifier::{
    eval::{EvalResult, Evaluator},
    marks::Marks,
};
use swc_ecmascript::utils::{collect_decls, prepend_stmt};
use swc_ecmascript::utils::{drop_span, private_ident};
use swc_ecmascript::visit::{Fold, FoldWith};

//use external::external_styles;
use transform_css::transform_css;
use utils::*;

mod transform_css;
mod utils;

pub fn styled_jsx(cm: Arc<SourceMap>, file_name: FileName) -> impl Fold {
    let file_name = match file_name {
        FileName::Real(real_file_name) => real_file_name
            .to_str()
            .map(|real_file_name| real_file_name.to_string()),
        _ => None,
    };

    StyledJSXTransformer {
        cm,
        file_name,
        styles: Default::default(),
        static_class_name: Default::default(),
        class_name: Default::default(),
        file_has_styled_jsx: Default::default(),
        has_styled_jsx: Default::default(),
        bindings: Default::default(),
        nearest_scope_bindings: Default::default(),
        func_scope_level: Default::default(),
        style_import_name: Default::default(),
        external_bindings: Default::default(),
        file_has_css_resolve: Default::default(),
        external_hash: Default::default(),
        add_hash: Default::default(),
        add_default_decl: Default::default(),
        in_function_params: Default::default(),
        evaluator: Default::default(),
        visiting_styled_jsx_descendants: Default::default(),
    }
}

struct StyledJSXTransformer {
    cm: Arc<SourceMap>,
    file_name: Option<String>,
    styles: Vec<JSXStyle>,
    static_class_name: Option<String>,
    class_name: Option<Expr>,
    file_has_styled_jsx: bool,
    has_styled_jsx: bool,
    bindings: AHashSet<Id>,
    nearest_scope_bindings: AHashSet<Id>,
    func_scope_level: u8,
    style_import_name: Option<String>,
    external_bindings: Vec<Id>,
    file_has_css_resolve: bool,
    external_hash: Option<String>,
    add_hash: Option<(Id, String)>,
    add_default_decl: Option<(Id, Expr)>,
    in_function_params: bool,
    evaluator: Option<Evaluator>,
    visiting_styled_jsx_descendants: bool,
}

pub struct LocalStyle {
    hash: String,
    css: String,
    css_span: Span,
    is_dynamic: bool,
    #[allow(clippy::vec_box)]
    expressions: Vec<Box<Expr>>,
}

pub struct ExternalStyle {
    expr: Expr,
    identifier: Ident,
    is_global: bool,
}

pub enum JSXStyle {
    Local(LocalStyle),
    External(ExternalStyle),
}

enum StyleExpr<'a> {
    Str(&'a Str),
    Tpl(&'a Tpl, &'a Expr),
    Ident(&'a Ident),
}

impl Fold for StyledJSXTransformer {
    fn fold_jsx_element(&mut self, el: JSXElement) -> JSXElement {
        if is_styled_jsx(&el) {
            if self.visiting_styled_jsx_descendants {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(
                            el.span,
                            "Detected nested styled-jsx tag.\nRead more: https://nextjs.org/docs/messages/nested-styled-jsx-tags",
                        )
                        .emit()
                });
                return el;
            }

            let parent_has_styled_jsx = self.has_styled_jsx;
            if !parent_has_styled_jsx && self.check_for_jsx_styles(Some(&el), &el.children).is_err()
            {
                return el;
            }
            let el = match self.replace_jsx_style(&el) {
                Ok(el) => el,
                Err(_) => el,
            };
            if !parent_has_styled_jsx {
                self.reset_styles_state();
            }
            return el;
        }

        if self.has_styled_jsx {
            self.visiting_styled_jsx_descendants = true;
            let el = el.fold_children_with(self);
            self.visiting_styled_jsx_descendants = false;
            return el;
        }

        if self.check_for_jsx_styles(None, &el.children).is_err() {
            return el;
        }
        let el = el.fold_children_with(self);
        self.reset_styles_state();

        el
    }

    fn fold_jsx_fragment(&mut self, fragment: JSXFragment) -> JSXFragment {
        if self.has_styled_jsx {
            self.visiting_styled_jsx_descendants = true;
            let fragment = fragment.fold_children_with(self);
            self.visiting_styled_jsx_descendants = false;
            return fragment;
        }

        if self.check_for_jsx_styles(None, &fragment.children).is_err() {
            return fragment;
        };
        let fragment = fragment.fold_children_with(self);
        self.reset_styles_state();

        fragment
    }

    fn fold_jsx_opening_element(&mut self, mut el: JSXOpeningElement) -> JSXOpeningElement {
        if !self.has_styled_jsx {
            return el;
        }

        el.attrs = el.attrs.fold_with(self);

        if let JSXElementName::Ident(Ident { sym, span, .. }) = &el.name {
            if sym != "style"
                && sym != self.style_import_name.as_ref().unwrap()
                && (!is_capitalized(&*sym)
                    || self
                        .nearest_scope_bindings
                        .contains(&(sym.clone(), span.ctxt)))
            {
                let (existing_class_name, existing_index, existing_spread_index) =
                    get_existing_class_name(&el);

                let new_class_name = match (existing_class_name, &self.class_name) {
                    (Some(existing_class_name), Some(class_name)) => Some(add(
                        add(class_name.clone(), string_literal_expr(" ")),
                        existing_class_name,
                    )),
                    (Some(existing_class_name), None) => Some(existing_class_name),
                    (None, Some(class_name)) => Some(class_name.clone()),
                    _ => None,
                };

                if let Some(new_class_name) = new_class_name {
                    let class_name_attr = JSXAttrOrSpread::JSXAttr(JSXAttr {
                        span: DUMMY_SP,
                        name: JSXAttrName::Ident(ident("className")),
                        value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                            expr: JSXExpr::Expr(Box::new(new_class_name)),
                            span: DUMMY_SP,
                        })),
                    });
                    el.attrs.push(class_name_attr);
                }
                if let Some(existing_spread_index) = existing_spread_index {
                    el.attrs.remove(existing_spread_index);
                }
                if let Some(existing_index) = existing_index {
                    el.attrs.remove(existing_index);
                }
            }
        }

        el
    }

    fn fold_import_decl(&mut self, decl: ImportDecl) -> ImportDecl {
        let ImportDecl {
            ref src,
            ref specifiers,
            ..
        } = decl;
        if &src.value == "styled-jsx/css" {
            for specifier in specifiers {
                match specifier {
                    ImportSpecifier::Default(default_specifier) => {
                        self.external_bindings.push(default_specifier.local.to_id())
                    }
                    ImportSpecifier::Named(named_specifier) => {
                        self.external_bindings.push(named_specifier.local.to_id())
                    }
                    _ => {}
                }
            }
        }

        decl
    }

    fn fold_expr(&mut self, expr: Expr) -> Expr {
        let expr = expr.fold_children_with(self);
        match expr {
            Expr::TaggedTpl(tagged_tpl) => match &*tagged_tpl.tag {
                Expr::Ident(identifier) => {
                    if self.external_bindings.contains(&identifier.to_id()) {
                        match self.process_tagged_template_expr(&tagged_tpl, &identifier.sym) {
                            Ok(expr) => expr,
                            Err(_) => Expr::TaggedTpl(tagged_tpl),
                        }
                    } else {
                        Expr::TaggedTpl(tagged_tpl)
                    }
                }
                Expr::Member(MemberExpr {
                    obj: boxed_ident, ..
                }) => {
                    if let Expr::Ident(identifier) = &**boxed_ident {
                        if self.external_bindings.contains(&identifier.to_id()) {
                            match self.process_tagged_template_expr(&tagged_tpl, &identifier.sym) {
                                Ok(expr) => expr,
                                Err(_) => Expr::TaggedTpl(tagged_tpl),
                            }
                        } else {
                            Expr::TaggedTpl(tagged_tpl)
                        }
                    } else {
                        Expr::TaggedTpl(tagged_tpl)
                    }
                }
                _ => Expr::TaggedTpl(tagged_tpl),
            },
            expr => expr,
        }
    }

    fn fold_var_declarator(&mut self, declarator: VarDeclarator) -> VarDeclarator {
        let declarator = declarator.fold_children_with(self);
        if let Some(external_hash) = &self.external_hash.take() {
            if let Pat::Ident(BindingIdent {
                id: Ident { span, sym, .. },
                ..
            }) = &declarator.name
            {
                self.add_hash = Some(((sym.clone(), span.ctxt), external_hash.clone()));
            }
        }
        declarator
    }

    fn fold_export_default_expr(&mut self, default_expr: ExportDefaultExpr) -> ExportDefaultExpr {
        let default_expr = default_expr.fold_children_with(self);
        if let Some(external_hash) = &self.external_hash.take() {
            let default_ident = private_ident!("_defaultExport");
            self.add_hash = Some((default_ident.to_id(), external_hash.clone()));
            self.add_default_decl = Some((default_ident.to_id(), *default_expr.expr));
            return ExportDefaultExpr {
                expr: Box::new(Expr::Ident(default_ident)),
                span: DUMMY_SP,
            };
        }
        default_expr
    }

    fn fold_block_stmt(&mut self, mut block: BlockStmt) -> BlockStmt {
        let mut new_stmts = vec![];
        for stmt in block.stmts {
            new_stmts.push(stmt.fold_children_with(self));
            if let Some(add_hash) = self.add_hash.take() {
                new_stmts.push(add_hash_statement(add_hash));
            }
        }

        block.stmts = new_stmts;
        block
    }

    fn fold_module_items(&mut self, items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        let mut new_items = vec![];
        for item in items {
            let new_item = item.fold_children_with(self);
            if let Some((default_ident, default_expr)) = &self.add_default_decl {
                new_items.push(ModuleItem::Stmt(Stmt::Decl(Decl::Var(VarDecl {
                    kind: VarDeclKind::Const,
                    declare: false,
                    decls: vec![VarDeclarator {
                        name: Pat::Ident(BindingIdent {
                            id: Ident {
                                sym: default_ident.0.clone(),
                                span: DUMMY_SP.with_ctxt(default_ident.1),
                                optional: false,
                            },
                            type_ann: None,
                        }),
                        init: Some(Box::new(default_expr.clone())),
                        definite: false,
                        span: DUMMY_SP,
                    }],
                    span: DUMMY_SP,
                }))));
                self.add_default_decl = None;
                if let Some(add_hash) = self.add_hash.take() {
                    new_items.push(ModuleItem::Stmt(add_hash_statement(add_hash)));
                }
            }
            if !is_styled_css_import(&new_item) {
                new_items.push(new_item);
            }
            if let Some(add_hash) = self.add_hash.take() {
                new_items.push(ModuleItem::Stmt(add_hash_statement(add_hash)));
            }
        }

        if self.file_has_styled_jsx || self.file_has_css_resolve {
            prepend_stmt(
                &mut new_items,
                styled_jsx_import_decl(self.style_import_name.as_ref().unwrap()),
            );
        }

        new_items
    }

    fn fold_binding_ident(&mut self, node: BindingIdent) -> BindingIdent {
        if self.in_function_params {
            self.nearest_scope_bindings.insert(node.id.to_id());
        }
        node
    }

    fn fold_assign_pat_prop(&mut self, node: AssignPatProp) -> AssignPatProp {
        if self.in_function_params {
            self.nearest_scope_bindings.insert(node.key.to_id());
        }
        node
    }

    fn fold_function(&mut self, mut func: Function) -> Function {
        self.func_scope_level += 1;
        let surrounding_scope_bindings = take(&mut self.nearest_scope_bindings);
        self.in_function_params = true;
        let mut new_params = vec![];
        for param in func.params {
            new_params.push(param.fold_with(self));
        }
        func.params = new_params;
        self.in_function_params = false;
        self.nearest_scope_bindings.extend(collect_decls(&func));
        func.body = func.body.fold_with(self);
        self.nearest_scope_bindings = surrounding_scope_bindings;
        self.func_scope_level -= 1;
        func
    }

    fn fold_arrow_expr(&mut self, mut func: ArrowExpr) -> ArrowExpr {
        self.func_scope_level += 1;
        let surrounding_scope_bindings = take(&mut self.nearest_scope_bindings);
        self.in_function_params = true;
        let mut new_params = vec![];
        for param in func.params {
            new_params.push(param.fold_with(self));
        }
        func.params = new_params;
        self.in_function_params = false;
        self.nearest_scope_bindings.extend(collect_decls(&func));
        func.body = func.body.fold_with(self);
        self.nearest_scope_bindings = surrounding_scope_bindings;
        self.func_scope_level -= 1;
        func
    }

    fn fold_module(&mut self, module: Module) -> Module {
        self.bindings = collect_decls(&module);
        self.evaluator = Some(Evaluator::new(module.clone(), Marks::new()));
        self.style_import_name = Some(get_usable_import_specifier(&module.body));
        let module = module.fold_children_with(self);
        if self.file_has_css_resolve
            && self.file_name.is_some()
            && self.file_name.as_ref().unwrap().ends_with(".ts")
        {
            let file_name: &str = self.file_name.as_ref().unwrap();
            HANDLER.with(|handler| {
                handler.err(&format!(
                    "{} uses `css.resolve`, but ends with `.ts`. The file extension needs to be \
                     `.tsx` so that the jsx injected by `css.resolve` will be transformed.",
                    file_name
                ));
            });
        }
        module
    }
}

impl StyledJSXTransformer {
    fn check_for_jsx_styles(
        &mut self,
        el: Option<&JSXElement>,
        children: &[JSXElementChild],
    ) -> Result<(), Error> {
        let mut styles = vec![];
        let mut process_style = |el: &JSXElement| {
            self.file_has_styled_jsx = true;
            self.has_styled_jsx = true;
            let expr = get_style_expr(el)?;
            let style_info = self.get_jsx_style(expr, is_global(el));
            styles.insert(0, style_info);

            Ok(())
        };

        if el.is_some() && is_styled_jsx(el.unwrap()) {
            process_style(el.unwrap())?;
        } else {
            for i in children {
                if let JSXElementChild::JSXElement(child_el) = &i {
                    if is_styled_jsx(child_el) {
                        process_style(child_el)?;
                    }
                }
            }
        };

        if self.has_styled_jsx {
            let (static_class_name, class_name) =
                compute_class_names(&styles, self.style_import_name.as_ref().unwrap());
            self.styles = styles;
            self.static_class_name = static_class_name;
            self.class_name = class_name;
        }

        Ok(())
    }

    fn get_jsx_style(&mut self, style_expr: StyleExpr, is_global_jsx_element: bool) -> JSXStyle {
        let mut hasher = DefaultHasher::new();
        let css: String;
        let css_span: Span;
        let is_dynamic;
        let mut expressions = vec![];
        match style_expr {
            StyleExpr::Str(Str { value, span, .. }) => {
                hasher.write(value.as_ref().as_bytes());
                css = value.to_string();
                css_span = *span;
                is_dynamic = false;
            }
            StyleExpr::Tpl(
                Tpl {
                    exprs,
                    quasis,
                    span,
                },
                expr,
            ) => {
                if exprs.is_empty() {
                    hasher.write(quasis[0].raw.as_bytes());
                    css = quasis[0].raw.to_string();
                    css_span = *span;
                    is_dynamic = false;
                } else {
                    drop_span(expr.clone()).hash(&mut hasher);
                    let mut s = String::new();
                    for i in 0..quasis.len() {
                        let placeholder = if i == quasis.len() - 1 {
                            String::new()
                        } else {
                            format!("__styled-jsx-placeholder-{}__", i)
                        };
                        s = format!("{}{}{}", s, quasis[i].raw, placeholder)
                    }
                    css = s;
                    css_span = *span;
                    is_dynamic = if self.func_scope_level > 0 {
                        let res = self.evaluator.as_mut().unwrap().eval(expr);
                        !matches!(res, Some(EvalResult::Lit(_)))
                    } else {
                        false
                    };
                    expressions = exprs.clone();
                }
            }
            StyleExpr::Ident(ident) => {
                return JSXStyle::External(ExternalStyle {
                    expr: Expr::Member(MemberExpr {
                        obj: Box::new(Expr::Ident(ident.clone())),
                        prop: MemberProp::Ident(Ident {
                            sym: "__hash".into(),
                            span: DUMMY_SP,
                            optional: false,
                        }),
                        span: DUMMY_SP,
                    }),
                    identifier: ident.clone(),
                    is_global: is_global_jsx_element,
                });
            }
        }

        return JSXStyle::Local(LocalStyle {
            hash: format!("{:x}", hasher.finish()),
            css,
            css_span,
            is_dynamic,
            expressions,
        });
    }

    fn replace_jsx_style(&mut self, el: &JSXElement) -> Result<JSXElement, Error> {
        let style_info = self.styles.pop().unwrap();

        let is_global = el.opening.attrs.iter().any(|attr| {
            if let JSXAttrOrSpread::JSXAttr(JSXAttr {
                name: JSXAttrName::Ident(Ident { sym, .. }),
                ..
            }) = &attr
            {
                if sym == "global" {
                    return true;
                }
            }
            false
        });

        match &style_info {
            JSXStyle::Local(style_info) => {
                let css = transform_css(
                    self.cm.clone(),
                    style_info,
                    is_global,
                    &self.static_class_name,
                )?;
                Ok(make_local_styled_jsx_el(
                    style_info,
                    css,
                    self.style_import_name.as_ref().unwrap(),
                    self.static_class_name.as_ref(),
                ))
            }
            JSXStyle::External(style) => Ok(make_external_styled_jsx_el(
                style,
                self.style_import_name.as_ref().unwrap(),
            )),
        }
    }

    fn process_tagged_template_expr(
        &mut self,
        tagged_tpl: &TaggedTpl,
        tag: &str,
    ) -> Result<Expr, Error> {
        if tag != "resolve" {
            // Check whether there are undefined references or
            // references to this.something (e.g. props or state).
            // We allow dynamic styles only when resolving styles.
        }

        let style = self.get_jsx_style(
            StyleExpr::Tpl(&tagged_tpl.tpl, &Expr::Tpl(tagged_tpl.tpl.clone())),
            false,
        );
        let styles = vec![style];
        let (static_class_name, class_name) =
            compute_class_names(&styles, self.style_import_name.as_ref().unwrap());
        let tag = match &*tagged_tpl.tag {
            Expr::Ident(Ident { sym, .. }) => sym.to_string(),
            Expr::Member(MemberExpr {
                prop: MemberProp::Ident(Ident { sym, .. }),
                ..
            }) => sym.to_string(),
            _ => String::from("not_styled_jsx_tag"),
        };
        let style = if let JSXStyle::Local(style) = &styles[0] {
            if tag != "resolve" {
                self.external_hash = Some(hash_string(&style.hash.clone()));
            }
            style
        } else {
            bail!("This shouldn't happen, we already know that this is a template literal");
        };
        let css = transform_css(self.cm.clone(), style, tag == "global", &static_class_name)?;
        if tag == "resolve" {
            self.file_has_css_resolve = true;
            return Ok(Expr::Object(ObjectLit {
                props: vec![
                    PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                        key: PropName::Ident(Ident {
                            sym: "styles".into(),
                            span: DUMMY_SP,
                            optional: false,
                        }),
                        value: Box::new(Expr::JSXElement(Box::new(make_local_styled_jsx_el(
                            style,
                            css,
                            self.style_import_name.as_ref().unwrap(),
                            self.static_class_name.as_ref(),
                        )))),
                    }))),
                    PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                        key: PropName::Ident(Ident {
                            sym: "className".into(),
                            span: DUMMY_SP,
                            optional: false,
                        }),
                        value: Box::new(class_name.unwrap()),
                    }))),
                ],
                span: DUMMY_SP,
            }));
        }
        Ok(Expr::New(NewExpr {
            callee: Box::new(Expr::Ident(Ident {
                sym: "String".into(),
                span: DUMMY_SP,
                optional: false,
            })),
            args: Some(vec![ExprOrSpread {
                expr: Box::new(css),
                spread: None,
            }]),
            span: DUMMY_SP,
            type_args: None,
        }))
    }

    fn reset_styles_state(&mut self) {
        self.has_styled_jsx = false;
        self.static_class_name = None;
        self.class_name = None;
        self.styles = vec![];
    }
}

fn is_styled_jsx(el: &JSXElement) -> bool {
    if let JSXElementName::Ident(Ident { sym, .. }) = &el.opening.name {
        if sym != "style" {
            return false;
        }
    }

    el.opening.attrs.iter().any(|attr| {
        if let JSXAttrOrSpread::JSXAttr(JSXAttr {
            name: JSXAttrName::Ident(Ident { sym, .. }),
            ..
        }) = &attr
        {
            if sym == "jsx" {
                return true;
            }
        }
        false
    })
}

fn is_global(el: &JSXElement) -> bool {
    if let JSXElementName::Ident(Ident { sym, .. }) = &el.opening.name {
        if sym != "style" {
            return false;
        }
    }

    el.opening.attrs.iter().any(|attr| {
        if let JSXAttrOrSpread::JSXAttr(JSXAttr {
            name: JSXAttrName::Ident(Ident { sym, .. }),
            ..
        }) = &attr
        {
            if sym == "global" {
                return true;
            }
        }
        false
    })
}

fn get_style_expr(el: &JSXElement) -> Result<StyleExpr, Error> {
    let non_whitespace_children: &Vec<&JSXElementChild> = &el
        .children
        .iter()
        .filter(|child| {
            if let JSXElementChild::JSXText(txt) = child {
                if txt.value.chars().all(char::is_whitespace) {
                    return false;
                }
            }
            true
        })
        .collect();

    if non_whitespace_children.len() != 1 {
        HANDLER.with(|handler| {
            handler
                .struct_span_err(
                    el.span,
                    &format!(
                        "Expected one child under JSX style tag, but got {}.\nRead more: https://nextjs.org/docs/messages/invalid-styled-jsx-children",
                        non_whitespace_children.len()
                    ),
                )
                .emit()
        });
        bail!("styled-jsx style error");
    }

    if let JSXElementChild::JSXExprContainer(JSXExprContainer {
        expr: JSXExpr::Expr(expr),
        ..
    }) = non_whitespace_children[0]
    {
        return Ok(match &**expr {
            Expr::Lit(Lit::Str(str)) => StyleExpr::Str(str),
            Expr::Tpl(tpl) => StyleExpr::Tpl(tpl, &**expr),
            Expr::Ident(ident) => StyleExpr::Ident(ident),
            _ => {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(
                            el.span,
                            "Expected a template literal, string or identifier inside the JSXExpressionContainer.\nRead more: https://nextjs.org/docs/messages/invalid-styled-jsx-children",
                        )
                        .emit()
                });
                bail!("wrong jsx expression container type");
            }
        });
    }

    HANDLER.with(|handler| {
        handler
            .struct_span_err(
                el.span,
                "Expected a single child of type JSXExpressionContainer under JSX Style tag.\nRead more: https://nextjs.org/docs/messages/invalid-styled-jsx-children",
            )
            .emit()
    });
    bail!("next-swc compilation error");
}

fn get_existing_class_name(el: &JSXOpeningElement) -> (Option<Expr>, Option<usize>, Option<usize>) {
    let mut spreads = vec![];
    let mut class_name_expr = None;
    let mut existing_index = None;
    let mut existing_spread_index = None;
    for i in (0..el.attrs.len()).rev() {
        match &el.attrs[i] {
            JSXAttrOrSpread::JSXAttr(JSXAttr {
                name: JSXAttrName::Ident(Ident { sym, .. }),
                value,
                ..
            }) => {
                if sym == "className" {
                    existing_index = Some(i);
                    class_name_expr = match value {
                        Some(JSXAttrValue::Lit(str_lit)) => Some(Expr::Lit(str_lit.clone())),
                        Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                            expr: JSXExpr::Expr(expr),
                            ..
                        })) => Some(*expr.clone()),
                        None => None,
                        _ => None,
                    };
                    break;
                }
            }
            JSXAttrOrSpread::SpreadElement(SpreadElement { expr, .. }) => {
                if let Expr::Object(ObjectLit { props, .. }) = &**expr {
                    let mut has_spread = false;
                    let mut has_class_name = false;
                    for j in 0..props.len() {
                        if let PropOrSpread::Prop(prop) = &props[j] {
                            if let Prop::KeyValue(KeyValueProp {
                                key: PropName::Ident(Ident { sym, .. }),
                                value,
                            }) = &**prop
                            {
                                if sym == "className" {
                                    has_class_name = true;
                                    class_name_expr = Some(*value.clone());
                                    if props.len() == 1 {
                                        existing_spread_index = Some(i);
                                    }
                                }
                            }
                        } else {
                            has_spread = true;
                        }
                    }
                    if has_class_name {
                        break;
                    }
                    if !has_spread {
                        continue;
                    }
                }

                let valid_spread = matches!(&**expr, Expr::Member(_) | Expr::Ident(_));

                if valid_spread {
                    let member_dot_name = Expr::Member(MemberExpr {
                        obj: Box::new(*expr.clone()),
                        prop: MemberProp::Ident(ident("className")),
                        span: DUMMY_SP,
                    });
                    // `${name} && ${name}.className != null && ${name}.className`
                    spreads.push(and(
                        and(
                            *expr.clone(),
                            not_eq(
                                member_dot_name.clone(),
                                Expr::Lit(Lit::Null(Null { span: DUMMY_SP })),
                            ),
                        ),
                        member_dot_name.clone(),
                    ));
                }
            }
            _ => {}
        };
    }

    let spread_expr = match spreads.len() {
        0 => None,
        _ => Some(join_spreads(spreads)),
    };

    let class_name_expr = match class_name_expr {
        Some(e @ Expr::Tpl(_) | e @ Expr::Lit(Lit::Str(_))) => Some(e),
        None => None,
        _ => Some(or(class_name_expr.unwrap(), string_literal_expr(""))),
    };

    let existing_class_name_expr = match (spread_expr, class_name_expr) {
        (Some(spread_expr), Some(class_name_expr)) => Some(or(spread_expr, class_name_expr)),
        (Some(spread_expr), None) => Some(or(spread_expr, string_literal_expr(""))),
        (None, Some(class_name_expr)) => Some(class_name_expr),
        _ => None,
    };

    (
        existing_class_name_expr,
        existing_index,
        existing_spread_index,
    )
}

fn join_spreads(spreads: Vec<Expr>) -> Expr {
    let mut new_expr = spreads[0].clone();
    for i in spreads.iter().skip(1) {
        new_expr = Expr::Bin(BinExpr {
            op: op!("||"),
            left: Box::new(new_expr.clone()),
            right: Box::new(i.clone()),
            span: DUMMY_SP,
        })
    }
    new_expr
}

fn add_hash_statement((id, hash): (Id, String)) -> Stmt {
    Stmt::Expr(ExprStmt {
        expr: Box::new(Expr::Assign(AssignExpr {
            left: PatOrExpr::Expr(Box::new(Expr::Member(MemberExpr {
                obj: Box::new(Expr::Ident(Ident {
                    sym: id.0,
                    span: DUMMY_SP.with_ctxt(id.1),
                    optional: false,
                })),
                prop: MemberProp::Ident(Ident {
                    sym: "__hash".into(),
                    span: DUMMY_SP,
                    optional: false,
                }),
                span: DUMMY_SP,
            }))),
            right: Box::new(string_literal_expr(&hash)),
            op: op!("="),
            span: DUMMY_SP,
        })),
        span: DUMMY_SP,
    })
}

fn is_styled_css_import(item: &ModuleItem) -> bool {
    if let ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
        src: Str { value, .. },
        ..
    })) = item
    {
        if value == "styled-jsx/css" {
            return true;
        }
    }
    false
}
