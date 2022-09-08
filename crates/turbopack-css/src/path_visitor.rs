use std::{borrow::Cow, collections::HashMap};

use swc_core::{
    common::pass::AstKindPath,
    css::{
        ast::*,
        visit::{AstParentKind, VisitMut, VisitMutAstPath, VisitMutWith, VisitMutWithPath},
    },
};

use crate::code_gen::VisitorFactory;

pub type AstPath = Vec<AstParentKind>;

pub struct ApplyVisitors<'a> {
    /// `VisitMut` should be shallow. In other words, it should not visit
    /// children of the node.
    visitors: HashMap<AstParentKind, Vec<(&'a AstPath, &'a dyn VisitorFactory)>>,

    index: usize,
}

impl<'a> ApplyVisitors<'a> {
    pub fn new(visitors: Vec<(&'a AstPath, &'a dyn VisitorFactory)>) -> Self {
        let mut map = HashMap::<AstParentKind, Vec<(&'a AstPath, &'a dyn VisitorFactory)>>::new();
        for (path, visitor) in visitors {
            if let Some(span) = path.first() {
                map.entry(*span).or_default().push((path, visitor));
            }
        }
        Self {
            visitors: map,
            index: 0,
        }
    }

    fn visit_if_required<N>(&mut self, n: &mut N, ast_path: &mut AstKindPath<AstParentKind>)
    where
        N: for<'aa> VisitMutWith<dyn VisitMut + Send + Sync + 'aa>
            + for<'aa> VisitMutWithPath<ApplyVisitors<'aa>>,
    {
        let mut index = self.index;
        let mut current_visitors_map = Cow::Borrowed(&self.visitors);
        while index < ast_path.len() {
            let current = index == ast_path.len() - 1;
            let kind = ast_path[index];
            if let Some(visitors) = current_visitors_map.get(&kind) {
                let mut visitors_map = HashMap::<_, Vec<_>>::with_capacity(visitors.len());

                index += 1;

                let mut active_visitors = Vec::new();
                for (path, visitor) in visitors.iter() {
                    if index == path.len() {
                        if current {
                            active_visitors.push(*visitor);
                        }
                    } else {
                        debug_assert!(index < path.len());

                        let span = path[index];
                        visitors_map
                            .entry(span)
                            .or_default()
                            .push((*path, *visitor));
                    }
                }

                if current {
                    // Potentially skip visiting this sub tree
                    if !visitors_map.is_empty() {
                        n.visit_mut_children_with_path(
                            &mut ApplyVisitors {
                                visitors: visitors_map,
                                index,
                            },
                            ast_path,
                        );
                    }
                    for visitor in active_visitors {
                        n.visit_mut_with(&mut visitor.create());
                    }
                    return;
                } else {
                    current_visitors_map = Cow::Owned(visitors_map);
                }
            } else {
                // Skip visiting this sub tree
                return;
            }
        }
        // Ast path is unchanged, just keep visiting
        n.visit_mut_children_with_path(self, ast_path);
    }
}

macro_rules! method {
    ($name:ident,$T:ty) => {
        fn $name(&mut self, n: &mut $T, ast_path: &mut AstKindPath<AstParentKind>) {
            self.visit_if_required(n, ast_path);
        }
    };
}

impl VisitMutAstPath for ApplyVisitors<'_> {
    // TODO: we need a macro to apply that for all methods
    method!(visit_mut_url_value, UrlValue);
    method!(visit_mut_url, Url);
}
