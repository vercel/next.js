use proc_macro2::TokenTree;
use quote::ToTokens;
use syn::visit::{Visit, visit_block, visit_expr, visit_item, visit_macro};

pub fn is_self_used(block: &syn::Block) -> bool {
    let mut finder = SelfFinder { found: false };
    finder.visit_block(block);
    finder.found
}

struct SelfFinder {
    found: bool,
}

impl Visit<'_> for SelfFinder {
    fn visit_block(&mut self, n: &syn::Block) {
        if self.found {
            return;
        }

        visit_block(self, n);
    }

    fn visit_expr(&mut self, expr: &syn::Expr) {
        if self.found {
            return;
        }

        if let syn::Expr::Path(path) = expr
            && path.path.is_ident("self")
        {
            self.found = true;
            return;
        }

        visit_expr(self, expr);
    }

    fn visit_item(&mut self, n: &syn::Item) {
        if self.found {
            return;
        }

        visit_item(self, n);
    }

    fn visit_item_impl(&mut self, _: &syn::ItemImpl) {
        // skip children of `impl`: the definition of "self" inside of an impl is different than the
        // parent scope's definition of "self"
    }

    fn visit_macro(&mut self, mac: &syn::Macro) {
        if self.found {
            return;
        }

        for token in mac.tokens.to_token_stream() {
            if contains_self_token(&token) {
                self.found = true;
                return;
            }
        }

        visit_macro(self, mac);
    }
}

fn contains_self_token(tok: &TokenTree) -> bool {
    match tok {
        TokenTree::Group(group) => {
            for token in group.stream() {
                if contains_self_token(&token) {
                    return true;
                }
            }
            false
        }
        TokenTree::Ident(ident) => ident == "self",
        TokenTree::Punct(..) | TokenTree::Literal(..) => false,
    }
}
