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

#[cfg(test)]
mod tests {
    use rstest::rstest;

    use super::*;

    #[rstest]
    #[case::no_self_usage(r#"{ let x = 42; println!("hello"); }"#, false)]
    #[case::simple_self_usage(r#"{ self.foo(); }"#, true)]
    #[case::self_field_access(r#"{ let x = self.field; }"#, true)]
    #[case::self_in_nested_block(r#"{ let x = 1; { self.method(); } }"#, true)]
    #[case::self_in_impl_block_not_detected(
        r#"{ impl Foo { fn bar(&self) { self.baz(); } } }"#,
        false
    )]
    #[case::self_before_impl_block(
        r#"{ self.foo(); impl Bar { fn baz(&self) { self.qux(); } } }"#,
        true
    )]
    #[case::self_in_closure(r#"{ let f = || { self.method(); }; }"#, true)]
    #[case::self_in_if_condition(r#"{ if self.check() { println!("true"); } }"#, true)]
    #[case::self_in_match_arm(r#"{ match x { Some(_) => self.handle(), None => {}, } }"#, true)]
    #[case::self_in_macro(r#"{ println!("{:?}", self); }"#, true)]
    #[case::self_in_complex_macro(r#"{ format!("value: {}", self.field); }"#, true)]
    #[case::no_self_with_similar_idents(r#"{ let myself = 42; let selfish = true; }"#, false)]
    #[case::empty_block(r#"{}"#, false)]
    #[case::self_in_return_statement(r#"{ return self.value; }"#, true)]
    #[case::self_as_function_argument(r#"{ some_function(self); }"#, true)]
    fn test_is_self_used(#[case] code: &str, #[case] expected: bool) {
        let block: syn::Block = syn::parse_str(code).unwrap();
        let result = is_self_used(&block);
        assert_eq!(result, expected);
    }
}
