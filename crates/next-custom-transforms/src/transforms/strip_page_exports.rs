//! The original transform is available on the [Next.js repository](https://github.com/vercel/next.js/blob/f7fecf00cb40c2f784387ff8ccc5e213b8bdd9ca/packages/next-swc/crates/core/src/next_ssg.rs):
//!
//! This version adds support for eliminating client-side exports only.
//! **TODO** may consolidate into next_ssg

use std::{cell::RefCell, mem::take, rc::Rc};

use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::{
    atoms::Atom,
    common::{
        errors::HANDLER,
        pass::{Repeat, Repeated},
        DUMMY_SP,
    },
    ecma::{
        ast::*,
        visit::{fold_pass, noop_fold_type, noop_visit_type, Fold, FoldWith, Visit, VisitWith},
    },
};

/// Determines which exports to remove.
#[derive(Debug, Default, Clone, Copy)]
pub enum ExportFilter {
    /// Strip all data exports (getServerSideProps,
    /// getStaticProps, getStaticPaths exports.) and their unique dependencies.
    #[default]
    StripDataExports,
    /// Strip default export and all its unique dependencies.
    StripDefaultExport,
}

#[derive(Debug, Default, Clone, Copy)]
pub enum PageMode {
    #[default]
    None,
    /// The Next.js page is declaring `getServerSideProps`.
    Ssr,
    /// The Next.js page is declaring `getStaticProps` and/or `getStaticPaths`.
    Ssg,
}

impl PageMode {
    /// Which identifier (if any) to export in the output file.
    fn data_marker(self) -> Option<&'static str> {
        match self {
            PageMode::None => None,
            PageMode::Ssr => Some("__N_SSP"),
            PageMode::Ssg => Some("__N_SSG"),
        }
    }
}

/// A transform that either:
/// * strips Next.js data exports (getServerSideProps, getStaticProps, getStaticPaths); or
/// * strips the default export.
///
/// Note: This transform requires running `resolver` **before** running it.
pub fn next_transform_strip_page_exports(
    filter: ExportFilter,
    ssr_removed_packages: Rc<RefCell<FxHashSet<Atom>>>,
) -> impl Pass {
    fold_pass(Repeat::new(NextSsg {
        state: State {
            ssr_removed_packages,
            filter,
            ..Default::default()
        },
        in_lhs_of_var: false,
        remove_expression: false,
    }))
}

/// State of the transforms. Shared by the analyzer and the transform.
#[derive(Debug, Default)]
struct State {
    filter: ExportFilter,

    page_mode: PageMode,

    exports: FxHashMap<Id, ExportType>,

    /// Identifiers referenced in the body of preserved functions.
    ///
    /// Cleared before running each pass, because we drop ast nodes between the
    /// passes.
    refs_from_preserved: FxHashSet<Id>,

    /// Identifiers referenced in the body of removed functions or
    /// derivatives.
    ///
    /// Preserved between runs, because we should remember derivatives of data
    /// functions as the data function itself is already removed.
    refs_from_removed: FxHashSet<Id>,

    /// Identifiers of functions currently being declared, the body of which we
    /// are currently visiting.
    cur_declaring: FxHashSet<Id>,

    /// `true` if the transform has added a page mode marker to the AST.
    added_data_marker: bool,

    should_run_again: bool,

    /// Track the import packages which are removed alongside
    /// `getServerSideProps` in SSR.
    ssr_removed_packages: Rc<RefCell<FxHashSet<Atom>>>,
}

/// The type of export associated to an identifier.
#[derive(Debug, Clone, Copy)]
enum ExportType {
    Default,
    GetServerSideProps,
    GetStaticPaths,
    GetStaticProps,
}

