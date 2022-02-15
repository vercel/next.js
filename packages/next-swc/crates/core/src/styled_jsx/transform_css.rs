use easy_error::{bail, Error};
use std::panic;
use std::sync::Arc;
use swc_common::util::take::Take;
use swc_common::SourceMap;
use swc_common::{source_map::Pos, BytePos, Span, SyntaxContext, DUMMY_SP};
use swc_css::ast::*;
use swc_css::codegen::{
    writer::basic::{BasicCssWriter, BasicCssWriterConfig},
    CodeGenerator, CodegenConfig, Emit,
};
use swc_css::parser::parser::input::ParserInput;
use swc_css::parser::{parse_str, parse_tokens, parser::ParserConfig};
use swc_css::visit::{VisitMut, VisitMutWith};
use swc_ecmascript::ast::{Expr, Str, StrKind, Tpl, TplElement};
use swc_ecmascript::parser::StringInput;
use swc_ecmascript::utils::HANDLER;
use swc_stylis::prefixer::prefixer;
use tracing::{debug, trace};

use super::{hash_string, string_literal_expr, LocalStyle};

pub fn transform_css(
    cm: Arc<SourceMap>,
    style_info: &LocalStyle,
    is_global: bool,
    class_name: &Option<String>,
) -> Result<Expr, Error> {
    debug!("CSS: \n{}", style_info.css);

    let result: Result<Stylesheet, _> = parse_str(
        &style_info.css,
        style_info.css_span.lo,
        style_info.css_span.hi,
        ParserConfig {
            allow_wrong_line_comments: true,
        },
        // We ignore errors because we inject placeholders for expressions which is
        // not a valid css.
        &mut vec![],
    );
    let mut ss = match result {
        Ok(ss) => ss,
        Err(err) => {
            HANDLER.with(|handler| {
                // Print css parsing errors
                err.to_diagnostics(&handler).emit();

                // TODO(kdy1): We may print css so the user can see the error, and report it.

                handler
                    .struct_span_err(
                        style_info.css_span,
                        "Failed to parse css in styled jsx component",
                    )
                    .note(&format!("Input to the css parser is {}", style_info.css))
                    .emit()
            });
            bail!("Failed to parse css");
        }
    };
    // ? Do we need to support optionally prefixing?
    ss.visit_mut_with(&mut prefixer());
    ss.visit_mut_with(&mut CssPlaceholderFixer { cm });
    ss.visit_mut_with(&mut Namespacer {
        class_name: match class_name {
            Some(s) => s.clone(),
            None => format!("jsx-{}", &hash_string(&style_info.hash)),
        },
        is_global,
        is_dynamic: style_info.is_dynamic,
    });

    let mut s = String::new();
    {
        let mut wr = BasicCssWriter::new(&mut s, BasicCssWriterConfig { indent: "  " });
        let mut gen = CodeGenerator::new(&mut wr, CodegenConfig { minify: true });

        gen.emit(&ss).unwrap();
    }

    if style_info.expressions.len() == 0 {
        return Ok(string_literal_expr(&s));
    }

    let mut parts: Vec<&str> = s.split("__styled-jsx-placeholder-").collect();
    let mut final_expressions = vec![];
    for i in 1..parts.len() {
        let (num_len, expression_index) = read_number(&parts[i]);
        final_expressions.push(style_info.expressions[expression_index].clone());
        let substr = &parts[i][(num_len + 2)..];
        parts[i] = substr;
    }

    Ok(Expr::Tpl(Tpl {
        quasis: parts
            .iter()
            .map(|quasi| {
                TplElement {
                    cooked: None, // ? Do we need cooked as well
                    raw: Str {
                        value: (*quasi).into(),
                        span: DUMMY_SP,
                        has_escape: false,
                        kind: StrKind::Synthesized {},
                    },
                    span: DUMMY_SP,
                    tail: false,
                }
            })
            .collect(),
        exprs: final_expressions,
        span: DUMMY_SP,
    }))
}

/// Returns `(length, value)`
fn read_number(s: &str) -> (usize, usize) {
    for (idx, c) in s.char_indices() {
        if c.is_digit(10) {
            continue;
        }

        // For 10, we reach here after `0`.
        let value = s[0..idx].parse().expect("failed to parse");

        return (idx, value);
    }

    unreachable!("read_number(`{}`) is invalid because it is empty", s)
}

/// This fixes invalid css which is created from interpolated expressions.
///
/// `__styled-jsx-placeholder-` is handled at here.
struct CssPlaceholderFixer {
    cm: Arc<SourceMap>,
}

