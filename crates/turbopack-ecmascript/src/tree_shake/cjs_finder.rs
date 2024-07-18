use swc_core::ecma::ast::*;

pub fn contains_cjs(m: &Program) -> bool {
    if let Program::Module(m) = m {
        if m.body.iter().any(|s| s.is_module_decl()) {
            return false;
        }
    }

    true
}