impl ExportType {
    fn from_specifier(specifier: &ExportSpecifier) -> Option<ExportTypeResult<'_>> {
        match specifier {
            ExportSpecifier::Default(ExportDefaultSpecifier { exported, .. })
            | ExportSpecifier::Namespace(ExportNamespaceSpecifier {
                name: ModuleExportName::Ident(exported),
                ..
            }) => {
                let export_type = ExportType::from_ident(exported)?;
                Some(ExportTypeResult {
                    exported_ident: exported,
                    local_ident: None,
                    export_type,
                })
            }

            ExportSpecifier::Named(ExportNamedSpecifier {
                exported: Some(ModuleExportName::Ident(exported)),
                orig: ModuleExportName::Ident(orig),
                ..
            })
            | ExportSpecifier::Named(ExportNamedSpecifier {
                orig: ModuleExportName::Ident(orig @ exported),
                ..
            }) => {
                let export_type = ExportType::from_ident(exported)?;
                Some(ExportTypeResult {
                    exported_ident: exported,
                    local_ident: Some(orig),
                    export_type,
                })
            }
            _ => None,
        }
    }

    fn from_ident(ident: &Ident) -> Option<Self> {
        Some(match &*ident.sym {
            "default" => ExportType::Default,
            "getStaticProps" => ExportType::GetStaticProps,
            "getStaticPaths" => ExportType::GetStaticPaths,
            "getServerSideProps" => ExportType::GetServerSideProps,
            _ => return None,
        })
    }
}

struct ExportTypeResult<'a> {
    exported_ident: &'a Ident,
    local_ident: Option<&'a Ident>,
    export_type: ExportType,
}

impl State {
    fn encounter_export(
        &mut self,
        exported_ident: &Ident,
        local_ident: Option<&Ident>,
        export_type: ExportType,
    ) {
        match export_type {
            ExportType::GetServerSideProps => {
                if matches!(self.page_mode, PageMode::Ssg) {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                exported_ident.span,
                                "You can not use getStaticProps or getStaticPaths with \
                                 getServerSideProps. To use SSG, please remove getServerSideProps",
                            )
                            .emit()
                    });
                    return;
                }

                self.page_mode = PageMode::Ssr;
            }
            ExportType::GetStaticPaths | ExportType::GetStaticProps => {
                if matches!(self.page_mode, PageMode::Ssr) {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                exported_ident.span,
                                "You can not use getStaticProps or getStaticPaths with \
                                 getServerSideProps. To use SSG, please remove getServerSideProps",
                            )
                            .emit()
                    });
                    return;
                }

                self.page_mode = PageMode::Ssg;
            }
            _ => {}
        }

        let local_ident = local_ident.unwrap_or(exported_ident);

        self.exports.insert(local_ident.to_id(), export_type);
    }

    fn export_type(&self, id: &Id) -> Option<ExportType> {
        self.exports.get(id).copied()
    }

    fn should_retain_export_type(&self, export_type: ExportType) -> bool {
        !matches!(
            (self.filter, export_type),
            (
                ExportFilter::StripDataExports,
                ExportType::GetServerSideProps
                    | ExportType::GetStaticProps
                    | ExportType::GetStaticPaths,
            ) | (ExportFilter::StripDefaultExport, ExportType::Default)
        )
    }

    fn should_retain_id(&self, id: &Id) -> bool {
        if let Some(export_type) = self.export_type(id) {
            self.should_retain_export_type(export_type)
        } else {
            true
        }
    }

    fn dropping_export(&mut self, export_type: ExportType) -> bool {
        if !self.should_retain_export_type(export_type) {
            // If there are any assignments on the exported identifier, they'll
            // need to be removed as well in the next pass.
            self.should_run_again = true;
            true
        } else {
            false
        }
    }
}

struct Analyzer<'a> {
    state: &'a mut State,
    in_lhs_of_var: bool,
    in_removed_item: bool,
}