impl VisitMut for CssPlaceholderFixer {
    fn visit_mut_media_query(&mut self, q: &mut MediaQuery) {
        q.visit_mut_children_with(self);

        match q {
            MediaQuery::Ident(q) => {
                if !q.raw.starts_with("__styled-jsx-placeholder-") {
                    return;
                }
                // We need to support both of @media ($breakPoint) {} and @media $queryString {}
                // This is complex because @media (__styled-jsx-placeholder-0__) {} is valid
                // while @media __styled-jsx-placeholder-0__ {} is not
                //
                // So we check original source code to determine if we should inject
                // parenthesis.

                // TODO(kdy1): Avoid allocation.
                // To remove allocation, we should patch swc_common to provide a way to get
                // source code without allocation.
                //
                //
                // We need
                //
                // fn with_source_code (self: &mut Self, f: impl FnOnce(&str) -> Ret) -> _ {}
                if let Ok(source) = self.cm.span_to_snippet(q.span) {
                    if source.starts_with('(') {
                        q.raw = format!("({})", &q.value).into();
                    }
                }
            }
            _ => {}
        }
    }
}

struct Namespacer {
    class_name: String,
    is_global: bool,
    is_dynamic: bool,
}

impl VisitMut for Namespacer {
    fn visit_mut_complex_selector(&mut self, node: &mut ComplexSelector) {
        #[cfg(debug_assertions)]
        let _tracing = {
            // This will add information to the log messages, only for debug build.
            // Note that we use cargo feature to remove all logging on production builds.

            let mut code = String::new();
            {
                let mut wr = BasicCssWriter::new(&mut code, BasicCssWriterConfig { indent: "  " });
                let mut gen = CodeGenerator::new(&mut wr, CodegenConfig { minify: true });

                gen.emit(&*node).unwrap();
            }

            tracing::span!(
                tracing::Level::TRACE,
                "Namespacer::visit_mut_complex_selector",
                class_name = &*self.class_name,
                is_global = self.is_global,
                is_dynamic = self.is_dynamic,
                input = &*code
            )
            .entered()
        };

        let mut new_selectors = vec![];
        let mut combinator = None;
        for sel in node.children.take() {
            match &sel {
                ComplexSelectorChildren::CompoundSelector(selector) => {
                    match self.get_transformed_selectors(combinator, selector.clone()) {
                        Ok(transformed_selectors) => new_selectors.extend(transformed_selectors),
                        Err(_) => {
                            HANDLER.with(|handler| {
                                handler
                                    .struct_span_err(
                                        selector.span,
                                        "Failed to transform one off global selector",
                                    )
                                    .emit()
                            });
                            new_selectors.push(sel);
                        }
                    }

                    combinator = None;
                }
                ComplexSelectorChildren::Combinator(v) => match v.value {
                    CombinatorValue::Descendant => {}
                    CombinatorValue::NextSibling
                    | CombinatorValue::Child
                    | CombinatorValue::LaterSibling => {
                        combinator = Some(v.clone());

                        new_selectors.push(sel);
                    }
                },
            };
        }
        node.children = new_selectors;
    }
}

