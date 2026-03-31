use swc_core::ecma::{
    ast::Pass,
    visit::{Visit, visit_pass},
};

pub fn linter<V>(visitor: V) -> impl Pass
where
    V: Visit,
{
    visit_pass(visitor)
}