impl Analyzer<'_> {
    fn add_ref(&mut self, id: Id) {
        tracing::trace!(
            "add_ref({}{:?}, in_removed_item = {:?})",
            id.0,
            id.1,
            self.in_removed_item,
        );
        if self.in_removed_item {
            self.state.refs_from_removed.insert(id);
        } else {
            if self.state.cur_declaring.contains(&id) {
                return;
            }

            self.state.refs_from_preserved.insert(id);
        }
    }

    fn within_declaration<R>(&mut self, id: &Id, f: impl FnOnce(&mut Self) -> R) -> R {
        self.state.cur_declaring.insert(id.clone());
        let res = f(self);
        self.state.cur_declaring.remove(id);
        res
    }

    fn within_removed_item<R>(
        &mut self,
        in_removed_item: bool,
        f: impl FnOnce(&mut Self) -> R,
    ) -> R {
        let old = self.in_removed_item;
        // `in_removed_item` is strictly additive.
        self.in_removed_item |= in_removed_item;
        let res = f(self);
        self.in_removed_item = old;
        res
    }

    fn within_lhs_of_var<R>(&mut self, in_lhs_of_var: bool, f: impl FnOnce(&mut Self) -> R) -> R {
        let old = self.in_lhs_of_var;
        self.in_lhs_of_var = in_lhs_of_var;
        let res = f(self);
        self.in_lhs_of_var = old;
        res
    }

    fn visit_declaration<D>(&mut self, id: &Id, d: &D)
    where
        D: VisitWith<Self>,
    {
        self.within_declaration(id, |this| {
            let in_removed_item = !this.state.should_retain_id(id);
            this.within_removed_item(in_removed_item, |this| {
                tracing::trace!(
                    "transform_page: Handling `{}{:?}`; in_removed_item = {:?}",
                    id.0,
                    id.1,
                    this.in_removed_item
                );

                d.visit_children_with(this);
            });
        });
    }
}

