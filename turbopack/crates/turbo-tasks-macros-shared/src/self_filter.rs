use syn::{visit::Visit, Block, Expr};

pub fn is_self_used(block: &Block) -> bool {
    let mut finder = SelfFinder { found: false };
    finder.visit_block(block);
    finder.found
}

struct SelfFinder {
    found: bool,
}

impl Visit<'_> for SelfFinder {
    fn visit_expr(&mut self, expr: &Expr) {
        if let Expr::Path(path) = expr {
            if path.path.is_ident("self") {
                self.found = true;
            }
        }
    }
}
