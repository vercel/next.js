use std::hash::Hash;
use swc_common::{collections::AHashSet, SyntaxContext, DUMMY_SP};
use swc_ecmascript::{
    ast::{
        ClassDecl, FnDecl, Ident, ImportDefaultSpecifier, ImportNamedSpecifier,
        ImportStarAsSpecifier, Invalid, ModuleItem, ObjectPatProp, Param, Pat, Stmt, VarDeclarator,
    },
    utils::ident::IdentLike,
    visit::{noop_visit_type, Node, Visit, VisitWith},
};

// Modified from swc_ecma_utils/src/lib.rs:BindingCollector.
pub struct TopLevelBindingCollector<I>
where
    I: IdentLike + Eq + Hash + Send + Sync,
{
    only: Option<SyntaxContext>,
    bindings: AHashSet<I>,
    is_pat_decl: bool,
}

impl<I> TopLevelBindingCollector<I>
where
    I: IdentLike + Eq + Hash + Send + Sync,
{
    fn add(&mut self, i: &Ident) {
        if let Some(only) = self.only {
            if only != i.span.ctxt {
                return;
            }
        }

        self.bindings.insert(I::from_ident(i));
    }
}

impl<I> Visit for TopLevelBindingCollector<I>
where
    I: IdentLike + Eq + Hash + Send + Sync,
{
    noop_visit_type!();

    fn visit_class_decl(&mut self, node: &ClassDecl, _: &dyn Node) {
        self.add(&node.ident);
    }

    fn visit_fn_decl(&mut self, node: &FnDecl, _: &dyn Node) {
        self.add(&node.ident);
    }

    fn visit_pat(&mut self, node: &Pat, _: &dyn Node) {
        if self.is_pat_decl {
            match node {
                Pat::Ident(i) => self.add(&i.id),
                Pat::Object(o) => {
                    for prop in o.props.iter() {
                        match prop {
                            ObjectPatProp::Assign(a) => self.add(&a.key),
                            ObjectPatProp::KeyValue(k) => k.value.visit_with(k, self),
                            ObjectPatProp::Rest(_) => {}
                        }
                    }
                }
                Pat::Array(a) => {
                    for elem in a.elems.iter() {
                        elem.visit_with(a, self);
                    }
                }
                _ => {}
            }
        }
    }

    fn visit_param(&mut self, node: &Param, _: &dyn Node) {
        let old = self.is_pat_decl;
        self.is_pat_decl = true;
        node.visit_children_with(self);
        self.is_pat_decl = old;
    }

    fn visit_import_default_specifier(&mut self, node: &ImportDefaultSpecifier, _: &dyn Node) {
        self.add(&node.local);
    }

    fn visit_import_named_specifier(&mut self, node: &ImportNamedSpecifier, _: &dyn Node) {
        self.add(&node.local);
    }

    fn visit_import_star_as_specifier(&mut self, node: &ImportStarAsSpecifier, _: &dyn Node) {
        self.add(&node.local);
    }

    fn visit_module_items(&mut self, nodes: &[ModuleItem], _: &dyn Node) {
        for node in nodes {
            node.visit_children_with(self)
        }
    }

    fn visit_stmts(&mut self, nodes: &[Stmt], _: &dyn Node) {
        for node in nodes {
            node.visit_children_with(self)
        }
    }

    fn visit_var_declarator(&mut self, node: &VarDeclarator, _: &dyn Node) {
        let old = self.is_pat_decl;
        self.is_pat_decl = true;
        node.name.visit_with(node, self);

        self.is_pat_decl = false;
        node.init.visit_with(node, self);
        self.is_pat_decl = old;
    }
}

pub fn collect_top_level_decls<I, N>(n: &N) -> AHashSet<I>
where
    I: IdentLike + Eq + Hash + Send + Sync,
    N: VisitWith<TopLevelBindingCollector<I>>,
{
    let mut v = TopLevelBindingCollector {
        only: None,
        bindings: Default::default(),
        is_pat_decl: false,
    };
    n.visit_with(&Invalid { span: DUMMY_SP }, &mut v);
    v.bindings
}