impl Visit for Analyzer<'_> {
    // This is important for reducing binary sizes.
    noop_visit_type!();

    fn visit_binding_ident(&mut self, i: &BindingIdent) {
        if !self.in_lhs_of_var || self.in_removed_item {
            self.add_ref(i.id.to_id());
        }
    }

    fn visit_named_export(&mut self, n: &NamedExport) {
        for specifier in &n.specifiers {
            if let Some(ExportTypeResult {
                exported_ident,
                local_ident,
                export_type,
            }) = ExportType::from_specifier(specifier)
            {
                self.state
                    .encounter_export(exported_ident, local_ident, export_type);

                if let Some(local_ident) = local_ident {
                    if self.state.should_retain_export_type(export_type) {
                        self.add_ref(local_ident.to_id());
                    }
                }
            }
        }
    }

    fn visit_export_decl(&mut self, s: &ExportDecl) {
        match &s.decl {
            Decl::Var(d) => {
                for decl in &d.decls {
                    if let Pat::Ident(ident) = &decl.name {
                        if let Some(export_type) = ExportType::from_ident(ident) {
                            self.state.encounter_export(ident, None, export_type);

                            let retain = self.state.should_retain_export_type(export_type);

                            if retain {
                                self.add_ref(ident.to_id());
                            }

                            self.within_removed_item(!retain, |this| {
                                decl.visit_with(this);
                            });
                        } else {
                            // Always preserve declarations of unknown exports.
                            self.add_ref(ident.to_id());

                            decl.visit_with(self)
                        }
                    } else {
                        decl.visit_with(self)
                    }
                }
            }
            Decl::Fn(decl) => {
                let ident = &decl.ident;
                if let Some(export_type) = ExportType::from_ident(ident) {
                    self.state.encounter_export(ident, None, export_type);

                    let retain = self.state.should_retain_export_type(export_type);

                    if retain {
                        self.add_ref(ident.to_id());
                    }

                    self.within_removed_item(!retain, |this| {
                        decl.visit_with(this);
                    });
                } else {
                    s.visit_children_with(self);
                }
            }
            _ => s.visit_children_with(self),
        }
    }

    fn visit_export_default_decl(&mut self, s: &ExportDefaultDecl) {
        match &s.decl {
            DefaultDecl::Class(ClassExpr {
                ident: Some(ident), ..
            }) => self
                .state
                .encounter_export(ident, Some(ident), ExportType::Default),
            DefaultDecl::Fn(FnExpr {
                ident: Some(ident), ..
            }) => self
                .state
                .encounter_export(ident, Some(ident), ExportType::Default),
            _ => {}
        }
        self.within_removed_item(
            matches!(self.state.filter, ExportFilter::StripDefaultExport),
            |this| {
                s.visit_children_with(this);
            },
        );
    }

    fn visit_export_default_expr(&mut self, s: &ExportDefaultExpr) {
        self.within_removed_item(
            matches!(self.state.filter, ExportFilter::StripDefaultExport),
            |this| {
                s.visit_children_with(this);
            },
        );
    }

    fn visit_expr(&mut self, e: &Expr) {
        e.visit_children_with(self);

        if let Expr::Ident(i) = &e {
            self.add_ref(i.to_id());
        }
    }

    fn visit_jsx_element(&mut self, jsx: &JSXElement) {
        fn get_leftmost_id_member_expr(e: &JSXMemberExpr) -> Id {
            match &e.obj {
                JSXObject::Ident(i) => i.to_id(),
                JSXObject::JSXMemberExpr(e) => get_leftmost_id_member_expr(e),
            }
        }

        match &jsx.opening.name {
            JSXElementName::Ident(i) => {
                self.add_ref(i.to_id());
            }
            JSXElementName::JSXMemberExpr(e) => {
                self.add_ref(get_leftmost_id_member_expr(e));
            }
            _ => {}
        }

        jsx.visit_children_with(self);
    }

    fn visit_fn_decl(&mut self, f: &FnDecl) {
        self.visit_declaration(&f.ident.to_id(), f);
    }

    fn visit_class_decl(&mut self, c: &ClassDecl) {
        self.visit_declaration(&c.ident.to_id(), c);
    }

    fn visit_fn_expr(&mut self, f: &FnExpr) {
        f.visit_children_with(self);

        if let Some(id) = &f.ident {
            self.add_ref(id.to_id());
        }
    }

    fn visit_prop(&mut self, p: &Prop) {
        p.visit_children_with(self);

        if let Prop::Shorthand(i) = &p {
            self.add_ref(i.to_id());
        }
    }

    fn visit_var_declarator(&mut self, v: &VarDeclarator) {
        let in_removed_item = if let Pat::Ident(name) = &v.name {
            !self.state.should_retain_id(&name.id.to_id())
        } else {
            false
        };

        self.within_removed_item(in_removed_item, |this| {
            this.within_lhs_of_var(true, |this| {
                v.name.visit_with(this);
            });

            this.within_lhs_of_var(false, |this| {
                v.init.visit_with(this);
            });
        });
    }

    fn visit_member_expr(&mut self, e: &MemberExpr) {
        let in_removed_item = if let Some(id) = find_member_root_id(e) {
            !self.state.should_retain_id(&id)
        } else {
            false
        };

        self.within_removed_item(in_removed_item, |this| {
            e.visit_children_with(this);
        });
    }

    fn visit_assign_expr(&mut self, e: &AssignExpr) {
        self.within_lhs_of_var(true, |this| {
            e.left.visit_with(this);
        });

        self.within_lhs_of_var(false, |this| {
            e.right.visit_with(this);
        });
    }
}

/// Actual implementation of the transform.
struct NextSsg {
    pub state: State,
    in_lhs_of_var: bool,
    /// Marker set when a top-level expression item should be removed. This
    /// occurs when visiting assignments on eliminated identifiers.
    remove_expression: bool,
}

impl NextSsg {
    /// Returns `true` when an identifier should be removed from the output.
    fn should_remove(&self, id: &Id) -> bool {
        self.state.refs_from_removed.contains(id) && !self.state.refs_from_preserved.contains(id)
    }

