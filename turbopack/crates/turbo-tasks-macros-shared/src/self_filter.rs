use proc_macro2::TokenTree;
use quote::ToTokens;
use syn::{
    visit::{visit_expr, visit_macro, Visit},
    Block, Expr, Macro,
};

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
        if self.found {
            return;
        }

        if let Expr::Path(path) = expr {
            if path.path.is_ident("self") {
                self.found = true;
                return;
            }
        }

        visit_expr(self, expr);
    }

    fn visit_macro(&mut self, mac: &Macro) {
        if self.found {
            return;
        }

        for token in mac.tokens.to_token_stream() {
            if let TokenTree::Ident(ident) = token {
                if ident == "self" {
                    self.found = true;
                    return;
                }
            }
        }

        visit_macro(self, mac);
    }
}
