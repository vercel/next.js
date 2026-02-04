use swc_core::ecma::{
    ast::Pass,
    visit::{visit_pass, Visit},
};

pub fn linter<V>(visitor: V) -> impl Pass
where
    V: Visit,
{
    visit_pass(visitor)
}