    /// Mark identifiers in `n` as a candidate for elimination.
    fn mark_as_candidate<N>(&mut self, n: &N)
    where
        N: for<'aa> VisitWith<Analyzer<'aa>> + std::fmt::Debug,
    {
        tracing::debug!("mark_as_candidate: {:?}", n);

        let mut v = Analyzer {
            state: &mut self.state,
            in_lhs_of_var: false,
            // Analyzer never change `in_removed_item`, so all identifiers in `n`
            // will be marked as referenced from an removed item.
            in_removed_item: true,
        };

        n.visit_with(&mut v);
        self.state.should_run_again = true;
    }

    /// Adds __N_SSG and __N_SSP declarations when eliminating data functions.
    fn maybe_add_data_marker(&mut self, items: &mut Vec<ModuleItem>) {
        if !matches!(self.state.filter, ExportFilter::StripDataExports)
            || self.state.added_data_marker
            || self.state.should_run_again
        {
            return;
        }

        let Some(data_marker) = self.state.page_mode.data_marker() else {
            return;
        };

        self.state.added_data_marker = true;

        if items.iter().any(|s| s.is_module_decl()) {
            let insert_idx = items.iter().position(|item| {
                matches!(
                    item,
                    ModuleItem::ModuleDecl(
                        ModuleDecl::ExportNamed(..)
                            | ModuleDecl::ExportDecl(..)
                            | ModuleDecl::ExportDefaultDecl(..)
                            | ModuleDecl::ExportDefaultExpr(..),
                    )
                )
            });

            if let Some(insert_idx) = insert_idx {
                items.insert(
                    insert_idx,
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                        span: DUMMY_SP,
                        decl: Decl::Var(Box::new(VarDecl {
                            span: DUMMY_SP,
                            kind: VarDeclKind::Var,
                            decls: vec![VarDeclarator {
                                span: DUMMY_SP,
                                name: Pat::Ident(
                                    IdentName::new(data_marker.into(), DUMMY_SP).into(),
                                ),
                                init: Some(true.into()),
                                definite: Default::default(),
                            }],
                            ..Default::default()
                        })),
                    })),
                );
            }
        }
    }

    fn within_lhs_of_var<R>(&mut self, in_lhs_of_var: bool, f: impl FnOnce(&mut Self) -> R) -> R {
        let old = self.in_lhs_of_var;
        self.in_lhs_of_var = in_lhs_of_var;
        let res = f(self);
        self.in_lhs_of_var = old;
        res
    }
}

impl Repeated for NextSsg {
    fn changed(&self) -> bool {
        self.state.should_run_again
    }

    fn reset(&mut self) {
        self.state.refs_from_preserved.clear();
        self.state.cur_declaring.clear();
        self.state.should_run_again = false;
    }
}

/// `VisitMut` is faster than [Fold], but we use [Fold] because it's much easier
/// to read.
///
/// Note: We don't implement `fold_script` because next.js doesn't use it.
impl Fold for NextSsg {
    fn fold_array_pat(&mut self, mut arr: ArrayPat) -> ArrayPat {
        arr = arr.fold_children_with(self);

        if !arr.elems.is_empty() {
            arr.elems.retain(|e| !matches!(e, Some(Pat::Invalid(..))));
        }

        arr
    }

    fn fold_assign_target_pat(&mut self, mut n: AssignTargetPat) -> AssignTargetPat {
        n = n.fold_children_with(self);

        match &n {
            AssignTargetPat::Array(arr) => {
                if arr.elems.is_empty() {
                    return AssignTargetPat::Invalid(Invalid { span: DUMMY_SP });
                }
            }
            AssignTargetPat::Object(obj) => {
                if obj.props.is_empty() {
                    return AssignTargetPat::Invalid(Invalid { span: DUMMY_SP });
                }
            }
            _ => {}
        }

        n
    }