impl Namespacer {
    fn get_transformed_selectors(
        &mut self,
        combinator: Option<Combinator>,
        mut node: CompoundSelector,
    ) -> Result<Vec<ComplexSelectorChildren>, Error> {
        let mut pseudo_index = None;

        let empty_tokens = Tokens {
            span: node.span,
            tokens: vec![],
        };
        let mut arg_tokens;

        for (i, selector) in node.subclass_selectors.iter().enumerate() {
            let (name, args) = match selector {
                SubclassSelector::PseudoClass(PseudoClassSelector { name, children, .. }) => {
                    match children {
                        Some(PseudoSelectorChildren::Nth(v)) => {
                            arg_tokens = nth_to_tokens(&v);
                            (name, &arg_tokens)
                        }
                        Some(PseudoSelectorChildren::Tokens(v)) => (name, v),
                        None => (name, &empty_tokens),
                    }
                }
                SubclassSelector::PseudoElement(PseudoElementSelector {
                    name, children, ..
                }) => match children {
                    Some(children) => (name, children),
                    None => (name, &empty_tokens),
                },
                _ => continue,
            };

            // One off global selector
            if &name.value == "global" {
                let block_tokens = get_block_tokens(&args);
                let mut front_tokens = get_front_selector_tokens(&args);
                let mut args = args.clone();
                front_tokens.extend(args.tokens);
                front_tokens.extend(block_tokens);
                args.tokens = front_tokens;

                let complex_selectors = panic::catch_unwind(|| {
                    let x: ComplexSelector = parse_tokens(
                        &args,
                        ParserConfig {
                            allow_wrong_line_comments: true,
                        },
                        // TODO(kdy1): We might be able to report syntax errors.
                        &mut vec![],
                    )
                    .unwrap();
                    return x;
                });

                return match complex_selectors {
                    Ok(complex_selectors) => {
                        let mut v = complex_selectors.children[1..]
                            .iter()
                            .cloned()
                            .collect::<Vec<_>>();

                        match v[0] {
                            ComplexSelectorChildren::Combinator(Combinator {
                                value: CombinatorValue::Descendant,
                                ..
                            }) => {
                                v.remove(0);
                            }
                            _ => {}
                        }

                        if v.is_empty() {
                            bail!("Failed to transform one off global selector");
                        }

                        trace!("Combinator: {:?}", combinator);
                        trace!("v[0]: {:?}", v[0]);

                        if combinator.is_some() {
                            match v.get(0) {
                                Some(ComplexSelectorChildren::Combinator(..)) => {}
                                Some(..) => {}
                                _ => {
                                    v.push(ComplexSelectorChildren::Combinator(
                                        combinator.unwrap(),
                                    ));
                                }
                            }
                        }

                        v.iter_mut().for_each(|sel| {
                            if i < node.subclass_selectors.len() {
                                match sel {
                                    ComplexSelectorChildren::CompoundSelector(sel) => {
                                        sel.subclass_selectors.extend(
                                            node.subclass_selectors[i + 1..].iter().cloned(),
                                        );
                                    }
                                    _ => {}
                                }
                            }
                        });

                        Ok(v)
                    }
                    Err(_) => bail!("Failed to transform one off global selector"),
                };
            } else if pseudo_index.is_none() {
                pseudo_index = Some(i);
            }
        }

        let subclass_selector = match self.is_dynamic {
            true => "__jsx-style-dynamic-selector",
            false => &self.class_name,
        };
        let insert_index = match pseudo_index {
            None => node.subclass_selectors.len(),
            Some(i) => i,
        };
        if !self.is_global {
            node.subclass_selectors.insert(
                insert_index,
                SubclassSelector::Class(ClassSelector {
                    span: DUMMY_SP,
                    text: Ident {
                        raw: subclass_selector.into(),
                        value: subclass_selector.into(),
                        span: DUMMY_SP,
                    },
                }),
            );
        }

        Ok(vec![ComplexSelectorChildren::CompoundSelector(node)])
    }
}

fn get_front_selector_tokens(selector_tokens: &Tokens) -> Vec<TokenAndSpan> {
    let start_pos = selector_tokens.span.lo.to_u32() - 2;
    vec![
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 0),
                hi: BytePos(start_pos + 1),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::Ident {
                raw: "a".into(),
                value: "a".into(),
            },
        },
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 1),
                hi: BytePos(start_pos + 2),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::WhiteSpace { value: " ".into() },
        },
    ]
}

fn get_block_tokens(selector_tokens: &Tokens) -> Vec<TokenAndSpan> {
    let start_pos = selector_tokens.span.hi.to_u32();
    vec![
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 0),
                hi: BytePos(start_pos + 1),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::WhiteSpace { value: " ".into() },
        },
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 1),
                hi: BytePos(start_pos + 2),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::LBrace,
        },
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 2),
                hi: BytePos(start_pos + 3),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::WhiteSpace { value: " ".into() },
        },
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 3),
                hi: BytePos(start_pos + 8),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::Ident {
                value: "color".into(),
                raw: "color".into(),
            },
        },
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 8),
                hi: BytePos(start_pos + 9),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::Colon,
        },
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 9),
                hi: BytePos(start_pos + 10),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::WhiteSpace { value: " ".into() },
        },
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 10),
                hi: BytePos(start_pos + 13),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::Ident {
                value: "red".into(),
                raw: "red".into(),
            },
        },
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 13),
                hi: BytePos(start_pos + 14),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::Semi,
        },
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 14),
                hi: BytePos(start_pos + 15),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::WhiteSpace { value: " ".into() },
        },
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 15),
                hi: BytePos(start_pos + 16),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::RBrace,
        },
        TokenAndSpan {
            span: Span {
                lo: BytePos(start_pos + 16),
                hi: BytePos(start_pos + 17),
                ctxt: SyntaxContext::empty(),
            },
            token: Token::WhiteSpace { value: " ".into() },
        },
    ]
}

fn nth_to_tokens(nth: &Nth) -> Tokens {
    let mut s = String::new();
    {
        let mut wr = BasicCssWriter::new(&mut s, BasicCssWriterConfig { indent: "  " });
        let mut gen = CodeGenerator::new(&mut wr, CodegenConfig { minify: true });

        gen.emit(&nth).unwrap();
    }

    let mut lexer = swc_css::parser::lexer::Lexer::new(
        StringInput::new(&s, nth.span.lo, nth.span.hi),
        ParserConfig {
            allow_wrong_line_comments: true,
            ..Default::default()
        },
    );

    let mut tokens = vec![];

    while let Ok(t) = lexer.next() {
        tokens.push(t);
    }

    Tokens {
        span: Span::new(nth.span.lo, nth.span.hi, Default::default()),
        tokens,
    }
}
