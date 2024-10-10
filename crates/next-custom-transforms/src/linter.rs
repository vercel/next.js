use swc_core::ecma::{
    ast::{Module, Script},
    visit::{Fold, Visit},
};

pub fn linter<V>(visitor: V) -> impl Fold
where
    V: Visit,
{
    Linter { visitor }
}

struct Linter<V>
where
    V: Visit,
{
    visitor: V,
}

impl<V> Fold for Linter<V>
where
    V: Visit,
{
    #[inline(always)]
    fn fold_module(&mut self, node: Module) -> Module {
        self.visitor.visit_module(&node);
        node
    }

    #[inline(always)]
    fn fold_script(&mut self, node: Script) -> Script {
        self.visitor.visit_script(&node);
        node
    }
}