    fn fold_expr(&mut self, e: Expr) -> Expr {
        match e {
            Expr::Assign(assign_expr) => {
                let mut retain = true;
                let left =
                    self.within_lhs_of_var(true, |this| assign_expr.left.clone().fold_with(this));

                let right = self.within_lhs_of_var(false, |this| {
                    match left {
                        AssignTarget::Simple(SimpleAssignTarget::Invalid(..))
                        | AssignTarget::Pat(AssignTargetPat::Invalid(..)) => {
                            retain = false;
                            this.mark_as_candidate(&assign_expr.right);
                        }

                        _ => {}
                    }
                    assign_expr.right.clone().fold_with(this)
                });

                if retain {
                    self.remove_expression = false;
                    Expr::Assign(AssignExpr {
                        left,
                        right,
                        ..assign_expr
                    })
                } else {
                    self.remove_expression = true;
                    *right
                }
            }
            _ => {
                self.remove_expression = false;
                e.fold_children_with(self)
            }
        }
    }

    fn fold_import_decl(&mut self, mut i: ImportDecl) -> ImportDecl {
        // Imports for side effects.
        if i.specifiers.is_empty() {
            return i;
        }

        let import_src = &i.src.value;

        i.specifiers.retain(|s| match s {
            ImportSpecifier::Named(ImportNamedSpecifier { local, .. })
            | ImportSpecifier::Default(ImportDefaultSpecifier { local, .. })
            | ImportSpecifier::Namespace(ImportStarAsSpecifier { local, .. }) => {
                if self.should_remove(&local.to_id()) {
                    if matches!(self.state.page_mode, PageMode::Ssr)
                        && matches!(self.state.filter, ExportFilter::StripDataExports)
                        // filter out non-packages import
                        // third part packages must start with `a-z` or `@`
                        && import_src.starts_with(|c: char| c.is_ascii_lowercase() || c == '@')
                    {
                        self.state
                            .ssr_removed_packages
                            .borrow_mut()
                            .insert(import_src.clone());
                    }
                    tracing::trace!(
                        "Dropping import `{}{:?}` because it should be removed",
                        local.sym,
                        local.ctxt
                    );

                    self.state.should_run_again = true;
                    false
                } else {
                    true
                }
            }
        });

        i
    }

    fn fold_module(&mut self, m: Module) -> Module {
        tracing::info!("ssg: Start");
        {
            // Fill the state.
            let mut v = Analyzer {
                state: &mut self.state,
                in_lhs_of_var: false,
                in_removed_item: false,
            };
            m.visit_with(&mut v);
        }

        // TODO: Use better detection logic
        // if let PageMode::None = self.state.page_mode {
        //     return m;
        // }

        m.fold_children_with(self)
    }

