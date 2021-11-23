//! Minimalize AST for webpack.
//!
//! This code lives at `napi` crate because it's not used by wasm.

use swc_ecmascript::visit::{noop_visit_mut_type, VisitMut};

pub fn ast_minimalizer() -> impl VisitMut {
    Minimalizer
}

struct Minimalizer;

impl VisitMut for Minimalizer {
    noop_visit_mut_type!();
}
