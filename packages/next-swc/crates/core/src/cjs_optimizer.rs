use turbopack_binding::swc::core::ecma::{
    ast::{Module, Script},
    visit::{
        as_folder, noop_visit_mut_type, noop_visit_type, Fold, Visit, VisitMut, VisitMutWith,
        VisitWith,
    },
};

pub fn cjs_optimizer() -> impl Fold + VisitMut {
    as_folder(Optimizer {
        data: Data::default(),
    })
}

struct Optimizer {
    data: Data,
}

struct Analyzer<'a> {
    data: &'a mut Data,
}

#[derive(Debug, Default)]
struct Data {}

impl VisitMut for Optimizer {
    fn visit_mut_module(&mut self, n: &mut Module) {
        n.visit_with(&mut Analyzer {
            data: &mut self.data,
        });

        n.visit_mut_children_with(self);
    }

    fn visit_mut_script(&mut self, n: &mut Script) {
        n.visit_with(&mut Analyzer {
            data: &mut self.data,
        });

        n.visit_mut_children_with(self);
    }

    noop_visit_mut_type!();
}

impl Visit for Analyzer<'_> {
    noop_visit_type!();
}
