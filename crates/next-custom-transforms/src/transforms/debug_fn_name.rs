use swc_core::ecma::visit::{as_folder, Fold, VisitMut};

pub fn debug_fn_name() -> impl VisitMut + Fold {
    as_folder(DebugFnName)
}

struct DebugFnName {}

impl VisitMut for DebugFnName {}