    fn fold_module_item(&mut self, i: ModuleItem) -> ModuleItem {
        if let ModuleItem::ModuleDecl(ModuleDecl::Import(i)) = i {
            let is_for_side_effect = i.specifiers.is_empty();
            let i = i.fold_with(self);

            if !is_for_side_effect && i.specifiers.is_empty() {
                return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
            }

            return ModuleItem::ModuleDecl(ModuleDecl::Import(i));
        }

        let i = i.fold_children_with(self);

        match &i {
            ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(e)) if e.specifiers.is_empty() => {
                return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }))
            }
            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(e)) => match &e.decl {
                Decl::Fn(f) => {
                    if let Some(export_type) = self.state.export_type(&f.ident.to_id()) {
                        if self.state.dropping_export(export_type) {
                            tracing::trace!(
                                "Dropping an export specifier because it's an SSR/SSG function"
                            );
                            return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                        }
                    }
                }

                Decl::Var(d) => {
                    if d.decls.is_empty() {
                        return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                    }
                }
                _ => {}
            },

            ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultDecl(_))
            | ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultExpr(_)) => {
                if self.state.dropping_export(ExportType::Default) {
                    tracing::trace!("Dropping an export specifier because it's a default export");

                    return ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                }
            }
            _ => {}
        }

        i
    }

    fn fold_module_items(&mut self, mut items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        items = items.fold_children_with(self);

        // Drop empty nodes.
        items.retain(|s| !matches!(s, ModuleItem::Stmt(Stmt::Empty(..))));

        self.maybe_add_data_marker(&mut items);

        items
    }

    fn fold_named_export(&mut self, mut n: NamedExport) -> NamedExport {
        n.specifiers = n.specifiers.fold_with(self);

        n.specifiers.retain(|s| {
            let (export_type, local_ref) = match s {
                ExportSpecifier::Default(ExportDefaultSpecifier { exported, .. })
                | ExportSpecifier::Namespace(ExportNamespaceSpecifier {
                    name: ModuleExportName::Ident(exported),
                    ..
                }) => (ExportType::from_ident(exported), None),
                ExportSpecifier::Named(ExportNamedSpecifier {
                    exported: Some(ModuleExportName::Ident(exported)),
                    orig: ModuleExportName::Ident(orig),
                    ..
                })
                | ExportSpecifier::Named(ExportNamedSpecifier {
                    orig: ModuleExportName::Ident(orig @ exported),
                    ..
                }) => (ExportType::from_ident(exported), Some(orig)),
                _ => (None, None),
            };

            let Some(export_type) = export_type else {
                return true;
            };

            let retain = self.state.should_retain_export_type(export_type);

            if !retain {
                // If the export specifier is not retained, but it refers to a local ident,
                // we need to run again to possibly remove the local ident.
                if let Some(local_ref) = local_ref {
                    self.state.should_run_again = true;
                    self.state.refs_from_removed.insert(local_ref.to_id());
                }
            }

            self.state.should_retain_export_type(export_type)
        });

        n
    }

    fn fold_object_pat(&mut self, mut obj: ObjectPat) -> ObjectPat {
        obj = obj.fold_children_with(self);

        if !obj.props.is_empty() {
            obj.props = take(&mut obj.props)
                .into_iter()
                .filter_map(|prop| match prop {
                    ObjectPatProp::KeyValue(prop) => {
                        if prop.value.is_invalid() {
                            None
                        } else {
                            Some(ObjectPatProp::KeyValue(prop))
                        }
                    }
                    ObjectPatProp::Assign(prop) => {
                        if self.should_remove(&prop.key.to_id()) {
                            self.mark_as_candidate(&prop.value);

                            None
                        } else {
                            Some(ObjectPatProp::Assign(prop))
                        }
                    }
                    ObjectPatProp::Rest(prop) => {
                        if prop.arg.is_invalid() {
                            None
                        } else {
                            Some(ObjectPatProp::Rest(prop))
                        }
                    }
                })
                .collect();
        }

        obj
    }

    /// This methods returns [Pat::Invalid] if the pattern should be removed.
    fn fold_pat(&mut self, mut p: Pat) -> Pat {
        p = p.fold_children_with(self);

        if self.in_lhs_of_var {
            match &mut p {
                Pat::Ident(name) => {
                    if self.should_remove(&name.id.to_id()) {
                        self.state.should_run_again = true;
                        tracing::trace!(
                            "Dropping var `{}{:?}` because it should be removed",
                            name.id.sym,
                            name.id.ctxt
                        );

                        return Pat::Invalid(Invalid { span: DUMMY_SP });
                    }
                }
                Pat::Array(arr) => {
                    if arr.elems.is_empty() {
                        return Pat::Invalid(Invalid { span: DUMMY_SP });
                    }
                }
                Pat::Object(obj) => {
                    if obj.props.is_empty() {
                        return Pat::Invalid(Invalid { span: DUMMY_SP });
                    }
                }
                Pat::Rest(rest) => {
                    if rest.arg.is_invalid() {
                        return Pat::Invalid(Invalid { span: DUMMY_SP });
                    }
                }
                Pat::Expr(expr) => {
                    if let Expr::Member(member_expr) = &**expr {
                        if let Some(id) = find_member_root_id(member_expr) {
                            if self.should_remove(&id) {
                                self.state.should_run_again = true;
                                tracing::trace!(
                                    "Dropping member expression object `{}{:?}` because it should \
                                     be removed",
                                    id.0,
                                    id.1
                                );

                                return Pat::Invalid(Invalid { span: DUMMY_SP });
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        p
    }

    fn fold_simple_assign_target(&mut self, mut n: SimpleAssignTarget) -> SimpleAssignTarget {
        n = n.fold_children_with(self);

        if let SimpleAssignTarget::Ident(name) = &n {
            if self.should_remove(&name.id.to_id()) {
                self.state.should_run_again = true;
                tracing::trace!(
                    "Dropping var `{}{:?}` because it should be removed",
                    name.id.sym,
                    name.id.ctxt
                );

                return SimpleAssignTarget::Invalid(Invalid { span: DUMMY_SP });
            }
        }

        if let SimpleAssignTarget::Member(member_expr) = &n {
            if let Some(id) = find_member_root_id(member_expr) {
                if self.should_remove(&id) {
                    self.state.should_run_again = true;
                    tracing::trace!(
                        "Dropping member expression object `{}{:?}` because it should be removed",
                        id.0,
                        id.1
                    );

                    return SimpleAssignTarget::Invalid(Invalid { span: DUMMY_SP });
                }
            }
        }

        n
    }

    #[allow(clippy::single_match)]
    fn fold_stmt(&mut self, mut s: Stmt) -> Stmt {
        match s {
            Stmt::Decl(Decl::Fn(f)) => {
                if self.should_remove(&f.ident.to_id()) {
                    self.mark_as_candidate(&f.function);
                    return Stmt::Empty(EmptyStmt { span: DUMMY_SP });
                }

                s = Stmt::Decl(Decl::Fn(f));
            }
            Stmt::Decl(Decl::Class(c)) => {
                if self.should_remove(&c.ident.to_id()) {
                    self.mark_as_candidate(&c.class);
                    return Stmt::Empty(EmptyStmt { span: DUMMY_SP });
                }

                s = Stmt::Decl(Decl::Class(c));
            }
            _ => {}
        }

        self.remove_expression = false;

        let s = s.fold_children_with(self);

        match s {
            Stmt::Decl(Decl::Var(v)) if v.decls.is_empty() => {
                return Stmt::Empty(EmptyStmt { span: DUMMY_SP });
            }
            Stmt::Expr(_) => {
                if self.remove_expression {
                    self.remove_expression = false;
                    return Stmt::Empty(EmptyStmt { span: DUMMY_SP });
                }
            }
            _ => {}
        }

        s
    }

    /// This method make `name` of [VarDeclarator] to [Pat::Invalid] if it
    /// should be removed.
    fn fold_var_declarator(&mut self, d: VarDeclarator) -> VarDeclarator {
        let name = self.within_lhs_of_var(true, |this| d.name.clone().fold_with(this));

        let init = self.within_lhs_of_var(false, |this| {
            if name.is_invalid() {
                this.mark_as_candidate(&d.init);
            }
            d.init.clone().fold_with(this)
        });

        VarDeclarator { name, init, ..d }
    }

    fn fold_var_declarators(&mut self, mut decls: Vec<VarDeclarator>) -> Vec<VarDeclarator> {
        decls = decls.fold_children_with(self);
        decls.retain(|d| !d.name.is_invalid());

        decls
    }

    // This is important for reducing binary sizes.
    noop_fold_type!();
}

/// Returns the root identifier of a member expression.
///
/// e.g. `a.b.c` => `a`
fn find_member_root_id(member_expr: &MemberExpr) -> Option<Id> {
    match &*member_expr.obj {
        Expr::Member(member) => find_member_root_id(member),
        Expr::Ident(ident) => Some(ident.to_id()),
        _ => None,
    }
}
